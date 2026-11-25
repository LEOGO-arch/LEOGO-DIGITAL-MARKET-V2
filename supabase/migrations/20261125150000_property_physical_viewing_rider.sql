-- Optional LEOGO rider escort requests after verified property viewing access.
alter table public.vacant_house_settings
  add column if not exists rider_viewing_enabled boolean not null default true,
  add column if not exists rider_viewing_fee_mode text not null default 'free',
  add column if not exists rider_viewing_fee_kes numeric(12,2) not null default 0;

alter table public.vacant_house_settings
  drop constraint if exists vacant_house_settings_rider_viewing_fee_mode_check;
alter table public.vacant_house_settings
  add constraint vacant_house_settings_rider_viewing_fee_mode_check
  check (rider_viewing_fee_mode in ('free','fixed'));
alter table public.vacant_house_settings
  drop constraint if exists vacant_house_settings_rider_viewing_fee_kes_check;
alter table public.vacant_house_settings
  add constraint vacant_house_settings_rider_viewing_fee_kes_check
  check (rider_viewing_fee_kes between 0 and 1000000);

create table if not exists public.vacant_house_rider_viewing_requests (
  id uuid primary key default gen_random_uuid(),
  request_reference text not null unique check (char_length(request_reference) between 8 and 40),
  viewing_request_id uuid not null unique references public.vacant_house_viewing_requests(id) on delete restrict,
  listing_id uuid not null references public.vacant_house_listings(id) on delete restrict,
  customer_user_id uuid not null references auth.users(id) on delete restrict,
  preferred_viewing_at timestamptz,
  customer_message text,
  fee_amount_kes numeric(12,2) not null check (fee_amount_kes between 0 and 1000000),
  payment_reference text,
  payment_status text not null check (payment_status in ('not_required','submitted','verified','rejected')),
  status text not null check (status in ('pending_payment','pending_assignment','assigned','accepted','en_route','arrived','completed','cancelled')),
  assigned_rider_id uuid references auth.users(id) on delete set null,
  assigned_at timestamptz,
  admin_notes text,
  rider_notes text,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vacant_house_rider_viewing_customer_idx
  on public.vacant_house_rider_viewing_requests(customer_user_id,created_at desc);
create index if not exists vacant_house_rider_viewing_assignment_idx
  on public.vacant_house_rider_viewing_requests(assigned_rider_id,status,preferred_viewing_at);

alter table public.vacant_house_rider_viewing_requests enable row level security;
revoke all on table public.vacant_house_rider_viewing_requests from public,anon,authenticated;
drop policy if exists vacant_house_rider_viewing_requests_deny_direct_api
  on public.vacant_house_rider_viewing_requests;
create policy vacant_house_rider_viewing_requests_deny_direct_api
  on public.vacant_house_rider_viewing_requests
  for all to anon,authenticated using (false) with check (false);

create or replace function public.public_get_vacant_house_rider_quote(p_viewing_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_access public.vacant_house_viewing_requests%rowtype;
  v_listing public.vacant_house_listings%rowtype;
  v_settings public.vacant_house_settings%rowtype;
  v_existing public.vacant_house_rider_viewing_requests%rowtype;
  v_payment jsonb;
begin
  if v_user is null then raise exception 'Sign in to request a LEOGO rider'; end if;
  select * into v_access
  from public.vacant_house_viewing_requests
  where id=p_viewing_request_id and customer_user_id=v_user
    and payment_status in ('verified','waived');
  if not found then raise exception 'Verify property viewing access before requesting a LEOGO rider'; end if;

  select * into v_listing from public.vacant_house_listings
  where id=v_access.listing_id and approval_status='approved' and availability_status='vacant';
  if not found then raise exception 'This property is no longer available'; end if;
  if v_listing.submitter_user_id=v_user then raise exception 'You cannot request a viewing rider for your own property'; end if;

  select * into v_settings from public.vacant_house_settings where id=1;
  if not coalesce(v_settings.is_enabled,false) or not coalesce(v_settings.rider_viewing_enabled,false) then
    raise exception 'LEOGO Rider physical viewings are currently unavailable';
  end if;

  select * into v_existing
  from public.vacant_house_rider_viewing_requests
  where viewing_request_id=p_viewing_request_id;

  if v_settings.rider_viewing_fee_mode='fixed' and v_settings.rider_viewing_fee_kes>0 then
    select jsonb_build_object(
      'display_name',p.display_name,'account_type',p.account_type,'business_name',p.business_name,
      'account_name',p.account_name,'till_number',p.till_number,'paybill_number',p.paybill_number,
      'account_number',p.account_number,'bank_name',p.bank_name,'instructions',p.instructions
    ) into v_payment
    from public.payment_account_assignments a
    join public.payment_accounts p on p.id=a.account_id and p.status='active'
    where a.function_code='vacant_house_rider_viewing';
  end if;

  return jsonb_build_object(
    'viewing_request_id',p_viewing_request_id,
    'listing_id',v_listing.id,'listing_title',v_listing.title,
    'enabled',true,
    'fee_mode',v_settings.rider_viewing_fee_mode,
    'fee_amount_kes',case when v_settings.rider_viewing_fee_mode='fixed' then v_settings.rider_viewing_fee_kes else 0 end,
    'payment_account',v_payment,
    'existing_request',case when v_existing.id is null then null else jsonb_build_object(
      'id',v_existing.id,'request_reference',v_existing.request_reference,'fee_amount_kes',v_existing.fee_amount_kes,
      'payment_status',v_existing.payment_status,'status',v_existing.status,
      'preferred_viewing_at',v_existing.preferred_viewing_at,'admin_notes',v_existing.admin_notes,
      'rider_name',(select s.display_name from public.leogo_staff s where s.user_id=v_existing.assigned_rider_id),
      'rider_phone',(select s.phone from public.leogo_staff s where s.user_id=v_existing.assigned_rider_id)
    ) end
  );
end
$function$;
revoke all on function public.public_get_vacant_house_rider_quote(uuid) from public;
grant execute on function public.public_get_vacant_house_rider_quote(uuid) to authenticated;

create or replace function public.customer_submit_vacant_house_rider_viewing_request(
  p_viewing_request_id uuid,
  p_payment_reference text default null,
  p_preferred_viewing_at timestamptz default null,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_access public.vacant_house_viewing_requests%rowtype;
  v_listing public.vacant_house_listings%rowtype;
  v_settings public.vacant_house_settings%rowtype;
  v_existing public.vacant_house_rider_viewing_requests%rowtype;
  v_id uuid := gen_random_uuid();
  v_ref text;
  v_fee numeric;
  v_payment_status text;
  v_status text;
begin
  if v_user is null then raise exception 'Sign in to request a LEOGO rider'; end if;
  select * into v_access
  from public.vacant_house_viewing_requests
  where id=p_viewing_request_id and customer_user_id=v_user
    and payment_status in ('verified','waived');
  if not found then raise exception 'Verify property viewing access before requesting a LEOGO rider'; end if;

  select * into v_listing from public.vacant_house_listings
  where id=v_access.listing_id and approval_status='approved' and availability_status='vacant'
  for share;
  if not found then raise exception 'This property is no longer available'; end if;
  if v_listing.submitter_user_id=v_user then raise exception 'You cannot request a viewing rider for your own property'; end if;

  select * into v_settings from public.vacant_house_settings where id=1;
  if not coalesce(v_settings.is_enabled,false) or not coalesce(v_settings.rider_viewing_enabled,false) then
    raise exception 'LEOGO Rider physical viewings are currently unavailable';
  end if;

  v_fee:=case when v_settings.rider_viewing_fee_mode='fixed' then round(v_settings.rider_viewing_fee_kes,2) else 0 end;
  if v_fee>0 then
    if char_length(btrim(coalesce(p_payment_reference,'')))<6 then
      raise exception 'Enter the M-Pesa or payment reference for the LEOGO rider fee';
    end if;
    if not exists(
      select 1 from public.payment_account_assignments a
      join public.payment_accounts p on p.id=a.account_id and p.status='active'
      where a.function_code='vacant_house_rider_viewing'
    ) then
      raise exception 'LEOGO has not configured the rider viewing payment account yet';
    end if;
    v_payment_status:='submitted';
    v_status:='pending_payment';
  else
    v_payment_status:='not_required';
    v_status:='pending_assignment';
  end if;

  select * into v_existing from public.vacant_house_rider_viewing_requests
  where viewing_request_id=p_viewing_request_id for update;
  if v_existing.id is not null then
    if v_existing.status not in ('cancelled') and v_existing.payment_status not in ('rejected') then
      return jsonb_build_object(
        'success',true,'request_id',v_existing.id,'request_reference',v_existing.request_reference,
        'payment_status',v_existing.payment_status,'status',v_existing.status,'already_exists',true
      );
    end if;
    update public.vacant_house_rider_viewing_requests
    set payment_reference=nullif(btrim(coalesce(p_payment_reference,'')),''),
        payment_status=v_payment_status,status=v_status,fee_amount_kes=v_fee,
        preferred_viewing_at=p_preferred_viewing_at,
        customer_message=nullif(btrim(coalesce(p_message,'')),''),
        assigned_rider_id=null,assigned_at=null,admin_notes=null,rider_notes=null,
        verified_by=null,verified_at=null,completed_at=null,updated_at=now()
    where id=v_existing.id;
    return jsonb_build_object(
      'success',true,'request_id',v_existing.id,'request_reference',v_existing.request_reference,
      'payment_status',v_payment_status,'status',v_status,'resubmitted',true
    );
  end if;

  v_ref:='VHRIDE-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(v_id::text,'-',''),1,7));
  insert into public.vacant_house_rider_viewing_requests(
    id,request_reference,viewing_request_id,listing_id,customer_user_id,preferred_viewing_at,
    customer_message,fee_amount_kes,payment_reference,payment_status,status
  ) values(
    v_id,v_ref,p_viewing_request_id,v_access.listing_id,v_user,p_preferred_viewing_at,
    nullif(btrim(coalesce(p_message,'')),''),v_fee,
    nullif(btrim(coalesce(p_payment_reference,'')),''),v_payment_status,v_status
  );

  return jsonb_build_object(
    'success',true,'request_id',v_id,'request_reference',v_ref,
    'fee_amount_kes',v_fee,'payment_status',v_payment_status,'status',v_status
  );
end
$function$;
revoke all on function public.customer_submit_vacant_house_rider_viewing_request(uuid,text,timestamptz,text) from public;
grant execute on function public.customer_submit_vacant_house_rider_viewing_request(uuid,text,timestamptz,text) to authenticated;

create or replace function public.customer_get_my_vacant_house_rider_viewings()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_rows jsonb;
begin
  if v_user is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'request_reference',r.request_reference,'viewing_request_id',r.viewing_request_id,
    'listing_id',r.listing_id,'listing_title',l.title,'fee_amount_kes',r.fee_amount_kes,
    'payment_status',r.payment_status,'status',r.status,
    'preferred_viewing_at',r.preferred_viewing_at,'customer_message',r.customer_message,
    'admin_notes',r.admin_notes,'rider_notes',r.rider_notes,'assigned_at',r.assigned_at,
    'created_at',r.created_at,'rider_name',s.display_name,'rider_phone',s.phone
  ) order by r.created_at desc),'[]'::jsonb)
  into v_rows
  from public.vacant_house_rider_viewing_requests r
  join public.vacant_house_listings l on l.id=r.listing_id
  left join public.leogo_staff s on s.user_id=r.assigned_rider_id
  where r.customer_user_id=v_user;
  return v_rows;
