-- LEOGO System Diagnosis Phase 3
-- Controlled repair framework: affected-record drilldown, single-check verification,
-- allowlisted safe repairs, immutable repair snapshots, and repair history.
-- No generic SQL executor is exposed.

create table if not exists private.system_diagnostic_repairs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  check_id text not null,
  target_key text not null,
  repair_action text not null,
  risk_level text not null check (risk_level in ('low','medium','high')),
  repair_mode text not null check (repair_mode in ('safe','review_required','manual_only')),
  result_status text not null check (result_status in ('applied','failed')),
  before_data jsonb,
  after_data jsonb,
  verification_data jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

alter table private.system_diagnostic_repairs enable row level security;
revoke all on table private.system_diagnostic_repairs from public,anon,authenticated;
create index if not exists system_diagnostic_repairs_created_idx
  on private.system_diagnostic_repairs(created_at desc);
create index if not exists system_diagnostic_repairs_check_idx
  on private.system_diagnostic_repairs(check_id,created_at desc);

create or replace function private.system_diagnostic_repair_policy(p_check_id text)
returns jsonb
language sql
immutable
set search_path=''
as $function$
  select case
    when p_check_id='runtime.live_errors' then jsonb_build_object(
      'repair_mode','safe','risk_level','low',
      'allowed_actions',jsonb_build_array('resolve_runtime_issue'),
      'message','A runtime issue may be marked resolved after the affected function/page has been verified. If it occurs again, Live Monitoring reopens it.'
    )
    when p_check_id='premium.membership_dates' then jsonb_build_object(
      'repair_mode','safe','risk_level','low',
      'allowed_actions',jsonb_build_array('expire_membership'),
      'message','Only an active membership whose ends_at time has already passed can be synchronized to expired. Missing/invalid dates remain review-only.'
    )
    when p_check_id in (
      'products.variant_integrity','products.main_images','products.seller_links',
      'products.customer_visibility_chain','products.review_moderation_chain',
      'services.provider_links','transport.provider_links',
      'transport.pickup_station_sequence','services.request_sequence','transport.request_sequence',
      'accommodation.unit_links','accommodation.booking_links','cyber.provider_links',
      'notifications.email_failures','notifications.sender_config',
      'storage.required_buckets','storage.private_bucket_exposure'
    ) then jsonb_build_object(
      'repair_mode','review_required','risk_level','medium',
      'allowed_actions','[]'::jsonb,
      'message','Evidence can be inspected here, but the correction must be reviewed in the affected module before any data change.'
    )
    else jsonb_build_object(
      'repair_mode','manual_only','risk_level','high',
      'allowed_actions','[]'::jsonb,
      'message','This finding can affect security, authentication, payments, orders, Rider history, Wallet accounting, or structural data. Phase 3 will not auto-repair it.'
    )
  end;
$function$;

revoke execute on function private.system_diagnostic_repair_policy(text)
  from public,anon,authenticated;

create or replace function private.system_diagnostic_finding_data(
  p_check_id text,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),100));
  v_count bigint:=0;
  v_records jsonb:='[]'::jsonb;
  v_tables text[];
  v_functions text[];
  v_buckets text[];
