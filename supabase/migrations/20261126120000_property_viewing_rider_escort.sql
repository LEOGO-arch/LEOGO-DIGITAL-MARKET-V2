-- LEOGO DIGITAL MARKET V2 — property viewing rider escort requests.
-- A rider escort is a separate optional service after viewing access is granted.
alter table public.vacant_house_settings
  add column if not exists rider_escort_enabled boolean not null default true,
  add column if not exists rider_escort_fee_kes numeric(12,2) not null default 0
    check (rider_escort_fee_kes between 0 and 1000000);

create table if not exists public.vacant_house_rider_requests (
  id uuid primary key default gen_random_uuid(),
  viewing_request_id uuid not null unique references public.vacant_house_viewing_requests(id) on delete restrict,
  listing_id uuid not null references public.vacant_house_listings(id) on delete restrict,
  customer_user_id uuid not null references auth.users(id) on delete restrict,
  preferred_viewing_at timestamptz,
  customer_message text,
  fee_amount_kes numeric(12,2) not null check(fee_amount_kes between 0 and 1000000),
  payment_reference text,
  payment_status text not null check(payment_status in ('not_required','submitted','verified','rejected')),
  request_status text not null default 'requested' check(request_status in ('requested','confirmed','assigned','completed','cancelled')),
  assigned_rider_name text,
  assigned_rider_phone text,
  admin_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((request_status <> 'assigned') or (nullif(btrim(assigned_rider_name),'') is not null and nullif(btrim(assigned_rider_phone),'') is not null))
);
create index if not exists vacant_house_rider_requests_customer_idx
  on public.vacant_house_rider_requests(customer_user_id,created_at desc);
create index if not exists vacant_house_rider_requests_admin_idx
  on public.vacant_house_rider_requests(payment_status,request_status,created_at desc);

alter table public.vacant_house_rider_requests enable row level security;
revoke all on public.vacant_house_rider_requests from public,anon,authenticated;
grant all on public.vacant_house_rider_requests to service_role;

