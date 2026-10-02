-- Align System Diagnosis with the actual Approval Center RPC used by Admin.

create or replace function public.admin_run_system_diagnosis(
  p_pin text,
  p_mode text default 'full',
  p_module text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_verify jsonb;
  v_mode text:=lower(btrim(coalesce(p_mode,'full')));
  v_module text:=lower(btrim(coalesce(p_module,'')));
  v_checks jsonb:='[]'::jsonb;
  v_filtered jsonb:='[]'::jsonb;
  v_missing text[];
  v_count bigint:=0;
  v_critical integer:=0;
  v_warning integer:=0;
  v_score integer:=100;
  v_health text:='healthy';
  v_run_id uuid;
  v_tables text[];
  v_functions text[];
  v_buckets text[];
begin
  if not private.is_leogo_super_admin() then
    raise exception 'Super Admin access required';
  end if;

  if v_mode not in ('quick','full','module') then
    v_mode:='full';
  end if;

  if v_mode='module' and v_module not in (
    'core','security','auth_staff','database','storage','orders','products',
    'payments','notifications','services','transport','wallet','premium',
    'accommodation','cyber'
  ) then
    return jsonb_build_object('ok',false,'message','Choose a supported diagnostic module.');
  end if;

  v_verify:=private.verify_system_diagnostics_pin(p_pin);
  if coalesce((v_verify->>'ok')::boolean,false)=false then
    return v_verify;
  end if;

  -- CORE / DATABASE SCHEMA
  select count(*) into v_count
  from public.admin_users
  where role='super_admin' and status='active';
  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'core.super_admin','core','Active Super Admin',
    case when v_count>=1 then 'healthy' else 'critical' end,
    case when v_count>=1 then 'An active Super Admin account is present.' else 'No active Super Admin account was found.' end,
    v_count::text||' active Super Admin account(s).',
    'Restore one verified Super Admin account before changing any other Admin security setting.',
    true
  ));

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
  select array_agg(t order by t) into v_missing
  from unnest(v_tables) t
  where to_regclass('public.'||t) is null;
  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'database.critical_tables','database','Critical Database Tables',
    case when coalesce(array_length(v_missing,1),0)=0 then 'healthy' else 'critical' end,
    case when coalesce(array_length(v_missing,1),0)=0 then 'All critical LEOGO module tables are present.' else 'One or more critical module tables are missing.' end,
    case when coalesce(array_length(v_missing,1),0)=0 then array_length(v_tables,1)::text||' required tables found.' else 'Missing: '||array_to_string(v_missing,', ') end,
    'Restore only the missing migration/table definitions. Do not rebuild healthy tables.',
    true
  ));

  v_functions:=array[
    'admin_production_dashboard','admin_list_approval_queue','admin_list_staff_directory',
    'admin_staff_role_presets','admin_update_staff_access','admin_record_security_event',
    'admin_get_email_notification_settings','admin_list_marketplace_orders'
  ];
  select array_agg(f order by f) into v_missing
  from unnest(v_functions) f
  where not exists(
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=f
  );
  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'database.critical_rpcs','database','Critical Admin Functions',
    case when coalesce(array_length(v_missing,1),0)=0 then 'healthy' else 'critical' end,
    case when coalesce(array_length(v_missing,1),0)=0 then 'Core Admin database functions are available.' else 'A required Admin database function is missing.' end,
    case when coalesce(array_length(v_missing,1),0)=0 then array_length(v_functions,1)::text||' core functions found.' else 'Missing: '||array_to_string(v_missing,', ') end,
    'Restore the smallest missing RPC from its migration history and verify its permissions.',
    true
  ));

  -- SECURITY
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and p.proname like 'admin_%'
    and has_function_privilege('anon',p.oid,'EXECUTE');
  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'security.anon_admin_functions','security','Anonymous Admin Function Exposure',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'No SECURITY DEFINER Admin RPC is executable by anonymous users.' else 'Anonymous users can execute one or more privileged Admin functions.' end,
    v_count::text||' exposed Admin SECURITY DEFINER function(s).',
    'Revoke EXECUTE from PUBLIC/anon on the affected Admin RPCs, preserve authenticated access only where required, then rerun this scan.',
    true
  ));

  select count(*) into v_count
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity=false;
  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'security.public_rls','security','Public Table RLS',
    case when v_count=0 then 'healthy' else 'warning' end,
    case when v_count=0 then 'RLS is enabled on all public application tables.' else 'Some public tables do not have RLS enabled.' end,
    v_count::text||' public table(s) without RLS.',
    'Review each listed public table before enabling RLS; add policies that match the real access model rather than a blanket policy.',
    false
  ));

  -- STORAGE
  v_buckets:=array[
    'seller-product-media','seller-verification','staff-private-documents',
    'service-provider-public-media','service-provider-verification',
    'transport-public-media','transport-driver-private','transport-verification',
    'premium-profile-media','premium-verification','accommodation-public-media',
    'accommodation-verification','cyber-public-media','cyber-verification'
  ];
  select array_agg(b order by b) into v_missing
  from unnest(v_buckets) b
  where not exists(select 1 from storage.buckets sb where sb.id=b);
  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'storage.required_buckets','storage','Required Storage Buckets',
    case when coalesce(array_length(v_missing,1),0)=0 then 'healthy' else 'critical' end,
    case when coalesce(array_length(v_missing,1),0)=0 then 'Critical public/private media buckets are present.' else 'A required media/document bucket is missing.' end,
    case when coalesce(array_length(v_missing,1),0)=0 then array_length(v_buckets,1)::text||' required buckets found.' else 'Missing: '||array_to_string(v_missing,', ') end,
    'Restore only the missing bucket and its exact storage policies from the relevant module migration.',
    true
  ));

  select count(*) into v_count
  from storage.buckets
  where id in (
    'seller-verification','staff-private-documents','service-provider-verification',
    'transport-driver-private','transport-verification','premium-verification',
    'accommodation-verification','cyber-verification'
  ) and public=true;
  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'storage.private_bucket_exposure','storage','Private Document Exposure',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'Sensitive verification/document buckets remain private.' else 'A sensitive document bucket is marked public.' end,
    v_count::text||' sensitive bucket(s) exposed publicly.',
    'Set the affected sensitive bucket back to private and verify its Storage policies before allowing new uploads.',
    true
  ));

  -- AUTH / STAFF
  execute 'select count(*) from public.admin_users a left join auth.users u on u.id=a.user_id where u.id is null'
  into v_count;
  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'auth_staff.admin_auth_links','auth_staff','Admin Authentication Links',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'Every Admin record maps to an Auth user.' else 'An Admin profile exists without its Auth account.' end,
    v_count::text||' orphan Admin profile(s).',
    'Identify the orphan record. Restore the matching Auth account or safely retire only that orphan Admin record.',
    true
  ));

  execute 'select count(*) from public.leogo_staff s left join auth.users u on u.id=s.user_id where u.id is null'
  into v_count;
  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'auth_staff.staff_auth_links','auth_staff','Staff Authentication Links',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'Every LEOGO staff/rider record maps to an Auth user.' else 'A staff/rider record exists without its Auth account.' end,
    v_count::text||' orphan staff/rider profile(s).',
    'Repair the specific staff invitation/Auth account link. Do not recreate unrelated staff records.',
    false
  ));

  -- PAYMENTS
  execute 'select count(*) from public.payment_account_assignments a left join public.payment_accounts p on p.id=a.account_id where p.id is null or p.status<>''active'''
  into v_count;
  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'payments.assignment_integrity','payments','Payment Account Assignments',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'All assigned payment destinations point to active accounts.' else 'A payment function points to a missing or inactive account.' end,
    v_count::text||' broken payment assignment(s).',
    'Reconnect only the affected function code to a verified active Till/Paybill/Bank account before accepting new payments.',
    true
  ));

  -- EMAIL / NOTIFICATIONS
  execute 'select count(*) from public.order_email_outbox where sent_at is null and status in (''failed'',''configuration_required'')'
  into v_count;
  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'notifications.email_failures','notifications','Transactional Email Queue',
    case when v_count=0 then 'healthy' when v_count<=3 then 'warning' else 'critical' end,
    case when v_count=0 then 'No failed or configuration-blocked transactional emails are waiting.' else 'Transactional emails need attention.' end,
    v_count::text||' unsent failed/configuration-blocked email job(s).',
    'Inspect the latest email error and sender configuration. Retry only failed jobs after the cause is fixed; order processing should remain independent.',
    true
  ));

  execute 'select count(*) from public.email_notification_settings e where e.enabled=true and (nullif(btrim(e.sender_email),'''') is null or e.app_password_secret_id is null)'
  into v_count;
  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'notifications.sender_config','notifications','Email Sender Configuration',
    case when v_count=0 then 'healthy' else 'warning' end,
    case when v_count=0 then 'Enabled email configuration has the required sender fields.' else 'Email notifications are enabled without a complete sender configuration.' end,
    v_count::text||' incomplete enabled email configuration row(s).',
    'Correct the Gmail sender/App Password in System Settings, then send one test email before re-enabling automatic notifications.',
    false
  ));

  -- ORDERS
  if to_regclass('public.marketplace_order_items') is not null and to_regclass('public.marketplace_orders') is not null then
    execute 'select count(*) from public.marketplace_order_items i left join public.marketplace_orders o on o.id=i.order_id where o.id is null'
    into v_count;
    v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
      'orders.orphan_items','orders','Order Item Integrity',
      case when v_count=0 then 'healthy' else 'critical' end,
      case when v_count=0 then 'All marketplace order items belong to an order.' else 'Order items exist without a parent order.' end,
      v_count::text||' orphan order item(s).',
      'Do not delete broadly. Identify the affected item IDs and restore their parent order or remove only confirmed orphan rows after backup.',
      true
    ));

    execute 'select count(*) from public.marketplace_orders o left join (select order_id,sum(line_total_kes) total from public.marketplace_order_items group by order_id) i on i.order_id=o.id where abs(coalesce(o.items_subtotal_kes,0)-coalesce(i.total,0))>0.01'
    into v_count;
    v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
      'orders.subtotal_consistency','orders','Order Subtotal Consistency',
      case when v_count=0 then 'healthy' else 'warning' end,
      case when v_count=0 then 'Stored order subtotals match their item line totals.' else 'One or more orders have a subtotal mismatch.' end,
      v_count::text||' order(s) with item subtotal mismatch.',
      'Compare the affected order snapshot with its immutable item rows. Correct only the inconsistent stored total after confirming payment history.',
      true
    ));
  end if;

  if to_regclass('public.marketplace_seller_orders') is not null and to_regclass('public.marketplace_orders') is not null then
    execute 'select count(*) from public.marketplace_seller_orders s left join public.marketplace_orders o on o.id=s.order_id where o.id is null'
    into v_count;
    v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
      'orders.orphan_seller_orders','orders','Seller Order Links',
      case when v_count=0 then 'healthy' else 'critical' end,
      case when v_count=0 then 'Seller fulfilment records are linked to marketplace orders.' else 'Seller fulfilment records exist without their parent order.' end,
      v_count::text||' orphan seller-order record(s).',
      'Repair only the affected Seller → Order relationship from order history; do not rebuild the locked order workflow.',
      false
    ));
  end if;

  if to_regclass('public.marketplace_delivery_jobs') is not null and to_regclass('public.marketplace_orders') is not null then
    execute 'select count(*) from public.marketplace_delivery_jobs d left join public.marketplace_orders o on o.id=d.order_id where o.id is null'
    into v_count;
    v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
      'orders.delivery_order_links','orders','Delivery Job Order Links',
      case when v_count=0 then 'healthy' else 'critical' end,
      case when v_count=0 then 'Delivery jobs point to valid orders.' else 'A delivery job references a missing order.' end,
      v_count::text||' orphan delivery job(s).',
      'Restore or retire only the affected delivery job after checking its Rider and customer history.',
      true
    ));

    execute 'select count(*) from public.marketplace_delivery_jobs d left join public.leogo_staff r on r.user_id=d.rider_id where d.rider_id is not null and (r.user_id is null or r.status<>''active'' or r.staff_role<>''rider'')'
    into v_count;
    v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
      'orders.delivery_rider_links','transport','Assigned Rider Integrity',
      case when v_count=0 then 'healthy' else 'warning' end,
      case when v_count=0 then 'Assigned delivery jobs reference active Rider staff accounts.' else 'A delivery job is assigned to a missing/inactive/non-Rider account.' end,
      v_count::text||' invalid Rider assignment(s).',
      'Reassign only the affected delivery job to an active LEOGO Rider; preserve the existing delivery status history.',
      true
    ));
  end if;

  -- PRODUCTS / SELLERS
  execute 'select count(*) from public.seller_products p left join public.seller_accounts s on s.user_id=p.seller_id where s.user_id is null'
  into v_count;
  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'products.seller_links','products','Product Seller Links',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'Every Seller product belongs to a Seller account.' else 'A product references a missing Seller account.' end,
    v_count::text||' orphan Seller product(s).',
    'Restore the affected Seller account link or retire only the orphan product after confirming it is not referenced by historical orders.',
    false
  ));

  execute 'select count(*) from public.seller_products p where p.product_approval_status=''approved'' and p.has_variants=true and not exists(select 1 from public.seller_product_variants v where v.product_id=p.id and v.is_active=true)'
  into v_count;
  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'products.variant_integrity','products','Approved Product Variants',
    case when v_count=0 then 'healthy' else 'warning' end,
    case when v_count=0 then 'Approved variant products have active variants.' else 'An approved product expects variants but has none active.' end,
    v_count::text||' approved product(s) missing active variants.',
    'Restore or activate the intended variant rows for only the affected products, then verify Add to Cart variant selection.',
    false
  ));

  execute 'select count(*) from public.seller_products p where p.product_approval_status=''approved'' and nullif(btrim(coalesce(p.main_image_path,'')),'''') is null'
  into v_count;
  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'products.main_images','products','Approved Product Main Images',
    case when v_count=0 then 'healthy' else 'warning' end,
    case when v_count=0 then 'Approved products have main image paths.' else 'Approved products without a main image may render poorly on the customer site.' end,
    v_count::text||' approved product(s) without main image.',
    'Upload or reconnect the missing product image only; do not alter product approval, price, or order history.',
    false
  ));

  -- SERVICE PROVIDERS
  execute 'select count(*) from public.service_provider_services s left join public.service_provider_accounts p on p.user_id=s.provider_id where p.user_id is null'
  into v_count;
  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'services.provider_links','services','Service Listing Provider Links',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'Service listings map to provider accounts.' else 'A service listing references a missing provider.' end,
    v_count::text||' orphan service listing(s).',
    'Restore the specific Service Provider account/link or retire only the orphan listing after checking request history.',
    false
  ));

  -- TRANSPORT
  execute 'select count(*) from public.transport_provider_vehicles v left join public.transport_provider_accounts p on p.user_id=v.provider_id where p.user_id is null'
  into v_count;
  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'transport.provider_links','transport','Transport Vehicle Provider Links',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'Registered vehicles map to Transport Provider accounts.' else 'A transport vehicle references a missing provider.' end,
    v_count::text||' orphan vehicle record(s).',
    'Repair only the affected vehicle/provider relationship and preserve driver/private-document records.',
    false
  ));

  -- WALLET
  execute 'select count(*) from public.wallet_ledger_entries l left join public.wallet_accounts a on a.user_id=l.user_id where a.user_id is null'
  into v_count;
  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'wallet.ledger_links','wallet','Wallet Ledger Account Links',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'Wallet ledger entries map to Wallet accounts.' else 'A Wallet ledger row is detached from its account.' end,
    v_count::text||' orphan Wallet ledger entry/entries.',
    'Freeze changes to the affected Wallet account, reconcile its ledger and account identity, and never delete ledger history to hide the mismatch.',
    false
  ));

  -- PREMIUM
  execute 'select count(*) from public.premium_profiles p left join public.premium_profile_details d on d.user_id=p.user_id left join public.premium_identity_details i on i.user_id=p.user_id where d.user_id is null or i.user_id is null'
  into v_count;
  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'premium.profile_details','premium','Premium Profile Detail Links',
    case when v_count=0 then 'healthy' else 'warning' end,
    case when v_count=0 then 'Premium profiles have their linked public/private detail rows.' else 'A Premium profile is missing a linked details/identity record.' end,
    v_count::text||' incomplete Premium profile(s).',
    'Restore only the missing linked detail record from the approved application data; keep private identity fields private.',
    false
  ));

  -- ACCOMMODATION
  execute 'select count(*) from public.accommodation_units u left join public.accommodation_properties p on p.id=u.property_id where p.id is null'
  into v_count;
  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'accommodation.unit_links','accommodation','Accommodation Unit Links',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'Accommodation units belong to valid properties.' else 'An accommodation unit references a missing property.' end,
    v_count::text||' orphan accommodation unit(s).',
    'Restore the specific property relationship or deactivate only the orphan unit until the host record is reconciled.',
    false
  ));

  -- CYBER
  execute 'select count(*) from public.cyber_services s left join public.cyber_provider_accounts p on p.user_id=s.provider_id where p.user_id is null'
  into v_count;
  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'cyber.provider_links','cyber','Cyber Service Provider Links',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'Cyber services map to Cyber Provider accounts.' else 'A Cyber service references a missing provider.' end,
    v_count::text||' orphan Cyber service(s).',
    'Repair only the affected Cyber Provider link and leave other Partner Portal workflows unchanged.',
    false
  ));

  -- Select requested diagnostic scope.
  select coalesce(jsonb_agg(e.value order by e.ordinality),'[]'::jsonb)
  into v_filtered
  from jsonb_array_elements(v_checks) with ordinality e(value,ordinality)
  where
    (v_mode='full')
    or (v_mode='quick' and coalesce((e.value->>'quick')::boolean,false)=true)
    or (v_mode='module' and e.value->>'module'=v_module);

  select
    count(*) filter(where e.value->>'status'='critical'),
    count(*) filter(where e.value->>'status'='warning')
  into v_critical,v_warning
  from jsonb_array_elements(v_filtered) e(value);

  v_score:=greatest(0,100-(v_critical*18)-(v_warning*6));
  v_health:=case
    when v_critical>0 then 'critical'
    when v_score>=90 then 'healthy'
    when v_score>=75 then 'warning'
    else 'attention'
  end;

  insert into private.system_diagnostic_runs(
    actor_id,mode,module,score,health,critical_count,warning_count,checks
  )
  values(
    (select auth.uid()),v_mode,nullif(v_module,''),v_score,v_health,v_critical,v_warning,v_filtered
  )
  returning id into v_run_id;

  perform private.write_admin_audit(
    'system_diagnostics.run',
    'system_diagnostics',
    v_run_id::text,
    null,
    null,
    jsonb_build_object(
      'mode',v_mode,
      'module',nullif(v_module,''),
      'score',v_score,
      'health',v_health,
      'critical_count',v_critical,
      'warning_count',v_warning
    )
  );

  return jsonb_build_object(
    'ok',true,
    'run_id',v_run_id,
    'mode',v_mode,
    'module',nullif(v_module,''),
    'score',v_score,
    'health',v_health,
    'critical_count',v_critical,
    'warning_count',v_warning,
    'checks',v_filtered,
    'generated_at',now(),
    'repair_mode','advisory_only'
  );
end;
$function$;
