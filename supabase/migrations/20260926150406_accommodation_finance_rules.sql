-- Accommodation finance rules.
-- Hotel commission defaults to 10%; customer service fee defaults to 3%.
-- Rates are snapshotted on each booking so later Admin changes affect new bookings only.

create table if not exists public.accommodation_finance_settings (
  id smallint primary key default 1 check (id=1),
  hotel_commission_percent numeric(5,2) not null default 10 check (hotel_commission_percent between 0 and 100),
  customer_service_fee_percent numeric(5,2) not null default 3 check (customer_service_fee_percent between 0 and 100),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.accommodation_finance_settings(id,hotel_commission_percent,customer_service_fee_percent)
values(1,10,3)
on conflict(id) do nothing;

alter table public.accommodation_finance_settings enable row level security;
revoke all on table public.accommodation_finance_settings from public,anon,authenticated;

alter table public.accommodation_bookings
  add column if not exists hotel_booking_amount_kes integer,
  add column if not exists hotel_commission_percent numeric(5,2),
  add column if not exists hotel_commission_kes integer,
  add column if not exists customer_service_fee_percent numeric(5,2),
  add column if not exists customer_service_fee_kes integer,
  add column if not exists customer_total_kes integer,
  add column if not exists hotel_net_amount_kes integer,
  add column if not exists leogo_revenue_kes integer;

update public.accommodation_bookings
set hotel_booking_amount_kes=coalesce(hotel_booking_amount_kes,nightly_price_kes*nights),
    hotel_commission_percent=coalesce(hotel_commission_percent,10),
    customer_service_fee_percent=coalesce(customer_service_fee_percent,3);

update public.accommodation_bookings
set hotel_commission_kes=coalesce(hotel_commission_kes,round(hotel_booking_amount_kes*hotel_commission_percent/100.0)::integer),
    customer_service_fee_kes=coalesce(customer_service_fee_kes,round(hotel_booking_amount_kes*customer_service_fee_percent/100.0)::integer);

update public.accommodation_bookings
set hotel_net_amount_kes=coalesce(hotel_net_amount_kes,hotel_booking_amount_kes-hotel_commission_kes),
    customer_total_kes=coalesce(customer_total_kes,hotel_booking_amount_kes+customer_service_fee_kes),
    leogo_revenue_kes=coalesce(leogo_revenue_kes,hotel_commission_kes+customer_service_fee_kes);

update public.accommodation_bookings
set total_amount_kes=customer_total_kes
where customer_total_kes is not null;

alter table public.accommodation_bookings
  alter column hotel_booking_amount_kes set not null,
  alter column hotel_commission_percent set not null,
  alter column hotel_commission_kes set not null,
  alter column customer_service_fee_percent set not null,
  alter column customer_service_fee_kes set not null,
  alter column customer_total_kes set not null,
  alter column hotel_net_amount_kes set not null,
  alter column leogo_revenue_kes set not null;

alter table public.accommodation_bookings
  drop constraint if exists accommodation_bookings_hotel_booking_amount_check,
  drop constraint if exists accommodation_bookings_hotel_commission_percent_check,
  drop constraint if exists accommodation_bookings_hotel_commission_check,
  drop constraint if exists accommodation_bookings_customer_service_fee_percent_check,
  drop constraint if exists accommodation_bookings_customer_service_fee_check,
  drop constraint if exists accommodation_bookings_customer_total_check,
  drop constraint if exists accommodation_bookings_hotel_net_check,
  drop constraint if exists accommodation_bookings_leogo_revenue_check;

alter table public.accommodation_bookings
  add constraint accommodation_bookings_hotel_booking_amount_check check (hotel_booking_amount_kes>0),
  add constraint accommodation_bookings_hotel_commission_percent_check check (hotel_commission_percent between 0 and 100),
  add constraint accommodation_bookings_hotel_commission_check check (hotel_commission_kes>=0),
  add constraint accommodation_bookings_customer_service_fee_percent_check check (customer_service_fee_percent between 0 and 100),
  add constraint accommodation_bookings_customer_service_fee_check check (customer_service_fee_kes>=0),
  add constraint accommodation_bookings_customer_total_check check (customer_total_kes>0),
  add constraint accommodation_bookings_hotel_net_check check (hotel_net_amount_kes>=0),
  add constraint accommodation_bookings_leogo_revenue_check check (leogo_revenue_kes>=0);

drop function if exists public.accommodation_provider_list_bookings();
drop function if exists public.admin_list_accommodation_bookings();

CREATE OR REPLACE FUNCTION public.accommodation_provider_list_bookings()
 RETURNS TABLE(id uuid, booking_reference text, customer_id uuid, property_id uuid, unit_id uuid, rate_id uuid, property_name text, room_name text, room_category text, rate_name text, meal_plan text, occupancy_type text, occupancy_pax smallint, guest_name text, guest_phone text, check_in date, check_out date, nights smallint, guests smallint, nightly_price_kes integer, hotel_booking_amount_kes integer, hotel_commission_percent numeric, hotel_commission_kes integer, customer_service_fee_percent numeric, customer_service_fee_kes integer, customer_total_kes integer, hotel_net_amount_kes integer, leogo_revenue_kes integer, total_amount_kes integer, special_requests text, booking_status text, host_response text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_host_id uuid;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select h.id into v_host_id
  from public.accommodation_hosts h
  where h.user_id=v_uid
    and h.verification_status in ('approved','suspended');
  if v_host_id is null then raise exception 'Accommodation Provider account required'; end if;

  return query
  select
    b.id,b.booking_reference,b.customer_id,b.property_id,b.unit_id,b.rate_id,
    b.property_name_snapshot,b.unit_name_snapshot,coalesce(u.room_category,'Room'),
    coalesce(b.rate_name_snapshot,r.rate_name),coalesce(b.meal_plan_snapshot,r.meal_plan),
    coalesce(b.occupancy_type_snapshot,r.occupancy_type),coalesce(b.occupancy_pax_snapshot,r.occupancy_pax),
    b.guest_name,b.guest_phone,b.check_in,b.check_out,b.nights,b.guests,b.nightly_price_kes,
    b.hotel_booking_amount_kes,b.hotel_commission_percent,b.hotel_commission_kes,
    b.customer_service_fee_percent,b.customer_service_fee_kes,b.customer_total_kes,
    b.hotel_net_amount_kes,b.leogo_revenue_kes,b.total_amount_kes,
    b.special_requests,b.booking_status,b.host_response,b.created_at,b.updated_at
  from public.accommodation_bookings b
  join public.accommodation_properties p on p.id=b.property_id
  left join public.accommodation_units u on u.id=b.unit_id
  left join public.accommodation_unit_rates r on r.id=b.rate_id
  where p.host_id=v_host_id
  order by case b.booking_status when 'pending_host' then 0 when 'accepted' then 1 else 2 end,b.created_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_get_accommodation_finance_settings()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row jsonb;
begin
  if not (
    private.is_leogo_admin('settings.manage')
    or private.is_leogo_admin('fees.manage')
    or private.is_leogo_admin('approvals.read')
  ) then
    raise exception 'Accommodation pricing settings permission required';
  end if;
  select to_jsonb(s) into v_row
  from public.accommodation_finance_settings s
  where id=1;
  return coalesce(v_row,jsonb_build_object(
    'id',1,'hotel_commission_percent',10,'customer_service_fee_percent',3
  ));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_list_accommodation_bookings()
 RETURNS TABLE(id uuid, booking_reference text, host_id uuid, host_user_id uuid, provider_name text, property_id uuid, property_name text, unit_id uuid, room_name text, room_category text, rate_name text, guest_name text, guest_phone text, customer_id uuid, check_in date, check_out date, nights smallint, guests smallint, nightly_price_kes integer, hotel_booking_amount_kes integer, hotel_commission_percent numeric, hotel_commission_kes integer, customer_service_fee_percent numeric, customer_service_fee_kes integer, customer_total_kes integer, hotel_net_amount_kes integer, leogo_revenue_kes integer, total_amount_kes integer, special_requests text, booking_status text, host_response text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Admin access required'; end if;
  return query
  select
    b.id,b.booking_reference,h.id,h.user_id,h.business_name,b.property_id,b.property_name_snapshot,
    b.unit_id,b.unit_name_snapshot,coalesce(u.room_category,'Room'),
    coalesce(b.rate_name_snapshot,r.rate_name),b.guest_name,b.guest_phone,b.customer_id,
    b.check_in,b.check_out,b.nights,b.guests,b.nightly_price_kes,
    b.hotel_booking_amount_kes,b.hotel_commission_percent,b.hotel_commission_kes,
    b.customer_service_fee_percent,b.customer_service_fee_kes,b.customer_total_kes,
    b.hotel_net_amount_kes,b.leogo_revenue_kes,b.total_amount_kes,
    b.special_requests,b.booking_status,b.host_response,b.created_at,b.updated_at
  from public.accommodation_bookings b
  join public.accommodation_properties p on p.id=b.property_id
  join public.accommodation_hosts h on h.id=p.host_id
  left join public.accommodation_units u on u.id=b.unit_id
  left join public.accommodation_unit_rates r on r.id=b.rate_id
  order by case b.booking_status when 'pending_host' then 0 when 'accepted' then 1 else 2 end,b.created_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_update_accommodation_finance_settings(p_hotel_commission_percent numeric, p_customer_service_fee_percent numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not (
    private.is_leogo_admin('settings.manage')
    or private.is_leogo_admin('fees.manage')
  ) then
    raise exception 'Fee settings permission required';
  end if;

  if p_hotel_commission_percent is null
     or p_hotel_commission_percent<0
     or p_hotel_commission_percent>100 then
    raise exception 'Hotel commission must be between 0 and 100 percent';
  end if;

  if p_customer_service_fee_percent is null
     or p_customer_service_fee_percent<0
     or p_customer_service_fee_percent>100 then
    raise exception 'Customer Accommodation service fee must be between 0 and 100 percent';
  end if;

  select to_jsonb(s) into v_before
  from public.accommodation_finance_settings s
  where id=1
  for update;

  insert into public.accommodation_finance_settings(
    id,hotel_commission_percent,customer_service_fee_percent,updated_by,updated_at
  ) values(
    1,p_hotel_commission_percent,p_customer_service_fee_percent,(select auth.uid()),now()
  )
  on conflict(id) do update set
    hotel_commission_percent=excluded.hotel_commission_percent,
    customer_service_fee_percent=excluded.customer_service_fee_percent,
    updated_by=excluded.updated_by,
    updated_at=excluded.updated_at;

  select to_jsonb(s) into v_after
  from public.accommodation_finance_settings s
  where id=1;

  perform private.write_admin_audit(
    'settings.accommodation_finance.updated',
    'accommodation_finance_settings',
    '1',
    v_before,
    v_after,
    null
  );

  return v_after;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_accommodation_finance_settings()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'hotel_commission_percent',s.hotel_commission_percent,
    'customer_service_fee_percent',s.customer_service_fee_percent
  )
  from public.accommodation_finance_settings s
  where s.id=1;
$function$
;

CREATE OR REPLACE FUNCTION public.prepare_accommodation_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_property public.accommodation_properties%rowtype;
  v_unit public.accommodation_units%rowtype;
  v_rate public.accommodation_unit_rates%rowtype;
  v_settings public.accommodation_finance_settings%rowtype;
  v_nights integer;
  v_phone text;
  v_hotel_amount integer;
  v_hotel_commission integer;
  v_customer_service_fee integer;
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  if new.idempotency_key is null then raise exception 'A booking submission key is required.'; end if;

  select * into v_property
  from public.accommodation_properties
  where id=new.property_id and approval_status='approved' and is_published=true;
  if not found then raise exception 'This accommodation is not available for booking.'; end if;

  select * into v_unit
  from public.accommodation_units
  where id=new.unit_id and property_id=new.property_id
    and is_active=true and approval_status='approved';
  if not found then raise exception 'This room or unit is not available for booking.'; end if;

  if new.rate_id is null then raise exception 'Choose an accommodation rate.'; end if;
  select * into v_rate
  from public.accommodation_unit_rates
  where id=new.rate_id and unit_id=new.unit_id and is_active=true;
  if not found then raise exception 'This accommodation rate is not available.'; end if;

  if new.check_in<current_date or new.check_out<=new.check_in then
    raise exception 'Choose valid future check-in and check-out dates.';
  end if;

  v_nights:=new.check_out-new.check_in;
  if v_nights>60 then raise exception 'A single booking request cannot exceed 60 nights.'; end if;

  if new.guests<1
     or new.guests>v_unit.max_guests
     or new.guests>v_rate.occupancy_pax then
    raise exception 'The guest count exceeds the selected rate occupancy.';
  end if;

  if char_length(btrim(coalesce(new.guest_name,''))) not between 2 and 120 then
    raise exception 'Enter the guest name.';
  end if;

  v_phone:=regexp_replace(btrim(coalesce(new.guest_phone,'')),'[^0-9+]','','g');
  if v_phone~'^0[17][0-9]{8}$' then
    v_phone:='+254'||substr(v_phone,2);
  elsif v_phone~'^254[17][0-9]{8}$' then
    v_phone:='+'||v_phone;
  elsif v_phone~'^[17][0-9]{8}$' then
    v_phone:='+254'||v_phone;
  end if;
  if v_phone!~'^[+]254[17][0-9]{8}$' then
    raise exception 'Enter a valid Kenyan phone number in +254 format.';
  end if;

  if char_length(btrim(coalesce(new.special_requests,'')))>1000 then
    raise exception 'Special requests are too long.';
  end if;

  select * into v_settings
  from public.accommodation_finance_settings
  where id=1;
  if not found then
    v_settings.id:=1;
    v_settings.hotel_commission_percent:=10;
    v_settings.customer_service_fee_percent:=3;
  end if;

  v_hotel_amount:=v_rate.nightly_price_kes*v_nights;
  v_hotel_commission:=round(v_hotel_amount*v_settings.hotel_commission_percent/100.0)::integer;
  v_customer_service_fee:=round(v_hotel_amount*v_settings.customer_service_fee_percent/100.0)::integer;

  new.id:=gen_random_uuid();
  new.booking_reference:='ACM-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  new.customer_id:=v_user_id;
  new.nights:=v_nights;
  new.guest_name:=btrim(new.guest_name);
  new.guest_phone:=v_phone;
  new.special_requests:=nullif(btrim(coalesce(new.special_requests,'')),'');
  new.property_name_snapshot:=v_property.property_name;
  new.unit_name_snapshot:=v_unit.unit_name;
  new.rate_name_snapshot:=v_rate.rate_name;
  new.meal_plan_snapshot:=v_rate.meal_plan;
  new.occupancy_type_snapshot:=v_rate.occupancy_type;
  new.occupancy_pax_snapshot:=v_rate.occupancy_pax;
  new.nightly_price_kes:=v_rate.nightly_price_kes;

  new.hotel_booking_amount_kes:=v_hotel_amount;
  new.hotel_commission_percent:=v_settings.hotel_commission_percent;
  new.hotel_commission_kes:=v_hotel_commission;
  new.customer_service_fee_percent:=v_settings.customer_service_fee_percent;
  new.customer_service_fee_kes:=v_customer_service_fee;
  new.customer_total_kes:=v_hotel_amount+v_customer_service_fee;
  new.hotel_net_amount_kes:=v_hotel_amount-v_hotel_commission;
  new.leogo_revenue_kes:=v_hotel_commission+v_customer_service_fee;
  new.total_amount_kes:=new.customer_total_kes;

  new.booking_status:='pending_host';
  new.host_response:=null;
  new.created_at:=now();
  new.updated_at:=now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_accommodation_booking(p_property_id uuid, p_unit_id uuid, p_rate_id uuid, p_check_in date, p_check_out date, p_guests integer, p_guest_name text, p_guest_phone text, p_special_requests text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_booking public.accommodation_bookings%rowtype;
  v_duplicate boolean:=false;
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  if p_idempotency_key is null then raise exception 'A booking submission key is required.'; end if;

  select * into v_booking
  from public.accommodation_bookings
  where idempotency_key=p_idempotency_key and customer_id=v_user_id;

  if not found then
    begin
      insert into public.accommodation_bookings(
        idempotency_key,customer_id,property_id,unit_id,rate_id,
        check_in,check_out,nights,guests,guest_name,guest_phone,
        special_requests,property_name_snapshot,unit_name_snapshot,
        nightly_price_kes,total_amount_kes,booking_status,
        hotel_booking_amount_kes,hotel_commission_percent,hotel_commission_kes,
        customer_service_fee_percent,customer_service_fee_kes,customer_total_kes,
        hotel_net_amount_kes,leogo_revenue_kes
      ) values(
        p_idempotency_key,v_user_id,p_property_id,p_unit_id,p_rate_id,
        p_check_in,p_check_out,1,p_guests,p_guest_name,p_guest_phone,
        p_special_requests,'pending','pending',
        1,1,'pending_host',
        1,10,1,3,1,1,1,1
      )
      returning * into v_booking;
    exception when unique_violation then
      select * into v_booking
      from public.accommodation_bookings
      where idempotency_key=p_idempotency_key and customer_id=v_user_id;
      if not found then raise; end if;
      v_duplicate:=true;
    end;
  else
    v_duplicate:=true;
  end if;

  return jsonb_build_object(
    'id',v_booking.id,
    'booking_reference',v_booking.booking_reference,
    'status',v_booking.booking_status,
    'hotel_booking_amount_kes',v_booking.hotel_booking_amount_kes,
    'hotel_commission_percent',v_booking.hotel_commission_percent,
    'hotel_commission_kes',v_booking.hotel_commission_kes,
    'customer_service_fee_percent',v_booking.customer_service_fee_percent,
    'customer_service_fee_kes',v_booking.customer_service_fee_kes,
    'customer_total_kes',v_booking.customer_total_kes,
    'hotel_net_amount_kes',v_booking.hotel_net_amount_kes,
    'leogo_revenue_kes',v_booking.leogo_revenue_kes,
    'total_amount_kes',v_booking.total_amount_kes,
    'duplicate',v_duplicate
  );
end;
$function$
;

revoke all on function public.get_accommodation_finance_settings() from public;
grant execute on function public.get_accommodation_finance_settings() to anon,authenticated;
revoke all on function public.admin_get_accommodation_finance_settings() from public,anon;
grant execute on function public.admin_get_accommodation_finance_settings() to authenticated;
revoke all on function public.admin_update_accommodation_finance_settings(numeric,numeric) from public,anon;
grant execute on function public.admin_update_accommodation_finance_settings(numeric,numeric) to authenticated;
revoke all on function public.accommodation_provider_list_bookings() from public,anon;
grant execute on function public.accommodation_provider_list_bookings() to authenticated;
revoke all on function public.admin_list_accommodation_bookings() from public,anon;
grant execute on function public.admin_list_accommodation_bookings() to authenticated;