create or replace function public.admin_save_vacant_house_rider_rules(
  p_enabled boolean,
  p_fee_kes numeric
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_before jsonb; v_after jsonb;
begin
  if not private.is_leogo_admin('settings.manage') and not private.is_leogo_admin('fees.manage') then
    raise exception 'Settings or fee management permission required';
  end if;
  if coalesce(p_fee_kes,-1)<0 or p_fee_kes>1000000 then raise exception 'Enter a valid rider escort fee'; end if;
  select to_jsonb(s) into v_before from public.vacant_house_settings s where id=1 for update;
  update public.vacant_house_settings
  set rider_escort_enabled=coalesce(p_enabled,false), rider_escort_fee_kes=round(p_fee_kes,2),
      updated_by=(select auth.uid()),updated_at=now()
  where id=1 returning to_jsonb(vacant_house_settings.*) into v_after;
  perform private.write_admin_audit('vacant_houses.rider_rules.updated','vacant_house_settings','1',v_before,v_after,'{}'::jsonb);
  return jsonb_build_object('success',true,'enabled',(v_after->>'rider_escort_enabled')::boolean,'fee_kes',(v_after->>'rider_escort_fee_kes')::numeric);
end
$function$;
revoke all on function public.admin_save_vacant_house_rider_rules(boolean,numeric) from public,anon;
grant execute on function public.admin_save_vacant_house_rider_rules(boolean,numeric) to authenticated;

create or replace function public.customer_get_vacant_house_rider_quote(p_viewing_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_view public.vacant_house_viewing_requests%rowtype;
  v_settings public.vacant_house_settings%rowtype;
  v_existing public.vacant_house_rider_requests%rowtype;
  v_payment jsonb;
begin
  if v_user is null then raise exception 'Sign in to request a LEOGO rider'; end if;
  select * into v_view from public.vacant_house_viewing_requests
  where id=p_viewing_request_id and customer_user_id=v_user and payment_status in ('verified','waived');
  if not found then raise exception 'Complete and verify property viewing access first'; end if;
  select * into v_settings from public.vacant_house_settings where id=1;
  if not v_settings.rider_escort_enabled then raise exception 'LEOGO rider escort requests are currently unavailable'; end if;
  select * into v_existing from public.vacant_house_rider_requests where viewing_request_id=v_view.id;
  select jsonb_build_object('display_name',p.display_name,'account_type',p.account_type,'business_name',p.business_name,
    'account_name',p.account_name,'till_number',p.till_number,'paybill_number',p.paybill_number,
    'account_number',p.account_number,'bank_name',p.bank_name,'instructions',p.instructions)
  into v_payment
  from public.payment_account_assignments a join public.payment_accounts p on p.id=a.account_id and p.status='active'
  where a.function_code='vacant_house_viewing';
  return jsonb_build_object(
    'enabled',v_settings.rider_escort_enabled,'fee_amount_kes',round(v_settings.rider_escort_fee_kes,2),
    'payment_account',v_payment,
    'existing_request',case when v_existing.id is null then null else jsonb_build_object(
      'id',v_existing.id,'fee_amount_kes',v_existing.fee_amount_kes,'payment_status',v_existing.payment_status,
      'request_status',v_existing.request_status,'preferred_viewing_at',v_existing.preferred_viewing_at,
      'assigned_rider_name',v_existing.assigned_rider_name,'assigned_rider_phone',v_existing.assigned_rider_phone,
      'admin_notes',v_existing.admin_notes
    ) end
  );
end
$function$;
revoke all on function public.customer_get_vacant_house_rider_quote(uuid) from public,anon;
grant execute on function public.customer_get_vacant_house_rider_quote(uuid) to authenticated;

create or replace function public.customer_submit_vacant_house_rider_request(
  p_viewing_request_id uuid,
  p_preferred_viewing_at timestamptz default null,
  p_message text default null,
  p_payment_reference text default null
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_view public.vacant_house_viewing_requests%rowtype;
  v_settings public.vacant_house_settings%rowtype;
  v_existing public.vacant_house_rider_requests%rowtype;
  v_listing public.vacant_house_listings%rowtype;
  v_id uuid := gen_random_uuid();
  v_ref text := 'VHR-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  v_fee numeric;
  v_payment_status text;
begin
  if v_user is null then raise exception 'Sign in to request a LEOGO rider'; end if;
  select * into v_view from public.vacant_house_viewing_requests
  where id=p_viewing_request_id and customer_user_id=v_user and payment_status in ('verified','waived')
  for share;
  if not found then raise exception 'Complete and verify property viewing access first'; end if;
  select * into v_listing from public.vacant_house_listings where id=v_view.listing_id and approval_status='approved' and availability_status='vacant';
  if not found then raise exception 'This property is no longer available'; end if;
  select * into v_settings from public.vacant_house_settings where id=1;
  if not v_settings.rider_escort_enabled then raise exception 'LEOGO rider escort requests are currently unavailable'; end if;
  v_fee:=round(v_settings.rider_escort_fee_kes,2);
  if v_fee>0 then
    if char_length(btrim(coalesce(p_payment_reference,'')))<6 then raise exception 'Enter the M-Pesa reference for the rider escort fee'; end if;
    if not exists(select 1 from public.payment_account_assignments a join public.payment_accounts p on p.id=a.account_id and p.status='active' where a.function_code='vacant_house_viewing') then
      raise exception 'LEOGO has not configured the property payment account yet';
    end if;
    v_payment_status:='submitted';
  else
    v_payment_status:='not_required';
  end if;
  select * into v_existing from public.vacant_house_rider_requests where viewing_request_id=v_view.id for update;
  if found then
    if v_existing.payment_status not in ('rejected') or v_existing.request_status='assigned' then
      return jsonb_build_object('success',true,'request_id',v_existing.id,'payment_status',v_existing.payment_status,'request_status',v_existing.request_status,'already_exists',true);
    end if;
    update public.vacant_house_rider_requests set
      preferred_viewing_at=p_preferred_viewing_at,
      customer_message=nullif(left(btrim(coalesce(p_message,'')),1000),''),
      fee_amount_kes=v_fee,payment_reference=case when v_fee>0 then btrim(p_payment_reference) else null end,
      payment_status=v_payment_status,request_status='requested',admin_notes=null,
      updated_at=now()
    where id=v_existing.id;
    return jsonb_build_object('success',true,'request_id',v_existing.id,'payment_status',v_payment_status,'request_status','requested');
  end if;
  insert into public.vacant_house_rider_requests(
    id,viewing_request_id,listing_id,customer_user_id,preferred_viewing_at,customer_message,
    fee_amount_kes,payment_reference,payment_status,request_status
  ) values(
    v_id,v_view.id,v_view.listing_id,v_user,p_preferred_viewing_at,
    nullif(left(btrim(coalesce(p_message,'')),1000),''),v_fee,
    case when v_fee>0 then btrim(p_payment_reference) else null end,v_payment_status,'requested'
  );
  return jsonb_build_object('success',true,'request_id',v_id,'request_reference',v_ref,'payment_status',v_payment_status,'request_status','requested');
end
$function$;
revoke all on function public.customer_submit_vacant_house_rider_request(uuid,timestamptz,text,text) from public,anon;
grant execute on function public.customer_submit_vacant_house_rider_request(uuid,timestamptz,text,text) to authenticated;

create or replace function public.admin_get_vacant_house_rider_dashboard()
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_rows jsonb; v_settings jsonb;
begin
  if not private.is_leogo_admin('approvals.read') and not private.is_leogo_admin('settings.manage')
    and not private.is_leogo_admin('fees.manage') and not private.is_leogo_admin('payments.manage') then
    raise exception 'Property Market Admin access required';
  end if;
  select jsonb_build_object('enabled',rider_escort_enabled,'fee_kes',rider_escort_fee_kes)
  into v_settings from public.vacant_house_settings where id=1;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'request_reference',v.request_reference,'listing_id',r.listing_id,'title',l.title,
    'listing_reference',l.listing_reference,'customer_user_id',r.customer_user_id,
    'customer_name',coalesce(cp.full_name,'LEOGO Customer'),'customer_phone',cp.phone,
    'preferred_viewing_at',r.preferred_viewing_at,'customer_message',r.customer_message,
    'fee_amount_kes',r.fee_amount_kes,'payment_reference',r.payment_reference,
    'payment_status',r.payment_status,'request_status',r.request_status,
    'assigned_rider_name',r.assigned_rider_name,'assigned_rider_phone',r.assigned_rider_phone,
    'admin_notes',r.admin_notes,'created_at',r.created_at
  ) order by r.created_at desc),'[]'::jsonb) into v_rows
  from public.vacant_house_rider_requests r
  join public.vacant_house_viewing_requests v on v.id=r.viewing_request_id
  join public.vacant_house_listings l on l.id=r.listing_id
  left join public.customer_profiles cp on cp.user_id=r.customer_user_id;
  return jsonb_build_object('settings',coalesce(v_settings,'{}'::jsonb),'rider_requests',coalesce(v_rows,'[]'::jsonb));
