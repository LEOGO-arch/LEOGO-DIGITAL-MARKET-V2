-- LEOGO DIGITAL MARKET V2
-- Service Provider Item Hiring extension.
-- Additive: existing Normal Service workflow remains unchanged.

alter table public.service_provider_services
  add column if not exists service_type text not null default 'normal',
  add column if not exists hire_item_name text,
  add column if not exists hire_item_image_path text,
  add column if not exists hire_charge_basis text,
  add column if not exists hire_rate_kes numeric(12,2),
  add column if not exists hire_minimum_units integer not null default 1,
  add column if not exists hire_quantity_available integer not null default 1,
  add column if not exists hire_fulfilment text,
  add column if not exists hire_daily_return_time time,
  add column if not exists hire_security_deposit_kes numeric(12,2) not null default 0,
  add column if not exists hire_damage_penalty_kes numeric(12,2) not null default 0,
  add column if not exists hire_damage_terms text,
  add column if not exists hire_late_penalty_basis text,
  add column if not exists hire_late_penalty_kes numeric(12,2) not null default 0,
  add column if not exists hire_terms text;

alter table public.service_provider_services
  drop constraint if exists service_provider_services_service_type_check,
  drop constraint if exists service_provider_services_hire_values_check,
  drop constraint if exists service_provider_services_hire_required_check;

alter table public.service_provider_services
  add constraint service_provider_services_service_type_check
    check (service_type in ('normal','item_hire')),
  add constraint service_provider_services_hire_values_check
    check (
      hire_minimum_units >= 1
      and hire_quantity_available >= 1
      and hire_security_deposit_kes >= 0
      and hire_damage_penalty_kes >= 0
      and hire_late_penalty_kes >= 0
      and (hire_rate_kes is null or hire_rate_kes > 0)
      and (hire_charge_basis is null or hire_charge_basis in ('hour','day','24_hour'))
      and (hire_fulfilment is null or hire_fulfilment in ('pickup','delivery','both'))
      and (hire_late_penalty_basis is null or hire_late_penalty_basis in ('fixed','hour','day','24_hour'))
    ),
  add constraint service_provider_services_hire_required_check
    check (
      service_type='normal'
      or (
        nullif(btrim(coalesce(hire_item_name,'')),'') is not null
        and nullif(btrim(coalesce(hire_item_image_path,'')),'') is not null
        and hire_charge_basis in ('hour','day','24_hour')
        and hire_rate_kes > 0
        and hire_minimum_units >= 1
        and hire_quantity_available >= 1
        and hire_fulfilment in ('pickup','delivery','both')
        and (hire_charge_basis <> 'day' or hire_daily_return_time is not null)
        and (hire_damage_penalty_kes = 0 or nullif(btrim(coalesce(hire_damage_terms,'')),'') is not null)
        and (hire_late_penalty_kes = 0 or hire_late_penalty_basis in ('fixed','hour','day','24_hour'))
        and nullif(btrim(coalesce(hire_terms,'')),'') is not null
      )
    );

alter table public.service_requests
  add column if not exists service_type_snapshot text not null default 'normal',
  add column if not exists hire_item_name_snapshot text,
  add column if not exists hire_item_image_path_snapshot text,
  add column if not exists hire_charge_basis_snapshot text,
  add column if not exists hire_rate_snapshot_kes numeric(12,2),
  add column if not exists hire_units integer,
  add column if not exists hire_quantity integer,
  add column if not exists hire_charge_kes numeric(12,2),
  add column if not exists hire_security_deposit_kes numeric(12,2),
  add column if not exists hire_security_deposit_total_kes numeric(12,2),
  add column if not exists hire_damage_penalty_kes_snapshot numeric(12,2),
  add column if not exists hire_damage_terms_snapshot text,
  add column if not exists hire_late_penalty_basis_snapshot text,
  add column if not exists hire_late_penalty_kes_snapshot numeric(12,2),
  add column if not exists hire_start_at timestamptz,
  add column if not exists hire_expected_return_at timestamptz,
  add column if not exists hire_fulfilment_method text,
  add column if not exists hire_terms_snapshot text,
  add column if not exists hire_handed_over_at timestamptz,
  add column if not exists hire_actual_return_at timestamptz,
  add column if not exists hire_damage_penalty_applied_kes numeric(12,2) not null default 0,
  add column if not exists hire_late_penalty_applied_kes numeric(12,2) not null default 0,
  add column if not exists hire_deposit_refund_due_kes numeric(12,2),
  add column if not exists hire_additional_penalty_due_kes numeric(12,2),
  add column if not exists hire_penalty_notes text;

alter table public.service_requests
  drop constraint if exists service_requests_request_type_check,
  drop constraint if exists service_requests_fee_type_check,
  drop constraint if exists service_requests_hire_values_check;