end
$function$;
revoke all on function public.customer_get_my_vacant_house_rider_viewings() from public;
grant execute on function public.customer_get_my_vacant_house_rider_viewings() to authenticated;

create or replace function public.admin_get_vacant_house_rider_viewing_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_requests jsonb;
  v_riders jsonb;
  v_settings jsonb;
begin
  if not private.is_leogo_admin('approvals.read')
     and not private.is_leogo_admin('delivery.manage')
     and not private.is_leogo_admin('settings.manage')
     and not private.is_leogo_admin('fees.manage') then
    raise exception 'Property rider viewing Admin access required';
  end if;

  select jsonb_build_object(
    'enabled',s.rider_viewing_enabled,'fee_mode',s.rider_viewing_fee_mode,
    'fee_kes',s.rider_viewing_fee_kes,
    'payment_account_id',(select a.account_id from public.payment_account_assignments a where a.function_code='vacant_house_rider_viewing')
  ) into v_settings
  from public.vacant_house_settings s where s.id=1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'request_reference',r.request_reference,'viewing_request_id',r.viewing_request_id,
    'listing_id',r.listing_id,'listing_reference',l.listing_reference,'listing_title',l.title,
    'county',l.county,'sub_county',l.sub_county,'area_estate',l.area_estate,
    'customer_user_id',r.customer_user_id,'customer_name',coalesce(cp.full_name,'LEOGO Customer'),
    'customer_phone',cp.phone,'fee_amount_kes',r.fee_amount_kes,
    'payment_reference',r.payment_reference,'payment_status',r.payment_status,
    'status',r.status,'preferred_viewing_at',r.preferred_viewing_at,
    'customer_message',r.customer_message,'admin_notes',r.admin_notes,
    'assigned_rider_id',r.assigned_rider_id,'rider_name',rs.display_name,
    'created_at',r.created_at,'assigned_at',r.assigned_at
  ) order by r.created_at desc),'[]'::jsonb)
  into v_requests
  from public.vacant_house_rider_viewing_requests r
  join public.vacant_house_listings l on l.id=r.listing_id
  left join public.customer_profiles cp on cp.user_id=r.customer_user_id
  left join public.leogo_staff rs on rs.user_id=r.assigned_rider_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',s.user_id,'display_name',s.display_name,'phone',s.phone,'status',s.status,
    'county_code',s.county_code,'sub_county_code',s.sub_county_code,
    'vehicle_type',s.vehicle_type,'vehicle_registration',s.vehicle_registration
  ) order by s.display_name),'[]'::jsonb)
  into v_riders from public.leogo_staff s
  where s.staff_role='rider' and s.status='active' and s.availability_status='available';

  return jsonb_build_object(
    'settings',coalesce(v_settings,'{}'::jsonb),
    'requests',coalesce(v_requests,'[]'::jsonb),
    'riders',coalesce(v_riders,'[]'::jsonb)
  );