end
$function$;
revoke all on function public.admin_get_vacant_house_rider_dashboard() from public,anon;
grant execute on function public.admin_get_vacant_house_rider_dashboard() to authenticated;

create or replace function public.admin_review_vacant_house_rider_request(
  p_request_id uuid,p_action text,p_notes text default null,
  p_rider_name text default null,p_rider_phone text default null
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_row public.vacant_house_rider_requests%rowtype; v_before jsonb; v_after jsonb;
begin
  if not private.is_leogo_admin('approvals.manage') and not private.is_leogo_admin('payments.manage') then
    raise exception 'Approval or payment permission required';
  end if;
  if p_action not in ('verify_payment','reject_payment','confirm','assign','complete','cancel') then raise exception 'Unsupported rider request action'; end if;
  if p_action='reject_payment' and char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'Give a reason for rejecting this payment'; end if;
  if p_action='assign' and (char_length(btrim(coalesce(p_rider_name,'')))<2 or char_length(btrim(coalesce(p_rider_phone,'')))<7) then
    raise exception 'Enter the assigned LEOGO rider name and phone number';
  end if;
  select * into v_row from public.vacant_house_rider_requests where id=p_request_id for update;
  if not found then raise exception 'Rider escort request not found'; end if;
  v_before:=to_jsonb(v_row);
  if p_action='verify_payment' then
    if v_row.payment_status<>'submitted' then raise exception 'This rider payment is not awaiting verification'; end if;
    update public.vacant_house_rider_requests set payment_status='verified',reviewed_by=(select auth.uid()),reviewed_at=now(),updated_at=now() where id=p_request_id;
  elsif p_action='reject_payment' then
    if v_row.payment_status<>'submitted' then raise exception 'This rider payment is not awaiting verification'; end if;
    update public.vacant_house_rider_requests set payment_status='rejected',admin_notes=nullif(btrim(p_notes),''),reviewed_by=(select auth.uid()),reviewed_at=now(),updated_at=now() where id=p_request_id;
  elsif p_action='confirm' then
    if v_row.payment_status not in ('verified','not_required') then raise exception 'Verify the rider payment before confirming'; end if;
    update public.vacant_house_rider_requests set request_status='confirmed',admin_notes=nullif(btrim(coalesce(p_notes,'')),''),reviewed_by=(select auth.uid()),reviewed_at=now(),updated_at=now() where id=p_request_id;
  elsif p_action='assign' then
    if v_row.payment_status not in ('verified','not_required') then raise exception 'Verify the rider payment before assigning a rider'; end if;
    update public.vacant_house_rider_requests set request_status='assigned',assigned_rider_name=btrim(p_rider_name),assigned_rider_phone=btrim(p_rider_phone),admin_notes=nullif(btrim(coalesce(p_notes,'')),''),reviewed_by=(select auth.uid()),reviewed_at=now(),updated_at=now() where id=p_request_id;
  elsif p_action='complete' then
    if v_row.request_status<>'assigned' then raise exception 'Assign a rider before completing this request'; end if;
    update public.vacant_house_rider_requests set request_status='completed',reviewed_by=(select auth.uid()),reviewed_at=now(),updated_at=now() where id=p_request_id;
  else
    update public.vacant_house_rider_requests set request_status='cancelled',admin_notes=nullif(btrim(coalesce(p_notes,'')),''),reviewed_by=(select auth.uid()),reviewed_at=now(),updated_at=now() where id=p_request_id;
  end if;
  select * into v_row from public.vacant_house_rider_requests where id=p_request_id;
  v_after:=to_jsonb(v_row);
  perform private.write_admin_audit('vacant_houses.rider_request.'||p_action,'vacant_house_rider_request',p_request_id::text,v_before,v_after,jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),'')));
  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(v_row.customer_user_id,'vacant_house_rider_'||p_action,
    case p_action when 'verify_payment' then 'Rider escort payment verified' when 'reject_payment' then 'Rider escort payment needs attention'
      when 'assign' then 'LEOGO rider assigned' when 'complete' then 'Property viewing escort completed' else 'Property viewing rider request updated' end,
    case p_action when 'verify_payment' then 'Your LEOGO rider escort fee was verified. Your request is being arranged.'
      when 'reject_payment' then 'Your rider escort payment could not be verified. '||coalesce(p_notes,'Please check the reference.')
      when 'assign' then 'LEOGO rider '||btrim(p_rider_name)||' ('||btrim(p_rider_phone)||') has been assigned for your property viewing.'
      when 'complete' then 'Your LEOGO rider property viewing request has been marked complete.'
      else 'Your property viewing rider request is now '||replace(p_action,'_',' ')||'.' end,
    'vacant_house_rider_request',p_request_id,'vacant_house_rider_'||p_action||'_'||p_request_id::text||'_'||extract(epoch from now())::bigint::text,
    'dashboard',jsonb_build_object('request_id',p_request_id,'action',p_action));
  return jsonb_build_object('success',true,'request_id',p_request_id,'payment_status',v_row.payment_status,'request_status',v_row.request_status);