alter table public.service_requests
  add constraint service_requests_request_type_check
    check (request_type in ('direct','quotation','hire')),
  add constraint service_requests_fee_type_check
    check (
      (request_type='direct' and quotation_fee_kes=0)
      or (request_type='quotation' and direct_request_fee_kes=0)
      or (request_type='hire' and quotation_fee_kes=0)
    ),
  add constraint service_requests_hire_values_check
    check (
      (request_type <> 'hire')
      or (
        service_type_snapshot='item_hire'
        and hire_units >= 1
        and hire_quantity >= 1
        and hire_rate_snapshot_kes > 0
        and hire_charge_kes > 0
        and coalesce(hire_security_deposit_kes,0) >= 0
        and coalesce(hire_security_deposit_total_kes,0) >= 0
        and coalesce(hire_damage_penalty_kes_snapshot,0) >= 0
        and coalesce(hire_late_penalty_kes_snapshot,0) >= 0
        and hire_start_at is not null
        and hire_expected_return_at is not null
        and hire_expected_return_at > hire_start_at
        and hire_fulfilment_method in ('pickup','delivery')
      )
    );

create index if not exists service_requests_hire_schedule_idx
on public.service_requests(service_id,request_type,request_status,hire_start_at,hire_expected_return_at)
where request_type='hire';