begin
  if not private.is_leogo_super_admin() then
    raise exception 'Super Admin access required';
  end if;

  case p_check_id
    when 'core.super_admin' then
      select case when count(*)>=1 then 0 else 1 end into v_count
      from public.admin_users where role='super_admin' and status='active';
      if v_count>0 then
        v_records:=jsonb_build_array(jsonb_build_object(
          'target_key','super_admin','issue','No active Super Admin account'
        ));
      end if;

    when 'database.critical_tables' then
      v_tables:=array[
        'admin_users','leogo_staff','customer_profiles','seller_accounts','seller_products',
        'seller_product_variants','marketplace_orders','marketplace_order_items',
        'marketplace_seller_orders','marketplace_delivery_jobs','payment_accounts',
        'payment_account_assignments','order_email_outbox','customer_notifications',
        'partner_notifications','service_provider_accounts','service_provider_services',
        'transport_provider_accounts','transport_provider_vehicles','wallet_accounts',
        'wallet_ledger_entries','premium_profiles','premium_profile_details',
        'premium_identity_details','accommodation_properties','accommodation_units',
        'cyber_provider_accounts','cyber_services','pickup_stations','product_shipping_profiles',
        'group_order_campaigns','group_order_participations'
      ];
      select count(*),
             coalesce(jsonb_agg(jsonb_build_object(
               'target_key',t,'table_name',t,'issue','Missing required table'
             ) order by t),'[]'::jsonb)
      into v_count,v_records
      from unnest(v_tables) t
      where to_regclass('public.'||t) is null;

    when 'database.critical_rpcs' then
      v_functions:=array[
        'admin_production_dashboard','admin_list_approval_queue','admin_list_staff_directory',
        'admin_staff_role_presets','admin_update_staff_access','admin_record_security_event',
        'admin_get_email_notification_settings','admin_list_marketplace_orders'
      ];
      select count(*),
             coalesce(jsonb_agg(jsonb_build_object(
               'target_key',f,'function_name',f,'issue','Missing required RPC'
             ) order by f),'[]'::jsonb)
      into v_count,v_records
      from unnest(v_functions) f
      where not exists(
        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname=f
      );

    when 'security.anon_admin_functions' then
      select count(*) into v_count
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prosecdef and p.proname like 'admin_%'
        and has_function_privilege('anon',p.oid,'EXECUTE');
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select p.proname as target_key,p.proname as function_name,
               pg_get_function_identity_arguments(p.oid) as arguments
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.prosecdef and p.proname like 'admin_%'
          and has_function_privilege('anon',p.oid,'EXECUTE')
        order by p.proname limit v_limit
      ) x;

    when 'security.public_rls' then
      select count(*) into v_count
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and c.relrowsecurity=false;
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select c.relname as target_key,c.relname as table_name,'RLS disabled' as issue
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r' and c.relrowsecurity=false
        order by c.relname limit v_limit
      ) x;

    when 'storage.required_buckets' then
      v_buckets:=array[
        'seller-product-media','seller-verification','staff-private-documents',
        'service-provider-public-media','service-provider-verification',
        'transport-public-media','transport-driver-private','transport-verification',
        'premium-profile-media','premium-verification','accommodation-public-media',
        'accommodation-verification','cyber-public-media','cyber-verification'
      ];
      select count(*),
             coalesce(jsonb_agg(jsonb_build_object(
               'target_key',b,'bucket',b,'issue','Missing required bucket'
             ) order by b),'[]'::jsonb)
      into v_count,v_records
      from unnest(v_buckets) b
      where not exists(select 1 from storage.buckets sb where sb.id=b);

    when 'storage.private_bucket_exposure' then
      select count(*) into v_count
      from storage.buckets
      where id in (
        'seller-verification','staff-private-documents','service-provider-verification',
        'transport-driver-private','transport-verification','premium-verification',
        'accommodation-verification','cyber-verification'
      ) and public=true;
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select id as target_key,id as bucket,public as is_public
        from storage.buckets
        where id in (
          'seller-verification','staff-private-documents','service-provider-verification',
          'transport-driver-private','transport-verification','premium-verification',
          'accommodation-verification','cyber-verification'
        ) and public=true
        order by id limit v_limit
      ) x;

    when 'auth_staff.admin_auth_links' then
      select count(*) into v_count
      from public.admin_users a left join auth.users u on u.id=a.user_id
      where u.id is null;
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select a.user_id::text as target_key,a.user_id,a.display_name,a.role,a.status
        from public.admin_users a left join auth.users u on u.id=a.user_id
        where u.id is null order by a.created_at desc limit v_limit
      ) x;

    when 'auth_staff.staff_auth_links' then
      select count(*) into v_count
      from public.leogo_staff s left join auth.users u on u.id=s.user_id
      where u.id is null;
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select s.user_id::text as target_key,s.user_id,s.display_name,s.staff_role,s.status
        from public.leogo_staff s left join auth.users u on u.id=s.user_id
        where u.id is null order by s.created_at desc limit v_limit
      ) x;

    when 'payments.assignment_integrity' then
      select count(*) into v_count
      from public.payment_account_assignments a
      left join public.payment_accounts p on p.id=a.account_id
      where p.id is null or p.status is distinct from 'active';
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select a.function_code as target_key,a.function_code,a.account_id,
               p.display_name as account_name,p.account_type,p.status as account_status
        from public.payment_account_assignments a
        left join public.payment_accounts p on p.id=a.account_id
        where p.id is null or p.status is distinct from 'active'
        order by a.function_code limit v_limit
      ) x;

    when 'notifications.email_failures' then
      select count(*) into v_count
      from public.order_email_outbox e
      where e.sent_at is null and e.status in ('failed','configuration_required')
        and (
          e.event_key not like 'admin_test_%'
          or e.updated_at > coalesce(
            (select max(s.sent_at) from public.order_email_outbox s
             where s.event_key like 'admin_test_%' and s.status='sent' and s.sent_at is not null),
            '-infinity'::timestamptz
          )
        );
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select e.id::text as target_key,e.id,e.event_key,e.status,e.attempt_count,
               e.last_attempt_at,left(coalesce(e.last_error,''),240) as last_error
        from public.order_email_outbox e
        where e.sent_at is null and e.status in ('failed','configuration_required')
          and (
            e.event_key not like 'admin_test_%'
            or e.updated_at > coalesce(
              (select max(s.sent_at) from public.order_email_outbox s
               where s.event_key like 'admin_test_%' and s.status='sent' and s.sent_at is not null),
              '-infinity'::timestamptz
            )
          )
        order by e.updated_at desc limit v_limit
      ) x;

    when 'notifications.sender_config' then
      select count(*) into v_count
      from public.email_notification_settings s
      where s.enabled=true
        and (
          nullif(btrim(coalesce(s.provider,'')),'') is null
          or nullif(btrim(coalesce(s.sender_name,'')),'') is null
          or nullif(btrim(coalesce(s.sender_email,'')),'') is null
          or s.app_password_secret_id is null
        );
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select s.id::text as target_key,s.id,s.enabled,s.provider,
               (nullif(btrim(coalesce(s.sender_name,'')),'') is null) as missing_sender_name,
               (nullif(btrim(coalesce(s.sender_email,'')),'') is null) as missing_sender_email,
               (s.app_password_secret_id is null) as missing_app_password
        from public.email_notification_settings s
        where s.enabled=true
          and (
            nullif(btrim(coalesce(s.provider,'')),'') is null
            or nullif(btrim(coalesce(s.sender_name,'')),'') is null
            or nullif(btrim(coalesce(s.sender_email,'')),'') is null
            or s.app_password_secret_id is null
          )
        order by s.updated_at desc limit v_limit
      ) x;

    when 'orders.orphan_items' then
      select count(*) into v_count
      from public.marketplace_order_items i
      left join public.marketplace_orders o on o.id=i.order_id
      where o.id is null;
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select i.id::text as target_key,i.id,i.order_id,i.product_id,i.product_name,i.created_at
        from public.marketplace_order_items i
        left join public.marketplace_orders o on o.id=i.order_id
        where o.id is null order by i.created_at desc limit v_limit
      ) x;

    when 'orders.subtotal_consistency' then
      select count(*) into v_count
      from public.marketplace_orders o
      where abs(coalesce(o.items_subtotal_kes,0)-coalesce((
        select sum(i.line_total_kes) from public.marketplace_order_items i where i.order_id=o.id
      ),0))>0.01;
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select o.id::text as target_key,o.id,o.order_reference,o.items_subtotal_kes as stored_subtotal_kes,
               coalesce((select sum(i.line_total_kes) from public.marketplace_order_items i where i.order_id=o.id),0) as item_total_kes,
               o.payment_status,o.order_status
        from public.marketplace_orders o
        where abs(coalesce(o.items_subtotal_kes,0)-coalesce((
          select sum(i.line_total_kes) from public.marketplace_order_items i where i.order_id=o.id
        ),0))>0.01
        order by o.created_at desc limit v_limit
      ) x;

    when 'orders.orphan_seller_orders' then
      select count(*) into v_count
      from public.marketplace_seller_orders s
      left join public.marketplace_orders o on o.id=s.order_id
      where o.id is null;
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select s.id::text as target_key,s.id,s.order_id,s.seller_id,s.fulfilment_status,s.updated_at
        from public.marketplace_seller_orders s
        left join public.marketplace_orders o on o.id=s.order_id
        where o.id is null order by s.updated_at desc limit v_limit
      ) x;

    when 'orders.delivery_order_links' then
      select count(*) into v_count
      from public.marketplace_delivery_jobs d
      left join public.marketplace_orders o on o.id=d.order_id
      where o.id is null;
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select d.id::text as target_key,d.id,d.order_id,d.rider_id,d.status,d.updated_at
        from public.marketplace_delivery_jobs d
        left join public.marketplace_orders o on o.id=d.order_id
        where o.id is null order by d.updated_at desc limit v_limit
      ) x;

    when 'orders.delivery_rider_links' then
      select count(*) into v_count
      from public.marketplace_delivery_jobs d
      left join public.leogo_staff r on r.user_id=d.rider_id
      where d.rider_id is not null
        and (r.user_id is null or r.status<>'active' or r.staff_role<>'rider');
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select d.id::text as target_key,d.id,d.order_id,d.rider_id,d.status,
               r.display_name as rider_name,r.staff_role,r.status as rider_status
        from public.marketplace_delivery_jobs d
        left join public.leogo_staff r on r.user_id=d.rider_id
        where d.rider_id is not null
          and (r.user_id is null or r.status<>'active' or r.staff_role<>'rider')
        order by d.updated_at desc limit v_limit
      ) x;

    when 'products.seller_links' then
      select count(*) into v_count
      from public.seller_products p left join public.seller_accounts s on s.user_id=p.seller_id
      where s.user_id is null;
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select p.id::text as target_key,p.id,p.product_name,p.seller_id,
               p.product_approval_status,p.listing_status
        from public.seller_products p left join public.seller_accounts s on s.user_id=p.seller_id
        where s.user_id is null order by p.updated_at desc limit v_limit
      ) x;

    when 'products.variant_integrity' then
      select count(*) into v_count
      from public.seller_products p
      where p.product_approval_status='approved' and p.has_variants=true
        and not exists(
          select 1 from public.seller_product_variants v
          where v.product_id=p.id and v.is_active=true
        );
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select p.id::text as target_key,p.id,p.product_name,p.seller_id,
               p.product_approval_status,p.listing_status,p.has_variants
        from public.seller_products p
        where p.product_approval_status='approved' and p.has_variants=true
          and not exists(
            select 1 from public.seller_product_variants v
            where v.product_id=p.id and v.is_active=true
          )
        order by p.updated_at desc limit v_limit
      ) x;

    when 'products.main_images' then
      select count(*) into v_count
      from public.seller_products p
      where p.product_approval_status='approved'
        and nullif(btrim(coalesce(p.main_image_path,'')),'') is null;
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select p.id::text as target_key,p.id,p.product_name,p.seller_id,
               p.product_approval_status,p.listing_status
        from public.seller_products p
        where p.product_approval_status='approved'
          and nullif(btrim(coalesce(p.main_image_path,'')),'') is null
        order by p.updated_at desc limit v_limit
      ) x;

    when 'services.provider_links' then
      select count(*) into v_count
      from public.service_provider_services s
      left join public.service_provider_accounts p on p.user_id=s.provider_id
      where p.user_id is null;
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select s.id::text as target_key,s.id,s.service_name,s.provider_id,
               s.approval_status,s.is_available
        from public.service_provider_services s
        left join public.service_provider_accounts p on p.user_id=s.provider_id
        where p.user_id is null order by s.updated_at desc limit v_limit
      ) x;

    when 'transport.provider_links' then
      select count(*) into v_count
      from public.transport_provider_vehicles v
      left join public.transport_provider_accounts p on p.user_id=v.provider_id
      where p.user_id is null;
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select v.id::text as target_key,v.id,v.provider_id,v.vehicle_type,
               v.approval_status,v.is_available
        from public.transport_provider_vehicles v
        left join public.transport_provider_accounts p on p.user_id=v.provider_id
        where p.user_id is null order by v.updated_at desc limit v_limit
      ) x;

    when 'wallet.ledger_links' then
      select count(*) into v_count
      from public.wallet_ledger_entries l
      left join public.wallet_accounts a on a.user_id=l.user_id
      where a.user_id is null;
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select l.id::text as target_key,l.id,l.user_id,l.entry_type,l.direction,
               l.amount_kes,l.created_at
        from public.wallet_ledger_entries l
        left join public.wallet_accounts a on a.user_id=l.user_id
        where a.user_id is null order by l.created_at desc limit v_limit
      ) x;

    when 'premium.profile_details' then
      select count(*) into v_count
      from public.premium_profiles p
      left join public.premium_profile_details d on d.user_id=p.user_id
      left join public.premium_identity_details i on i.user_id=p.user_id
      where d.user_id is null or i.user_id is null;
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select p.user_id::text as target_key,p.user_id,p.display_name,p.application_status,
               (d.user_id is null) as missing_profile_details,
               (i.user_id is null) as missing_identity_details
        from public.premium_profiles p
        left join public.premium_profile_details d on d.user_id=p.user_id
        left join public.premium_identity_details i on i.user_id=p.user_id
        where d.user_id is null or i.user_id is null
        order by p.updated_at desc limit v_limit
      ) x;

    when 'accommodation.unit_links' then
      select count(*) into v_count
      from public.accommodation_units u
      left join public.accommodation_properties p on p.id=u.property_id
      where p.id is null;
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select u.id::text as target_key,u.id,u.unit_name,u.property_id,
               u.approval_status,u.is_active
        from public.accommodation_units u
        left join public.accommodation_properties p on p.id=u.property_id
        where p.id is null order by u.updated_at desc limit v_limit
      ) x;

    when 'cyber.provider_links' then
      select count(*) into v_count
      from public.cyber_services s
      left join public.cyber_provider_accounts p on p.user_id=s.provider_id
      where p.user_id is null;
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select s.id::text as target_key,s.id,s.service_name,s.provider_id,
               s.approval_status,s.is_available
        from public.cyber_services s
        left join public.cyber_provider_accounts p on p.user_id=s.provider_id
        where p.user_id is null order by s.updated_at desc limit v_limit
      ) x;

    when 'runtime.live_errors' then
      select count(*) into v_count
      from private.system_runtime_issues i
      where i.status not in ('resolved','ignored')
        and i.last_seen>=now()-interval '24 hours'
        and (i.error_type is distinct from 'connectivity_error' or i.event_count>=3);
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select i.fingerprint as target_key,i.portal,i.module,i.error_type,i.severity,
               i.status,i.title,i.operation,i.event_count,i.first_seen,i.last_seen,
               case when i.status not in ('resolved','ignored')
                    then 'resolve_runtime_issue' else null end as repair_action,
               case when i.status not in ('resolved','ignored')
                    then true else false end as repairable
        from private.system_runtime_issues i
        where i.status not in ('resolved','ignored')
          and i.last_seen>=now()-interval '24 hours'
          and (i.error_type is distinct from 'connectivity_error' or i.event_count>=3)
        order by case i.severity when 'critical' then 0 else 1 end,i.last_seen desc
        limit v_limit
      ) x;

    when 'products.customer_visibility_chain' then
      select count(*) into v_count
      from public.seller_products p
      left join public.seller_accounts s on s.user_id=p.seller_id
      where p.listing_status='active'
        and (
          p.product_approval_status is distinct from 'approved'
          or s.user_id is null
          or s.application_status is distinct from 'approved'
        );
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select p.id::text as target_key,p.id,p.product_name,p.seller_id,
               p.product_approval_status,p.listing_status,
               s.application_status as seller_application_status
        from public.seller_products p
        left join public.seller_accounts s on s.user_id=p.seller_id
        where p.listing_status='active'
          and (
            p.product_approval_status is distinct from 'approved'
            or s.user_id is null
            or s.application_status is distinct from 'approved'
          )
        order by p.updated_at desc limit v_limit
      ) x;

    when 'products.review_moderation_chain' then
      select
        (select count(*) from public.marketplace_product_reviews r
         where r.moderation_status='approved' and (r.reviewed_at is null or r.reviewed_by is null))
        +(select count(*) from public.marketplace_order_reviews r
         where r.moderation_status='approved' and (r.reviewed_at is null or r.reviewed_by is null))
        +(select count(*) from public.partner_service_reviews r
         where r.moderation_status='approved' and (r.reviewed_at is null or r.reviewed_by is null))
      into v_count;
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select * from (
          select 'product_review'::text as record_type,r.id::text as target_key,r.id,
                 r.moderation_status,r.reviewed_at,r.reviewed_by,r.created_at
          from public.marketplace_product_reviews r
          where r.moderation_status='approved' and (r.reviewed_at is null or r.reviewed_by is null)
          union all
          select 'order_review',r.id::text,r.id,r.moderation_status,r.reviewed_at,r.reviewed_by,r.created_at
          from public.marketplace_order_reviews r
          where r.moderation_status='approved' and (r.reviewed_at is null or r.reviewed_by is null)
          union all
          select 'service_review',r.id::text,r.id,r.moderation_status,r.reviewed_at,r.reviewed_by,r.created_at
          from public.partner_service_reviews r
          where r.moderation_status='approved' and (r.reviewed_at is null or r.reviewed_by is null)
        ) y order by created_at desc limit v_limit
      ) x;

    when 'orders.workflow_sequence' then
      select
        (select count(*) from public.marketplace_orders o
         where o.order_status='with_rider'
           and not exists(select 1 from public.marketplace_delivery_jobs d where d.order_id=o.id))
        +(select count(*) from public.marketplace_orders o
         where o.order_status='delivered' and o.delivered_at is null)
        +(select count(*) from public.marketplace_seller_orders s
         where s.fulfilment_status='handed_to_rider' and s.handed_to_rider_at is null)
        +(select count(*) from public.marketplace_delivery_jobs d
         where d.status='delivered' and d.delivered_at is null)
      into v_count;
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select * from (
          select 'order_with_rider_missing_job'::text as issue_type,o.id::text as target_key,
                 o.id,o.order_reference,o.order_status,null::uuid as related_id,o.updated_at
          from public.marketplace_orders o
          where o.order_status='with_rider'
            and not exists(select 1 from public.marketplace_delivery_jobs d where d.order_id=o.id)
          union all
          select 'delivered_order_missing_timestamp',o.id::text,o.id,o.order_reference,o.order_status,null::uuid,o.updated_at
          from public.marketplace_orders o
          where o.order_status='delivered' and o.delivered_at is null
          union all
          select 'seller_handoff_missing_timestamp',s.id::text,s.order_id,null::text,s.fulfilment_status,s.id,s.updated_at
          from public.marketplace_seller_orders s
          where s.fulfilment_status='handed_to_rider' and s.handed_to_rider_at is null
          union all
          select 'delivery_missing_timestamp',d.id::text,d.order_id,null::text,d.status,d.id,d.updated_at
          from public.marketplace_delivery_jobs d
          where d.status='delivered' and d.delivered_at is null
        ) y order by updated_at desc limit v_limit
      ) x;

    when 'transport.pickup_station_sequence' then
      select count(*) into v_count
      from public.pickup_station_parcels p
      where (p.status='received' and p.received_at is null)
         or (p.status='handed_over' and p.handed_over_at is null)
         or (p.status='arrived_pending_receipt' and p.arrived_at is null);
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select p.id::text as target_key,p.id,p.order_id,p.parcel_reference,p.status,
               p.arrived_at,p.received_at,p.handed_over_at,p.updated_at
        from public.pickup_station_parcels p
        where (p.status='received' and p.received_at is null)
           or (p.status='handed_over' and p.handed_over_at is null)
           or (p.status='arrived_pending_receipt' and p.arrived_at is null)
        order by p.updated_at desc limit v_limit
      ) x;

    when 'services.request_sequence' then
      select count(*) into v_count
      from public.service_requests r
      where (r.request_status='completed' and r.completed_at is null)
         or (r.request_status='in_progress' and r.started_at is null)
         or (r.request_status='quoted' and (r.quoted_at is null or r.provider_quote_kes is null));
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select r.id::text as target_key,r.id,r.request_reference,r.provider_id,r.request_status,
               r.quoted_at,r.provider_quote_kes,r.started_at,r.completed_at,r.updated_at
        from public.service_requests r
        where (r.request_status='completed' and r.completed_at is null)
           or (r.request_status='in_progress' and r.started_at is null)
           or (r.request_status='quoted' and (r.quoted_at is null or r.provider_quote_kes is null))
        order by r.updated_at desc limit v_limit
      ) x;

    when 'transport.request_sequence' then
      select count(*) into v_count
      from public.transport_requests r
      where (r.request_status='completed' and r.completed_at is null)
         or (r.request_status='in_transit' and r.in_transit_at is null)
         or (r.request_status='picked_up' and r.picked_up_at is null)
         or (r.request_status='quoted' and (r.quoted_at is null or r.provider_quote_kes is null));
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select r.id::text as target_key,r.id,r.request_reference,
               coalesce(r.assigned_provider_id,r.requested_provider_id) as provider_id,
               r.request_status,r.quoted_at,r.provider_quote_kes,r.picked_up_at,
               r.in_transit_at,r.completed_at,r.updated_at
        from public.transport_requests r
        where (r.request_status='completed' and r.completed_at is null)
           or (r.request_status='in_transit' and r.in_transit_at is null)
           or (r.request_status='picked_up' and r.picked_up_at is null)
           or (r.request_status='quoted' and (r.quoted_at is null or r.provider_quote_kes is null))
        order by r.updated_at desc limit v_limit
      ) x;

    when 'wallet.confirmed_deposit_ledger' then
      select count(*) into v_count
      from public.wallet_deposit_requests d
      where d.request_status='confirmed'
        and not exists(select 1 from public.wallet_ledger_entries l where l.deposit_request_id=d.id);
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select d.id::text as target_key,d.id,d.user_id,d.deposit_kind,d.requested_amount_kes,
               d.request_status,d.submitted_at,d.reviewed_at
        from public.wallet_deposit_requests d
        where d.request_status='confirmed'
          and not exists(select 1 from public.wallet_ledger_entries l where l.deposit_request_id=d.id)
        order by d.reviewed_at desc nulls last limit v_limit
      ) x;

    when 'premium.membership_dates' then
      select count(*) into v_count
      from public.premium_memberships m
      where m.membership_status='active'
        and (m.starts_at is null or m.ends_at is null or m.ends_at<=now());
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select m.user_id::text as target_key,m.user_id,m.plan_id,m.membership_status,
               m.starts_at,m.ends_at,m.updated_at,
               case when m.ends_at is not null and m.ends_at<=now()
                    then true else false end as repairable,
               case when m.ends_at is not null and m.ends_at<=now()
                    then 'expire_membership' else null end as repair_action
        from public.premium_memberships m
        where m.membership_status='active'
          and (m.starts_at is null or m.ends_at is null or m.ends_at<=now())
        order by m.updated_at desc limit v_limit
      ) x;

    when 'accommodation.booking_links' then
      select count(*) into v_count
      from public.accommodation_bookings b
      left join public.accommodation_properties p on p.id=b.property_id
      left join public.accommodation_units u on u.id=b.unit_id
      where p.id is null or u.id is null or u.property_id is distinct from b.property_id;
      select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_records
      from (
        select b.id::text as target_key,b.id,b.booking_reference,b.property_id,b.unit_id,
               b.booking_status,b.created_at
        from public.accommodation_bookings b
        left join public.accommodation_properties p on p.id=b.property_id
        left join public.accommodation_units u on u.id=b.unit_id
        where p.id is null or u.id is null or u.property_id is distinct from b.property_id
        order by b.created_at desc limit v_limit
      ) x;

    else
      return jsonb_build_object(
        'ok',false,'message','Unsupported diagnostic check.','check_id',p_check_id
      );
  end case;

  return jsonb_build_object(
    'ok',true,
    'check_id',p_check_id,
    'affected_count',v_count,
    'records',coalesce(v_records,'[]'::jsonb),
    'policy',private.system_diagnostic_repair_policy(p_check_id)
  );