end
$function$;
revoke all on function public.admin_review_vacant_house_rider_request(uuid,text,text,text,text) from public,anon;
grant execute on function public.admin_review_vacant_house_rider_request(uuid,text,text,text,text) to authenticated;

create or replace function public.customer_get_my_vacant_house_viewing_requests()
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_user uuid := (select auth.uid()); v_rows jsonb;
begin
  if v_user is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'request_reference',r.request_reference,'listing_id',r.listing_id,
    'listing_reference',l.listing_reference,'title',l.title,'house_type',l.house_type,
    'listing_purpose',l.listing_purpose,'monthly_rent_kes',l.monthly_rent_kes,
    'sale_price_kes',l.sale_price_kes,'area_estate',l.area_estate,'sub_county',l.sub_county,'county',l.county,
    'fee_amount_kes',r.fee_amount_kes,'payment_status',r.payment_status,'request_status',r.request_status,
    'preferred_viewing_at',r.preferred_viewing_at,'admin_notes',r.admin_notes,'access_granted_at',r.access_granted_at,
    'created_at',r.created_at,
    'contact_name',case when r.payment_status in ('verified','waived') then d.contact_name else null end,
    'contact_phone',case when r.payment_status in ('verified','waived') then d.contact_phone else null end,
    'exact_address',case when r.payment_status in ('verified','waived') then d.exact_address else null end,
    'landmark',case when r.payment_status in ('verified','waived') then d.landmark else null end,
    'maps_link',case when r.payment_status in ('verified','waived') then d.maps_link else null end,
    'latitude',case when r.payment_status in ('verified','waived') then d.latitude else null end,
    'longitude',case when r.payment_status in ('verified','waived') then d.longitude else null end,
    'rider_request',case when rr.id is null then null else jsonb_build_object(
      'id',rr.id,'fee_amount_kes',rr.fee_amount_kes,'payment_status',rr.payment_status,
      'request_status',rr.request_status,'preferred_viewing_at',rr.preferred_viewing_at,
      'assigned_rider_name',rr.assigned_rider_name,'assigned_rider_phone',rr.assigned_rider_phone,
      'admin_notes',rr.admin_notes,'created_at',rr.created_at
    ) end
  ) order by r.created_at desc),'[]'::jsonb) into v_rows
  from public.vacant_house_viewing_requests r
  join public.vacant_house_listings l on l.id=r.listing_id
  join private.vacant_house_private_details d on d.listing_id=l.id
  left join public.vacant_house_rider_requests rr on rr.viewing_request_id=r.id
  where r.customer_user_id=v_user;
  return v_rows;
end
$function$;
revoke all on function public.customer_get_my_vacant_house_viewing_requests() from public,anon;
grant execute on function public.customer_get_my_vacant_house_viewing_requests() to authenticated;

notify pgrst,'reload schema';