create or replace function public.service_provider_save_service_v2(
  p_service_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_account_status text;
  v_id uuid;
  v_row jsonb;
  v_service_type text := coalesce(nullif(btrim(p_payload->>'service_type'),''),'normal');
  v_service_name text := nullif(btrim(coalesce(p_payload->>'service_name','')),'');
  v_category_name text := nullif(btrim(coalesce(p_payload->>'category_name','')),'');
  v_description text := nullif(btrim(coalesce(p_payload->>'description','')),'');
  v_pricing_model text := coalesce(nullif(btrim(p_payload->>'pricing_model'),''),'quote');
  v_price_from numeric := nullif(p_payload->>'price_from_kes','')::numeric;
  v_price_to numeric := nullif(p_payload->>'price_to_kes','')::numeric;
  v_unit_label text := nullif(btrim(coalesce(p_payload->>'unit_label','')),'');
  v_service_area text := nullif(btrim(coalesce(p_payload->>'service_area','')),'');
  v_availability_notes text := nullif(btrim(coalesce(p_payload->>'availability_notes','')),'');
  v_is_available boolean := coalesce((p_payload->>'is_available')::boolean,true);
  v_hire_item_name text := nullif(btrim(coalesce(p_payload->>'hire_item_name','')),'');
  v_hire_item_image_path text := nullif(btrim(coalesce(p_payload->>'hire_item_image_path','')),'');
  v_hire_charge_basis text := nullif(btrim(coalesce(p_payload->>'hire_charge_basis','')),'');
  v_hire_rate numeric := nullif(p_payload->>'hire_rate_kes','')::numeric;
  v_hire_minimum_units integer := coalesce(nullif(p_payload->>'hire_minimum_units','')::integer,1);
  v_hire_quantity integer := coalesce(nullif(p_payload->>'hire_quantity_available','')::integer,1);
  v_hire_fulfilment text := nullif(btrim(coalesce(p_payload->>'hire_fulfilment','')),'');
  v_hire_daily_return_time time := nullif(p_payload->>'hire_daily_return_time','')::time;
  v_security_deposit numeric := coalesce(nullif(p_payload->>'hire_security_deposit_kes','')::numeric,0);
  v_damage_penalty numeric := coalesce(nullif(p_payload->>'hire_damage_penalty_kes','')::numeric,0);
  v_damage_terms text := nullif(btrim(coalesce(p_payload->>'hire_damage_terms','')),'');
  v_late_basis text := nullif(btrim(coalesce(p_payload->>'hire_late_penalty_basis','')),'');
  v_late_penalty numeric := coalesce(nullif(p_payload->>'hire_late_penalty_kes','')::numeric,0);
  v_hire_terms text := nullif(btrim(coalesce(p_payload->>'hire_terms','')),'');
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  select application_status into v_account_status
  from public.service_provider_accounts
  where user_id=v_uid;

  if v_account_status is distinct from 'approved' then
    raise exception 'Your Service Provider account must be approved before adding services';
  end if;

  if v_service_type not in ('normal','item_hire') then
    raise exception 'Choose Normal Service or Item for Hire';
  end if;

  if v_service_type='normal' then
    if v_service_name is null or char_length(v_service_name)<2 then raise exception 'Service name is required'; end if;
    if v_pricing_model not in ('fixed','from','hourly','quote') then raise exception 'Choose a valid pricing model'; end if;
    if v_price_from is not null and v_price_from<0 then raise exception 'Price cannot be negative'; end if;
    if v_price_to is not null and v_price_to<0 then raise exception 'Price cannot be negative'; end if;
    if v_price_from is not null and v_price_to is not null and v_price_to<v_price_from then
      raise exception 'Maximum price cannot be lower than minimum price';
    end if;

    v_hire_item_name:=null;
    v_hire_item_image_path:=null;
    v_hire_charge_basis:=null;
    v_hire_rate:=null;
    v_hire_minimum_units:=1;
    v_hire_quantity:=1;
    v_hire_fulfilment:=null;
    v_hire_daily_return_time:=null;
    v_security_deposit:=0;
    v_damage_penalty:=0;
    v_damage_terms:=null;
    v_late_basis:=null;
    v_late_penalty:=0;
    v_hire_terms:=null;
  else
    if v_hire_item_name is null or char_length(v_hire_item_name)<2 then raise exception 'Item name is required'; end if;
    if v_service_name is null then v_service_name:=v_hire_item_name||' Hire'; end if;
    if v_description is null or char_length(v_description)<10 then raise exception 'Describe the item and its condition for customers'; end if;
    if v_hire_charge_basis not in ('hour','day','24_hour') then raise exception 'Choose a valid hiring charge basis'; end if;
    if v_hire_rate is null or v_hire_rate<=0 or v_hire_rate>100000000 then raise exception 'Enter a valid hiring price'; end if;
    if v_hire_minimum_units<1 or v_hire_minimum_units>365 then raise exception 'Minimum hire period must be at least 1 and no more than 365 units'; end if;
    if v_hire_quantity<1 or v_hire_quantity>100000 then raise exception 'Enter a valid quantity available'; end if;
    if v_hire_fulfilment not in ('pickup','delivery','both') then raise exception 'Choose Pickup, Delivery or Both'; end if;
    if v_hire_charge_basis='day' and v_hire_daily_return_time is null then raise exception 'Set the daily return time for per-day hiring'; end if;
    if v_security_deposit<0 or v_security_deposit>100000000 then raise exception 'Enter a valid security deposit'; end if;
    if v_damage_penalty<0 or v_damage_penalty>100000000 then raise exception 'Enter a valid damage penalty'; end if;
    if v_damage_penalty>0 and (v_damage_terms is null or char_length(v_damage_terms)<5) then raise exception 'Explain when the damage penalty may apply'; end if;
    if v_late_penalty<0 or v_late_penalty>100000000 then raise exception 'Enter a valid late-return penalty'; end if;
    if v_late_penalty>0 and v_late_basis not in ('fixed','hour','day','24_hour') then raise exception 'Choose how the late-return penalty is charged'; end if;
    if v_hire_terms is null or char_length(v_hire_terms)<10 then raise exception 'Add clear hiring terms for the customer'; end if;
    if v_hire_item_image_path is null then raise exception 'Upload a clear picture of the item being offered for hire'; end if;
    if split_part(v_hire_item_image_path,'/',1)<>v_uid::text then raise exception 'The item photo must belong to your Service Provider account'; end if;

    -- Keep generic price fields populated for existing Admin/search/report surfaces.
    v_pricing_model:='fixed';
    v_price_from:=round(v_hire_rate,2);
    v_price_to:=null;
    v_unit_label:=case v_hire_charge_basis when 'hour' then 'per hour' when 'day' then 'per day' else 'per 24 hours' end;
  end if;

  if p_service_id is null then
    insert into public.service_provider_services(
      provider_id,service_name,category_name,description,pricing_model,price_from_kes,price_to_kes,unit_label,
      service_area,availability_notes,is_available,approval_status,admin_notes,submitted_at,updated_at,
      service_type,hire_item_name,hire_item_image_path,hire_charge_basis,hire_rate_kes,hire_minimum_units,
      hire_quantity_available,hire_fulfilment,hire_daily_return_time,hire_security_deposit_kes,
      hire_damage_penalty_kes,hire_damage_terms,hire_late_penalty_basis,hire_late_penalty_kes,hire_terms
    ) values(
      v_uid,v_service_name,v_category_name,v_description,v_pricing_model,v_price_from,v_price_to,v_unit_label,
      v_service_area,v_availability_notes,v_is_available,'pending',null,now(),now(),
      v_service_type,v_hire_item_name,v_hire_item_image_path,v_hire_charge_basis,v_hire_rate,v_hire_minimum_units,
      v_hire_quantity,v_hire_fulfilment,v_hire_daily_return_time,v_security_deposit,
      v_damage_penalty,v_damage_terms,v_late_basis,v_late_penalty,v_hire_terms
    ) returning id into v_id;
  else
    update public.service_provider_services
    set service_name=v_service_name,
        category_name=v_category_name,
        description=v_description,
        pricing_model=v_pricing_model,
        price_from_kes=v_price_from,
        price_to_kes=v_price_to,
        unit_label=v_unit_label,
        service_area=v_service_area,
        availability_notes=v_availability_notes,
        is_available=v_is_available,
        service_type=v_service_type,
        hire_item_name=v_hire_item_name,
        hire_item_image_path=v_hire_item_image_path,
        hire_charge_basis=v_hire_charge_basis,
        hire_rate_kes=v_hire_rate,
        hire_minimum_units=v_hire_minimum_units,
        hire_quantity_available=v_hire_quantity,
        hire_fulfilment=v_hire_fulfilment,
        hire_daily_return_time=v_hire_daily_return_time,
        hire_security_deposit_kes=v_security_deposit,
        hire_damage_penalty_kes=v_damage_penalty,
        hire_damage_terms=v_damage_terms,
        hire_late_penalty_basis=v_late_basis,
        hire_late_penalty_kes=v_late_penalty,
        hire_terms=v_hire_terms,
        approval_status='pending',
        admin_notes=null,
        submitted_at=now(),
        approved_at=null,
        approved_by=null,
        flash_sale_requested=false,
        flash_sale_price_kes=null,
        flash_sale_starts_at=null,
        flash_sale_ends_at=null,
        flash_sale_status='none',
        flash_sale_admin_notes=null,
        flash_sale_reviewed_at=null,
        flash_sale_reviewed_by=null,
        updated_at=now()
    where id=p_service_id and provider_id=v_uid
    returning id into v_id;

    if v_id is null then raise exception 'Service listing not found'; end if;
  end if;

  select to_jsonb(s) into v_row
  from public.service_provider_services s
  where s.id=v_id;

  return v_row;
end
$function$;

revoke all on function public.service_provider_save_service_v2(uuid,jsonb) from public,anon;
grant execute on function public.service_provider_save_service_v2(uuid,jsonb) to authenticated;

drop function if exists public.customer_public_services();

create function public.customer_public_services()
returns table(
  service_id uuid,
  provider_id uuid,
  service_name text,
  category_name text,
  description text,
  pricing_model text,
  price_from_kes numeric,
  price_to_kes numeric,
  unit_label text,
  service_area text,
  availability_notes text,
  business_name text,
  primary_service text,
  county text,
  sub_county text,
  town text,
  profile_picture_path text,
  rating_average numeric,
  rating_count bigint,
  service_type text,
  hire_item_name text,
  hire_item_image_path text,
  hire_charge_basis text,
  hire_rate_kes numeric,
  hire_minimum_units integer,
  hire_quantity_available integer,
  hire_fulfilment text,
  hire_daily_return_time time,
  hire_security_deposit_kes numeric,
  hire_damage_penalty_kes numeric,
  hire_damage_terms text,
  hire_late_penalty_basis text,
  hire_late_penalty_kes numeric,
  hire_terms text
)
language sql
security definer
set search_path=''
as $function$
  select
    s.id,s.provider_id,s.service_name,s.category_name,s.description,
    s.pricing_model,s.price_from_kes,s.price_to_kes,s.unit_label,
    s.service_area,s.availability_notes,
    p.business_name,p.primary_service,p.county,p.sub_county,p.town,p.profile_picture_path,
    coalesce((
      select round(avg(r.rating)::numeric,1)
      from public.partner_service_reviews r
      where r.partner_type='service_provider'
        and r.service_id=s.id
        and r.moderation_status='approved'
    ),0::numeric) as rating_average,
    (
      select count(*)
      from public.partner_service_reviews r
      where r.partner_type='service_provider'
        and r.service_id=s.id
        and r.moderation_status='approved'
    )::bigint as rating_count,
    s.service_type,s.hire_item_name,s.hire_item_image_path,s.hire_charge_basis,s.hire_rate_kes,
    s.hire_minimum_units,s.hire_quantity_available,s.hire_fulfilment,s.hire_daily_return_time,
    s.hire_security_deposit_kes,s.hire_damage_penalty_kes,s.hire_damage_terms,
    s.hire_late_penalty_basis,s.hire_late_penalty_kes,s.hire_terms
  from public.service_provider_services s
  join public.service_provider_accounts p on p.user_id=s.provider_id
  where s.approval_status='approved'
    and s.is_available
    and p.application_status='approved'
    and p.availability_status<>'offline'
    and private.partner_has_active_subscription(p.user_id,'service_provider')
  order by s.approved_at desc nulls last,s.service_name;
$function$;

revoke all on function public.customer_public_services() from public;
grant execute on function public.customer_public_services() to anon,authenticated;

drop function if exists public.admin_list_service_listings();

create function public.admin_list_service_listings()
returns table(
  service_id uuid,
  provider_id uuid,
  provider_name text,
  provider_email text,
  service_name text,
  category_name text,
  description text,
  pricing_model text,
  price_from_kes numeric,
  price_to_kes numeric,
  unit_label text,
  service_area text,
  availability_notes text,
  is_available boolean,
  approval_status text,
  admin_notes text,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  service_type text,
  hire_item_name text,
  hire_item_image_path text,
  hire_charge_basis text,
  hire_rate_kes numeric,
  hire_minimum_units integer,
  hire_quantity_available integer,
  hire_fulfilment text,
  hire_daily_return_time time,
  hire_security_deposit_kes numeric,
  hire_damage_penalty_kes numeric,
  hire_damage_terms text,
  hire_late_penalty_basis text,
  hire_late_penalty_kes numeric,
  hire_terms text
)
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if not private.is_leogo_admin('approvals.read') then
    raise exception 'Admin access required';
  end if;

  return query
  select
    s.id,s.provider_id,p.business_name,u.email::text,s.service_name,s.category_name,s.description,
    s.pricing_model,s.price_from_kes,s.price_to_kes,s.unit_label,s.service_area,s.availability_notes,
    s.is_available,s.approval_status,s.admin_notes,s.submitted_at,s.approved_at,s.created_at,s.updated_at,
    s.service_type,s.hire_item_name,s.hire_item_image_path,s.hire_charge_basis,s.hire_rate_kes,
    s.hire_minimum_units,s.hire_quantity_available,s.hire_fulfilment,s.hire_daily_return_time,
    s.hire_security_deposit_kes,s.hire_damage_penalty_kes,s.hire_damage_terms,
    s.hire_late_penalty_basis,s.hire_late_penalty_kes,s.hire_terms
  from public.service_provider_services s
  join public.service_provider_accounts p on p.user_id=s.provider_id
  left join auth.users u on u.id=s.provider_id
  order by
    case s.approval_status when 'pending' then 1 when 'under_review' then 2 when 'changes_requested' then 3 when 'approved' then 4 when 'rejected' then 5 else 6 end,
    s.updated_at desc;
end
$function$;

revoke all on function public.admin_list_service_listings() from public,anon;
grant execute on function public.admin_list_service_listings() to authenticated;

create or replace function public.customer_create_hire_request(
  p_service_id uuid,
  p_hire_units integer,
  p_hire_quantity integer,
  p_hire_start_date date,
  p_hire_start_time time,
  p_fulfilment_method text,
  p_request_details text,
  p_service_location text,
  p_nearest_landmark text default null,
  p_payment_reference text default null,
  p_service_county text default null,
  p_service_sub_county text default null,
  p_service_town_estate text default null,
  p_location_description text default null,
  p_map_link text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_terms_accepted boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_service public.service_provider_services%rowtype;
  v_direct_fee numeric(12,2) := 0;
  v_account_id uuid;
  v_payment_reference text := nullif(upper(btrim(coalesce(p_payment_reference,''))),'');
  v_payment_status text := 'not_required';
  v_status text := 'submitted';
  v_request_id uuid;
  v_reference text;
  v_start_at timestamptz;
  v_expected_return_at timestamptz;
  v_hire_charge numeric(12,2);
  v_deposit_total numeric(12,2);
  v_reserved integer := 0;
begin
  if v_uid is null then raise exception 'Sign in to hire an item'; end if;
  if not coalesce(p_terms_accepted,false) then raise exception 'Accept the hiring terms, deposit and penalty rules before continuing'; end if;
  if p_hire_units is null or p_hire_units<1 then raise exception 'Choose a valid hire period'; end if;
  if p_hire_quantity is null or p_hire_quantity<1 then raise exception 'Choose a valid quantity'; end if;
  if p_hire_start_date is null or p_hire_start_time is null then raise exception 'Choose the hire start date and time'; end if;
  if char_length(btrim(coalesce(p_request_details,'')))<10 then raise exception 'Add a short note about how you intend to use the item'; end if;
  if char_length(btrim(coalesce(p_service_location,'')))<3 then raise exception 'Enter your location or delivery address'; end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then raise exception 'Latitude is invalid'; end if;
  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then raise exception 'Longitude is invalid'; end if;
  if (p_latitude is null) <> (p_longitude is null) then raise exception 'Latitude and longitude must be provided together'; end if;
  if not exists(select 1 from public.customer_profiles where user_id=v_uid) then
    raise exception 'Complete your customer profile before hiring an item';
  end if;

  select s.* into v_service
  from public.service_provider_services s
  join public.service_provider_accounts p on p.user_id=s.provider_id
  where s.id=p_service_id
    and s.service_type='item_hire'
    and s.approval_status='approved'
    and s.is_available
    and p.application_status='approved'
    and p.availability_status<>'offline'
    and private.partner_has_active_subscription(p.user_id,'service_provider')
  for update of s;

  if not found then raise exception 'This item is not currently available for hire'; end if;
  if p_hire_units<v_service.hire_minimum_units then
    raise exception 'Minimum hire period is % unit(s)',v_service.hire_minimum_units;
  end if;
  if p_hire_quantity>v_service.hire_quantity_available then
    raise exception 'Only % item(s) are listed as available',v_service.hire_quantity_available;
  end if;

  if p_fulfilment_method not in ('pickup','delivery') then raise exception 'Choose Pickup or Delivery'; end if;
  if v_service.hire_fulfilment='pickup' and p_fulfilment_method<>'pickup' then raise exception 'This item is available for customer pickup only'; end if;
  if v_service.hire_fulfilment='delivery' and p_fulfilment_method<>'delivery' then raise exception 'This item is available for provider delivery only'; end if;

  v_start_at := (p_hire_start_date + p_hire_start_time) at time zone 'Africa/Nairobi';
  if v_start_at<=now() then raise exception 'Hire start date and time must be in the future'; end if;

  if v_service.hire_charge_basis='hour' then
    v_expected_return_at:=v_start_at + make_interval(hours=>p_hire_units);
  elsif v_service.hire_charge_basis='24_hour' then
    v_expected_return_at:=v_start_at + make_interval(days=>p_hire_units);
  elsif v_service.hire_charge_basis='day' then
    if v_service.hire_daily_return_time is null then raise exception 'The provider has not configured the daily return time'; end if;
    if p_hire_start_time>=v_service.hire_daily_return_time then
      raise exception 'For per-day hire, start time must be before the provider return time of %',to_char(v_service.hire_daily_return_time,'HH24:MI');
    end if;
    v_expected_return_at:=((p_hire_start_date+(p_hire_units-1))+v_service.hire_daily_return_time) at time zone 'Africa/Nairobi';
  else
    raise exception 'The provider hiring terms are incomplete';
  end if;

  select coalesce(sum(coalesce(r.hire_quantity,0)),0)::integer into v_reserved
  from public.service_requests r
  where r.service_id=p_service_id
    and r.request_type='hire'
    and r.request_status in ('submitted','awaiting_payment_verification','payment_verified','dispatched','accepted','in_progress')
    and r.hire_start_at < v_expected_return_at
    and r.hire_expected_return_at > v_start_at;

  if v_reserved+p_hire_quantity>v_service.hire_quantity_available then
    raise exception 'The requested quantity is not available for the selected hire period. Try another time or reduce the quantity.';
  end if;

  v_hire_charge:=round(v_service.hire_rate_kes*p_hire_units*p_hire_quantity,2);
  v_deposit_total:=round(coalesce(v_service.hire_security_deposit_kes,0)*p_hire_quantity,2);

  select direct_request_fee_kes into v_direct_fee
  from public.service_marketplace_settings where id=1;
  v_direct_fee:=coalesce(v_direct_fee,50);

  if v_direct_fee>0 then
    if v_payment_reference is null or char_length(v_payment_reference)<6 or char_length(v_payment_reference)>80 then
      raise exception 'Enter a valid payment reference for the LEOGO hire request fee';
    end if;
    select a.account_id into v_account_id
    from public.payment_account_assignments a
    join public.payment_accounts p on p.id=a.account_id
    where a.function_code='service_payments' and p.status='active'
    limit 1;
    if v_account_id is null then raise exception 'Service payment destination is being configured. Please try again shortly.'; end if;
    v_payment_status:='pending_verification';
    v_status:='awaiting_payment_verification';
  end if;

  v_reference:='HR-'||to_char(now() at time zone 'Africa/Nairobi','YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  insert into public.service_requests(
    request_reference,customer_id,service_id,provider_id,request_type,request_details,
    service_location,nearest_landmark,preferred_date,preferred_time,
    service_county,service_sub_county,service_town_estate,location_description,map_link,latitude,longitude,
    service_type_snapshot,service_pricing_model_snapshot,service_normal_price_snapshot_kes,service_price_snapshot_kes,service_flash_sale_applied,
    hire_item_name_snapshot,hire_item_image_path_snapshot,hire_charge_basis_snapshot,hire_rate_snapshot_kes,
    hire_units,hire_quantity,hire_charge_kes,hire_security_deposit_kes,hire_security_deposit_total_kes,
    hire_damage_penalty_kes_snapshot,hire_damage_terms_snapshot,hire_late_penalty_basis_snapshot,hire_late_penalty_kes_snapshot,
    hire_start_at,hire_expected_return_at,hire_fulfilment_method,hire_terms_snapshot,
    direct_request_fee_kes,quotation_fee_kes,quotation_fee_account_id,payment_reference,payment_status,request_status
  ) values(
    v_reference,v_uid,v_service.id,v_service.provider_id,'hire',btrim(p_request_details),
    btrim(p_service_location),nullif(btrim(coalesce(p_nearest_landmark,'')),''),
    p_hire_start_date,p_hire_start_time,
    nullif(btrim(coalesce(p_service_county,'')),''),
    nullif(btrim(coalesce(p_service_sub_county,'')),''),
    nullif(btrim(coalesce(p_service_town_estate,'')),''),
    nullif(btrim(coalesce(p_location_description,'')),''),
    nullif(btrim(coalesce(p_map_link,'')),''),
    p_latitude,p_longitude,
    'item_hire','hire_'||v_service.hire_charge_basis,v_service.hire_rate_kes,v_hire_charge,false,
    v_service.hire_item_name,v_service.hire_item_image_path,v_service.hire_charge_basis,v_service.hire_rate_kes,
    p_hire_units,p_hire_quantity,v_hire_charge,v_service.hire_security_deposit_kes,v_deposit_total,
    v_service.hire_damage_penalty_kes,v_service.hire_damage_terms,v_service.hire_late_penalty_basis,v_service.hire_late_penalty_kes,
    v_start_at,v_expected_return_at,p_fulfilment_method,v_service.hire_terms,
    v_direct_fee,0,v_account_id,v_payment_reference,v_payment_status,v_status
  ) returning id into v_request_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_uid,'service_request','Item hire request received',
    'Hire request '||v_reference||' for '||v_service.hire_item_name||
      case when v_status='awaiting_payment_verification' then ' is waiting for the LEOGO request fee verification.' else ' is waiting for LEOGO Admin dispatch.' end,
    'service_request',v_request_id,'hire_request_created_'||v_request_id::text,'orders',
    jsonb_build_object(
      'request_reference',v_reference,'request_type','hire','hire_charge_kes',v_hire_charge,
      'security_deposit_kes',v_deposit_total,'hire_start_at',v_start_at,'hire_expected_return_at',v_expected_return_at
    )
  );

  return jsonb_build_object(
    'ok',true,'request_id',v_request_id,'request_reference',v_reference,'request_status',v_status,
    'payment_status',v_payment_status,'direct_request_fee_kes',v_direct_fee,
    'hire_charge_kes',v_hire_charge,'security_deposit_total_kes',v_deposit_total,
    'hire_start_at',v_start_at,'hire_expected_return_at',v_expected_return_at
  );
exception when unique_violation then
  raise exception 'This payment reference has already been submitted';
end
$function$;

revoke all on function public.customer_create_hire_request(uuid,integer,integer,date,time without time zone,text,text,text,text,text,text,text,text,text,text,numeric,numeric,boolean) from public,anon;
grant execute on function public.customer_create_hire_request(uuid,integer,integer,date,time without time zone,text,text,text,text,text,text,text,text,text,text,numeric,numeric,boolean) to authenticated;

create or replace function public.service_provider_update_hire_job(
  p_request_id uuid,
  p_action text,
  p_damage_penalty_kes numeric default 0,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_request public.service_requests%rowtype;
  v_new_status text;
  v_title text;
  v_message text;
  v_damage numeric(12,2) := 0;
  v_late numeric(12,2) := 0;
  v_late_units numeric := 0;
  v_total_penalty numeric(12,2) := 0;
  v_refund_due numeric(12,2) := 0;
  v_additional_due numeric(12,2) := 0;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  select * into v_request
  from public.service_requests
  where id=p_request_id and provider_id=v_uid and request_type='hire'
  for update;

  if not found then raise exception 'Item hire job not found'; end if;

  if p_action='decline' then
    if v_request.request_status<>'dispatched' then raise exception 'This hire request can no longer be declined'; end if;
    if char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'Enter a reason for declining'; end if;
    v_new_status:='declined';
    v_title:='Item hire request declined';
    v_message:=v_request.request_reference||' was declined by the item owner. LEOGO Admin will follow up.';
  elsif p_action='accept' then
    if v_request.request_status<>'dispatched' then raise exception 'This hire request cannot be confirmed now'; end if;
    v_new_status:='accepted';
    v_title:='Item availability confirmed';
    v_message:='The provider confirmed availability for '||v_request.request_reference||'.';
  elsif p_action='handover' then
    if v_request.request_status<>'accepted' then raise exception 'Confirm item availability before handover'; end if;
    v_new_status:='in_progress';
    v_title:='Hired item handed over';
    v_message:=v_request.request_reference||' is now active. The provider marked the item as handed over.';
  elsif p_action='return' then
    if v_request.request_status<>'in_progress' then raise exception 'Only an active hire can be marked returned'; end if;
    v_damage:=round(coalesce(p_damage_penalty_kes,0),2);
    if v_damage<0 then raise exception 'Damage penalty cannot be negative'; end if;
    if v_damage>coalesce(v_request.hire_damage_penalty_kes_snapshot,0) then
      raise exception 'Damage penalty cannot exceed the agreed maximum of KSh %',
        trim(to_char(coalesce(v_request.hire_damage_penalty_kes_snapshot,0),'FM999999999990.00'));
    end if;

    if now()>v_request.hire_expected_return_at and coalesce(v_request.hire_late_penalty_kes_snapshot,0)>0 then
      if v_request.hire_late_penalty_basis_snapshot='fixed' then
        v_late:=v_request.hire_late_penalty_kes_snapshot;
      elsif v_request.hire_late_penalty_basis_snapshot='hour' then
        v_late_units:=ceil(extract(epoch from (now()-v_request.hire_expected_return_at))/3600.0);
        v_late:=round(v_late_units*v_request.hire_late_penalty_kes_snapshot,2);
      elsif v_request.hire_late_penalty_basis_snapshot in ('day','24_hour') then
        v_late_units:=ceil(extract(epoch from (now()-v_request.hire_expected_return_at))/86400.0);
        v_late:=round(v_late_units*v_request.hire_late_penalty_kes_snapshot,2);
      end if;
    end if;

    v_total_penalty:=coalesce(v_damage,0)+coalesce(v_late,0);
    v_refund_due:=greatest(coalesce(v_request.hire_security_deposit_total_kes,0)-v_total_penalty,0);
    v_additional_due:=greatest(v_total_penalty-coalesce(v_request.hire_security_deposit_total_kes,0),0);

    v_new_status:='completed';
    v_title:='Item hire completed';
    v_message:=v_request.request_reference||' was marked returned/completed. Deposit refund due: KSh '||
      trim(to_char(v_refund_due,'FM999999999990.00'))||
      case when v_additional_due>0 then '. Additional penalty due: KSh '||trim(to_char(v_additional_due,'FM999999999990.00')) else '.' end;
  else
    raise exception 'Unsupported item hire action';
  end if;

  update public.service_requests
  set request_status=v_new_status,
      provider_quote_notes=case when p_action in ('decline','return') then nullif(btrim(coalesce(p_notes,'')),'') else provider_quote_notes end,
      responded_at=case when p_action in ('accept','decline') then now() else responded_at end,
      started_at=case when p_action='handover' then now() else started_at end,
      hire_handed_over_at=case when p_action='handover' then now() else hire_handed_over_at end,
      completed_at=case when p_action='return' then now() else completed_at end,
      hire_actual_return_at=case when p_action='return' then now() else hire_actual_return_at end,
      hire_damage_penalty_applied_kes=case when p_action='return' then v_damage else hire_damage_penalty_applied_kes end,
      hire_late_penalty_applied_kes=case when p_action='return' then v_late else hire_late_penalty_applied_kes end,
      hire_deposit_refund_due_kes=case when p_action='return' then v_refund_due else hire_deposit_refund_due_kes end,
      hire_additional_penalty_due_kes=case when p_action='return' then v_additional_due else hire_additional_penalty_due_kes end,
      hire_penalty_notes=case when p_action='return' then nullif(btrim(coalesce(p_notes,'')),'') else hire_penalty_notes end,
      provider_labour_kes=case when p_action='return' then hire_charge_kes else provider_labour_kes end,
      updated_at=now()
  where id=p_request_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_request.customer_id,'service_request',v_title,v_message,'service_request',p_request_id,
    'hire_request_'||v_new_status||'_'||p_request_id::text,'orders',
    jsonb_build_object(
      'request_status',v_new_status,
      'damage_penalty_kes',case when p_action='return' then v_damage else null end,
      'late_penalty_kes',case when p_action='return' then v_late else null end,
      'deposit_refund_due_kes',case when p_action='return' then v_refund_due else null end,
      'additional_penalty_due_kes',case when p_action='return' then v_additional_due else null end
    )
  );

  return jsonb_build_object(
    'ok',true,'request_status',v_new_status,
    'damage_penalty_kes',v_damage,'late_penalty_kes',v_late,
    'deposit_refund_due_kes',v_refund_due,'additional_penalty_due_kes',v_additional_due
  );
end
$function$;

revoke all on function public.service_provider_update_hire_job(uuid,text,numeric,text) from public,anon;
grant execute on function public.service_provider_update_hire_job(uuid,text,numeric,text) to authenticated;

create or replace function public.admin_verify_service_quotation_payment(
  p_request_id uuid,
  p_approved boolean,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_request public.service_requests%rowtype;
  v_fee_label text;
begin
  if not private.is_leogo_admin('orders.payment_verify')
     and not private.is_leogo_admin('approvals.manage') then
    raise exception 'Payment verification permission required';
  end if;

  select * into v_request
  from public.service_requests
  where id=p_request_id
  for update;

  if not found then raise exception 'Service request not found'; end if;
  if v_request.payment_status<>'pending_verification' then
    raise exception 'This service request payment is no longer awaiting verification';
  end if;

  v_fee_label:=case
    when v_request.request_type='direct' then 'Direct request fee'
    when v_request.request_type='hire' then 'Item hire request fee'
    else 'Quotation fee'
  end;

  update public.service_requests
  set payment_status=case when p_approved then 'verified' else 'rejected' end,
      request_status=case when p_approved then 'payment_verified' else 'payment_rejected' end,
      admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
      payment_verified_at=now(),
      payment_verified_by=(select auth.uid()),
      updated_at=now()
  where id=p_request_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_request.customer_id,'service_payment',
    v_fee_label||case when p_approved then ' verified' else ' not verified' end,
    'Payment for service request '||v_request.request_reference||
      case when p_approved then ' has been verified and is ready for Admin dispatch.'
           else ' could not be verified. Contact LEOGO Customer Care if you need help.' end,
    'service_request',p_request_id,
    'service_payment_'||case when p_approved then 'verified_' else 'rejected_' end||p_request_id::text,
    'orders',jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''))
  );

  perform private.write_admin_audit(
    'service_request.payment.'||case when p_approved then 'verified' else 'rejected' end,
    'service_request',p_request_id::text,to_jsonb(v_request),null,
    jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''))
  );

  return jsonb_build_object('ok',true,'payment_status',case when p_approved then 'verified' else 'rejected' end);