end
$function$;
revoke all on function public.admin_get_vacant_house_rider_viewing_dashboard() from public,anon,authenticated;
grant execute on function public.admin_get_vacant_house_rider_viewing_dashboard() to authenticated;

create or replace function public.admin_save_vacant_house_rider_settings(
  p_enabled boolean,
  p_fee_mode text,
  p_fee_kes numeric
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_fee numeric;
begin
  if not private.is_leogo_admin('settings.manage') and not private.is_leogo_admin('fees.manage') then
    raise exception 'Settings or fee management permission required';
  end if;
  if p_fee_mode not in ('free','fixed') then raise exception 'Choose Free or Standard fee'; end if;
  if coalesce(p_fee_kes,-1)<0 or p_fee_kes>1000000 then raise exception 'Enter a valid rider viewing fee'; end if;
  v_fee:=case when p_fee_mode='fixed' then round(p_fee_kes,2) else 0 end;

  select to_jsonb(s) into v_before from public.vacant_house_settings s where id=1 for update;
  update public.vacant_house_settings
  set rider_viewing_enabled=coalesce(p_enabled,false),
      rider_viewing_fee_mode=p_fee_mode,
      rider_viewing_fee_kes=v_fee,
      updated_by=(select auth.uid()),updated_at=now()
  where id=1 returning to_jsonb(vacant_house_settings.*) into v_after;

  perform private.write_admin_audit(
    'vacant_house.rider_viewing_rules.updated','vacant_house_settings','1',
    v_before,v_after,'{}'::jsonb
  );
  return jsonb_build_object('success',true,'settings',v_after);
end
$function$;
revoke all on function public.admin_save_vacant_house_rider_settings(boolean,text,numeric) from public;
grant execute on function public.admin_save_vacant_house_rider_settings(boolean,text,numeric) to authenticated;

create or replace function public.admin_review_vacant_house_rider_viewing_payment(
  p_request_id uuid,
  p_decision text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row public.vacant_house_rider_viewing_requests%rowtype;
  v_listing public.vacant_house_listings%rowtype;
begin
  if not private.is_leogo_admin('payments.manage') and not private.is_leogo_admin('approvals.manage') then
    raise exception 'Payment or approval permission required';
  end if;
  if p_decision not in ('verify','reject') then raise exception 'Unsupported payment decision'; end if;
  if p_decision='reject' and char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'Give a clear rejection reason'; end if;

  select * into v_row from public.vacant_house_rider_viewing_requests where id=p_request_id for update;
  if not found then raise exception 'Rider viewing request not found'; end if;
  if v_row.payment_status<>'submitted' or v_row.status<>'pending_payment' then
    raise exception 'This rider viewing payment has already been reviewed';
  end if;
  select * into v_listing from public.vacant_house_listings where id=v_row.listing_id;

  update public.vacant_house_rider_viewing_requests
  set payment_status=case when p_decision='verify' then 'verified' else 'rejected' end,
      status=case when p_decision='verify' then 'pending_assignment' else 'pending_payment' end,
      admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
      verified_by=(select auth.uid()),verified_at=now(),updated_at=now()
  where id=p_request_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_row.customer_user_id,
    case when p_decision='verify' then 'vacant_house_rider_fee_verified' else 'vacant_house_rider_fee_rejected' end,
    case when p_decision='verify' then 'LEOGO rider viewing fee verified' else 'LEOGO rider viewing fee needs attention' end,
    case when p_decision='verify'
      then 'Your LEOGO rider fee for "'||coalesce(v_listing.title,'property viewing')||'" was verified. Admin can now assign a Rider.'
      else 'The LEOGO rider fee for "'||coalesce(v_listing.title,'property viewing')||'" was not verified. '||coalesce(p_notes,'Please check the payment reference and resubmit.')
    end,
    'vacant_house_rider_viewing',p_request_id,
    'vh_rider_fee_'||p_decision||'_'||p_request_id::text||'_'||extract(epoch from now())::bigint::text,
    'dashboard',jsonb_build_object('rider_request_id',p_request_id,'listing_id',v_row.listing_id,'decision',p_decision)
  );

  perform private.write_admin_audit(
    'vacant_house.rider_viewing_payment.'||p_decision,
    'vacant_house_rider_viewing_request',p_request_id::text,
    to_jsonb(v_row),(select to_jsonb(r) from public.vacant_house_rider_viewing_requests r where r.id=p_request_id),
    jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''))
  );
  return jsonb_build_object('success',true,'request_id',p_request_id,'payment_status',case when p_decision='verify' then 'verified' else 'rejected' end);