end;
$function$;

revoke execute on function private.system_diagnostic_finding_data(text,integer)
  from public,anon,authenticated;

create or replace function public.admin_diagnostic_finding_details(
  p_check_id text,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_data jsonb;
  v_meta jsonb;
begin
  if not private.is_leogo_super_admin() then
    raise exception 'Super Admin access required';
  end if;

  v_data:=private.system_diagnostic_finding_data(btrim(coalesce(p_check_id,'')),p_limit);
  if coalesce((v_data->>'ok')::boolean,false)=false then
    return v_data;
  end if;

  select e.value into v_meta
  from private.system_diagnostic_runs r
  cross join lateral jsonb_array_elements(r.checks) e(value)
  where e.value->>'id'=p_check_id
  order by r.created_at desc
  limit 1;

  return v_data||jsonb_build_object(
    'title',coalesce(v_meta->>'title',p_check_id),
    'module',coalesce(v_meta->>'module','system'),
    'last_status',coalesce(v_meta->>'status','unknown'),
    'suggested_repair',coalesce(v_meta->>'suggested_repair','Review the affected module.')
  );
end;
$function$;

revoke execute on function public.admin_diagnostic_finding_details(text,integer)
  from public,anon;
grant execute on function public.admin_diagnostic_finding_details(text,integer)
  to authenticated;

create or replace function public.admin_verify_system_diagnostic_check(
  p_pin text,
  p_check_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_verify jsonb;
  v_data jsonb;
  v_healthy boolean;
begin
  if not private.is_leogo_super_admin() then
    raise exception 'Super Admin access required';
  end if;

  v_verify:=private.verify_system_diagnostics_pin(p_pin);
  if coalesce((v_verify->>'ok')::boolean,false)=false then
    return v_verify;
  end if;

  v_data:=private.system_diagnostic_finding_data(btrim(coalesce(p_check_id,'')),50);
  if coalesce((v_data->>'ok')::boolean,false)=false then
    return v_data;
  end if;

  v_healthy:=coalesce((v_data->>'affected_count')::bigint,0)=0;

  perform private.write_admin_audit(
    'system_diagnostics.verify_check',
    'system_diagnostic_check',
    p_check_id,
    null,
    jsonb_build_object(
      'healthy',v_healthy,
      'affected_count',(v_data->>'affected_count')::bigint
    ),
    jsonb_build_object('phase',3)
  );

  return jsonb_build_object(
    'ok',true,
    'check_id',p_check_id,
    'healthy',v_healthy,
    'affected_count',(v_data->>'affected_count')::bigint,
    'verified_at',now(),
    'records',v_data->'records',
    'policy',v_data->'policy'
  );
end;
$function$;

revoke execute on function public.admin_verify_system_diagnostic_check(text,text)
  from public,anon;
grant execute on function public.admin_verify_system_diagnostic_check(text,text)
  to authenticated;

create or replace function public.admin_apply_system_diagnostic_repair(
  p_pin text,
  p_check_id text,
  p_target_key text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_verify jsonb;
  v_policy jsonb;
  v_before jsonb;
  v_after jsonb;
  v_verification jsonb;
  v_repair_id uuid:=gen_random_uuid();
  v_target_uuid uuid;
  v_affected bigint:=0;
begin
  if not private.is_leogo_super_admin() then
    raise exception 'Super Admin access required';
  end if;

  v_verify:=private.verify_system_diagnostics_pin(p_pin);
  if coalesce((v_verify->>'ok')::boolean,false)=false then
    return v_verify;
  end if;

  v_policy:=private.system_diagnostic_repair_policy(p_check_id);
  if v_policy->>'repair_mode'<>'safe' then
    return jsonb_build_object(
      'ok',false,'reason','not_safe',
      'message','This diagnostic finding is not approved for automated repair in Phase 3.'
    );
  end if;

  if p_check_id='runtime.live_errors' and p_action='resolve_runtime_issue' then
    select jsonb_build_object(
      'fingerprint',i.fingerprint,'portal',i.portal,'module',i.module,
      'error_type',i.error_type,'severity',i.severity,'status',i.status,
      'operation',i.operation,'event_count',i.event_count,'last_seen',i.last_seen
    )
    into v_before
    from private.system_runtime_issues i
    where i.fingerprint=p_target_key
      and i.status not in ('resolved','ignored')
    for update;

    if v_before is null then
      return jsonb_build_object('ok',false,'message','The runtime issue is already resolved or no longer exists.');
    end if;

    update private.system_runtime_issues
    set status='resolved',resolved_at=now(),resolved_by=(select auth.uid()),updated_at=now()
    where fingerprint=p_target_key;

    select jsonb_build_object(
      'fingerprint',i.fingerprint,'portal',i.portal,'module',i.module,
      'error_type',i.error_type,'severity',i.severity,'status',i.status,
      'operation',i.operation,'event_count',i.event_count,'last_seen',i.last_seen,
      'resolved_at',i.resolved_at
    )
    into v_after
    from private.system_runtime_issues i
    where i.fingerprint=p_target_key;

  elsif p_check_id='premium.membership_dates' and p_action='expire_membership' then
    begin
      v_target_uuid:=p_target_key::uuid;
    exception when others then
      return jsonb_build_object('ok',false,'message','Invalid Premium membership target.');
    end;

    select jsonb_build_object(
      'user_id',m.user_id,'plan_id',m.plan_id,'membership_status',m.membership_status,
      'starts_at',m.starts_at,'ends_at',m.ends_at,'updated_at',m.updated_at
    )
    into v_before
    from public.premium_memberships m
    where m.user_id=v_target_uuid
      and m.membership_status='active'
      and m.ends_at is not null
      and m.ends_at<=now()
    for update;

    if v_before is null then
      return jsonb_build_object(
        'ok',false,
        'message','Only an already-ended active Premium membership can be safely synchronized.'
      );
    end if;

    update public.premium_memberships
    set membership_status='expired',updated_at=now()
    where user_id=v_target_uuid;

    select jsonb_build_object(
      'user_id',m.user_id,'plan_id',m.plan_id,'membership_status',m.membership_status,
      'starts_at',m.starts_at,'ends_at',m.ends_at,'updated_at',m.updated_at
    )
    into v_after
    from public.premium_memberships m
    where m.user_id=v_target_uuid;

  else
    return jsonb_build_object(
      'ok',false,'reason','unsupported_action',
      'message','This repair action is not allowlisted.'
    );
  end if;

  v_verification:=private.system_diagnostic_finding_data(p_check_id,50);
  v_affected:=coalesce((v_verification->>'affected_count')::bigint,0);

  insert into private.system_diagnostic_repairs(
    id,actor_id,check_id,target_key,repair_action,risk_level,repair_mode,
    result_status,before_data,after_data,verification_data
  ) values (
    v_repair_id,(select auth.uid()),p_check_id,p_target_key,p_action,
    v_policy->>'risk_level',v_policy->>'repair_mode','applied',
    v_before,v_after,
    jsonb_build_object(
      'healthy',v_affected=0,
      'affected_count',v_affected,
      'verified_at',now()
    )
  );

  perform private.write_admin_audit(
    'system_diagnostics.repair_applied',
    'system_diagnostic_repair',
    v_repair_id::text,
    v_before,
    v_after,
    jsonb_build_object(
      'phase',3,'check_id',p_check_id,'target_key',p_target_key,
      'repair_action',p_action,'risk_level',v_policy->>'risk_level',
      'post_repair_affected_count',v_affected
    )
  );

  return jsonb_build_object(
    'ok',true,
    'repair_id',v_repair_id,
    'check_id',p_check_id,
    'target_key',p_target_key,
    'repair_action',p_action,
    'before',v_before,
    'after',v_after,
    'verification',jsonb_build_object(
      'healthy',v_affected=0,
      'affected_count',v_affected,
      'verified_at',now()
    )
  );
end;
$function$;

revoke execute on function public.admin_apply_system_diagnostic_repair(text,text,text,text)
  from public,anon;
grant execute on function public.admin_apply_system_diagnostic_repair(text,text,text,text)
  to authenticated;

create or replace function public.admin_list_system_diagnostic_repairs(
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),100));
  v_rows jsonb;
begin
  if not private.is_leogo_super_admin() then
    raise exception 'Super Admin access required';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_rows
  from (
    select r.id,r.check_id,r.target_key,r.repair_action,r.risk_level,r.repair_mode,
           r.result_status,r.before_data,r.after_data,r.verification_data,
           r.error_message,r.created_at
    from private.system_diagnostic_repairs r
    order by r.created_at desc
    limit v_limit
  ) x;

  return v_rows;
end;
$function$;

revoke execute on function public.admin_list_system_diagnostic_repairs(integer)
  from public,anon;
grant execute on function public.admin_list_system_diagnostic_repairs(integer)
  to authenticated;

create or replace function public.admin_get_latest_system_diagnostic_run()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_run jsonb;
begin
  if not private.is_leogo_super_admin() then
    raise exception 'Super Admin access required';
  end if;

  select jsonb_build_object(
    'id',r.id,'mode',r.mode,'module',r.module,'score',r.score,'health',r.health,
    'critical_count',r.critical_count,'warning_count',r.warning_count,
    'checks',r.checks,'created_at',r.created_at
  )
  into v_run
  from private.system_diagnostic_runs r
  where r.mode='full'
  order by r.created_at desc
  limit 1;

  return coalesce(v_run,jsonb_build_object('checks','[]'::jsonb));
end;
$function$;

revoke execute on function public.admin_get_latest_system_diagnostic_run()
  from public,anon;
grant execute on function public.admin_get_latest_system_diagnostic_run()
  to authenticated;