end
$function$;

revoke all on function public.admin_verify_service_quotation_payment(uuid,boolean,text) from public,anon;
grant execute on function public.admin_verify_service_quotation_payment(uuid,boolean,text) to authenticated;

create or replace function public.service_provider_request_flash_sale(
  p_service_id uuid,
  p_flash_price_kes numeric,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_service public.service_provider_services%rowtype;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(
    select 1 from public.service_provider_accounts a
    where a.user_id=v_uid and a.application_status='approved'
  ) then raise exception 'Approved Service Provider account required'; end if;

  select * into v_service
  from public.service_provider_services
  where id=p_service_id and provider_id=v_uid
  for update;

  if not found then raise exception 'Service listing not found'; end if;
  if v_service.service_type='item_hire' then
    raise exception 'Item-for-hire listings use their approved hire rate and are not eligible for Service Flash Sale';
  end if;
  if v_service.approval_status<>'approved' or not v_service.is_available then
    raise exception 'Only an approved and available service can enter Flash Sale';
  end if;
  if v_service.pricing_model<>'fixed' or coalesce(v_service.price_from_kes,0)<=0 then
    raise exception 'Flash Sale is available only for fixed-price services';
  end if;
  if p_flash_price_kes is null or p_flash_price_kes<=0 or p_flash_price_kes>=v_service.price_from_kes then
    raise exception 'Flash Sale price must be below the approved fixed service price';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at or p_ends_at<=now() then
    raise exception 'Choose a valid Flash Sale start and end time';
  end if;

  update public.service_provider_services
  set flash_sale_requested=true,
      flash_sale_price_kes=round(p_flash_price_kes,2),
      flash_sale_starts_at=p_starts_at,
      flash_sale_ends_at=p_ends_at,
      flash_sale_status='requested',
      flash_sale_admin_notes=null,
      flash_sale_reviewed_at=null,
      flash_sale_reviewed_by=null,
      updated_at=now()
  where id=v_service.id;

  return jsonb_build_object('ok',true,'service_id',v_service.id,'flash_sale_status','requested');
end
$function$;

revoke all on function public.service_provider_request_flash_sale(uuid,numeric,timestamptz,timestamptz) from public,anon;
grant execute on function public.service_provider_request_flash_sale(uuid,numeric,timestamptz,timestamptz) to authenticated;