end
$function$;
revoke all on function public.admin_review_vacant_house_rider_viewing_payment(uuid,text,text) from public;
grant execute on function public.admin_review_vacant_house_rider_viewing_payment(uuid,text,text) to authenticated;

create or replace function public.admin_assign_vacant_house_viewing_rider(
  p_request_id uuid,
  p_rider_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row public.vacant_house_rider_viewing_requests%rowtype;
  v_listing public.vacant_house_listings%rowtype;
  v_rider public.leogo_staff%rowtype;
begin
  if not private.is_leogo_admin('delivery.manage') and not private.is_leogo_admin('orders.manage') then
    raise exception 'Rider assignment permission required';
  end if;
  select * into v_row from public.vacant_house_rider_viewing_requests where id=p_request_id for update;
  if not found then raise exception 'Rider viewing request not found'; end if;
  if v_row.payment_status not in ('not_required','verified') or v_row.status not in ('pending_assignment','assigned') then
    raise exception 'Verify the rider fee before assigning a LEOGO Rider';
  end if;
  select * into v_rider from public.leogo_staff
  where user_id=p_rider_id and staff_role='rider' and status='active'
    and availability_status='available';
  if not found then raise exception 'Choose an active available LEOGO Rider'; end if;
  select * into v_listing from public.vacant_house_listings where id=v_row.listing_id;

  update public.vacant_house_rider_viewing_requests
  set assigned_rider_id=p_rider_id,status='assigned',assigned_at=now(),
      admin_notes=null,updated_at=now()
  where id=p_request_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_row.customer_user_id,'vacant_house_rider_assigned','LEOGO Rider assigned',
    'LEOGO assigned a Rider for your physical viewing of "'||coalesce(v_listing.title,'property')||'". Open your property viewing request for the schedule and Rider contact.',
    'vacant_house_rider_viewing',p_request_id,
    'vh_rider_assigned_customer_'||p_request_id::text||'_'||extract(epoch from now())::bigint::text,
    'dashboard',jsonb_build_object('rider_request_id',p_request_id,'listing_id',v_row.listing_id)
  );
  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    p_rider_id,'vacant_house_rider_assignment','Property viewing escort assigned',
    'You have been assigned to accompany a customer for an approved LEOGO property viewing. Check the Rider Dashboard for the schedule and route.',
    'vacant_house_rider_viewing',p_request_id,
    'vh_rider_assignment_'||p_request_id::text||'_'||extract(epoch from now())::bigint::text,
    'dashboard',jsonb_build_object('rider_request_id',p_request_id,'listing_id',v_row.listing_id)
  );

  perform private.write_admin_audit(
    'vacant_house.rider_viewing.assigned','vacant_house_rider_viewing_request',p_request_id::text,
    to_jsonb(v_row),(select to_jsonb(r) from public.vacant_house_rider_viewing_requests r where r.id=p_request_id),
    jsonb_build_object('rider_id',p_rider_id)
  );
  return jsonb_build_object('success',true,'request_id',p_request_id,'rider_id',p_rider_id,'status','assigned');
end
$function$;
revoke all on function public.admin_assign_vacant_house_viewing_rider(uuid,uuid) from public;
grant execute on function public.admin_assign_vacant_house_viewing_rider(uuid,uuid) to authenticated;

create or replace function public.rider_list_vacant_house_viewing_jobs()
returns table(
  request_id uuid,request_reference text,status text,preferred_viewing_at timestamptz,
  listing_title text,listing_reference text,county text,sub_county text,area_estate text,
  exact_address text,landmark text,maps_link text,latitude numeric,longitude numeric,
  customer_name text,customer_phone text,customer_message text,fee_amount_kes numeric,
  rider_notes text,assigned_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if not exists(
    select 1 from public.leogo_staff s
    where s.user_id=(select auth.uid()) and s.staff_role='rider' and s.status='active'
  ) then raise exception 'Active LEOGO Rider account required'; end if;

  return query
  select r.id,r.request_reference,r.status,r.preferred_viewing_at,l.title,l.listing_reference,
    l.county,l.sub_county,l.area_estate,d.exact_address,d.landmark,d.maps_link,d.latitude,d.longitude,
    coalesce(cp.full_name,'LEOGO Customer'),cp.phone,r.customer_message,r.fee_amount_kes,
    r.rider_notes,r.assigned_at
  from public.vacant_house_rider_viewing_requests r
  join public.vacant_house_listings l on l.id=r.listing_id
  join private.vacant_house_private_details d on d.listing_id=l.id
  left join public.customer_profiles cp on cp.user_id=r.customer_user_id
  where r.assigned_rider_id=(select auth.uid())
  order by case r.status when 'assigned' then 0 when 'accepted' then 1 when 'en_route' then 2 when 'arrived' then 3 else 4 end,
    r.preferred_viewing_at nulls last,r.created_at desc;
end
$function$;
revoke all on function public.rider_list_vacant_house_viewing_jobs() from public,anon;
grant execute on function public.rider_list_vacant_house_viewing_jobs() to authenticated;

create or replace function public.rider_update_vacant_house_viewing_status(
  p_request_id uuid,
  p_status text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_row public.vacant_house_rider_viewing_requests%rowtype;
  v_listing public.vacant_house_listings%rowtype;
  v_title text;
begin
  if not exists(
    select 1 from public.leogo_staff s
    where s.user_id=v_user and s.staff_role='rider' and s.status='active'
  ) then raise exception 'Active LEOGO Rider account required'; end if;

  select * into v_row from public.vacant_house_rider_viewing_requests
  where id=p_request_id and assigned_rider_id=v_user for update;
  if not found then raise exception 'This property viewing is not assigned to your Rider account'; end if;
  if not (
    (p_status='accepted' and v_row.status='assigned') or
    (p_status='en_route' and v_row.status in ('assigned','accepted')) or
    (p_status='arrived' and v_row.status='en_route') or
    (p_status='completed' and v_row.status='arrived')
  ) then raise exception 'That Rider status change is not allowed'; end if;
  if char_length(coalesce(p_notes,''))>1000 then raise exception 'Rider note is too long'; end if;

  update public.vacant_house_rider_viewing_requests
  set status=p_status,
      rider_notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),rider_notes),
      completed_at=case when p_status='completed' then now() else completed_at end,
      updated_at=now()
  where id=p_request_id;
  select l.title into v_title from public.vacant_house_listings l where l.id=v_row.listing_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_row.customer_user_id,'vacant_house_rider_status','Property viewing Rider update',
    'The LEOGO Rider for "'||coalesce(v_title,'your property viewing')||'" updated the request to '||replace(p_status,'_',' ')||'.',
    'vacant_house_rider_viewing',p_request_id,
    'vh_rider_status_'||p_request_id::text||'_'||p_status||'_'||extract(epoch from now())::bigint::text,
    'dashboard',jsonb_build_object('rider_request_id',p_request_id,'status',p_status)
  );
  return jsonb_build_object('success',true,'request_id',p_request_id,'status',p_status);
end
$function$;
revoke all on function public.rider_update_vacant_house_viewing_status(uuid,text,text) from public,anon;
grant execute on function public.rider_update_vacant_house_viewing_status(uuid,text,text) to authenticated;
