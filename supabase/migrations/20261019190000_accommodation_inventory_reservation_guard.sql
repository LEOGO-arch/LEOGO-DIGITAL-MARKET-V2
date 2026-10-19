-- Lock inventory per room/unit and reject overlapping over-capacity reservations.
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
  v_peak_occupancy integer;
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

  -- Serialize overlapping reservations for this unit, including simultaneous submissions.
  perform 1 from public.accommodation_units where id=new.unit_id for update;
  if coalesce(v_unit.inventory_count,0)<1 then
    raise exception 'This room or unit has no available inventory.';
  end if;
  -- Peak per-night usage must stay below the published number of identical units.
  select coalesce(max(n.occupied),0) into v_peak_occupancy
  from (
    select count(*)::integer occupied
    from generate_series(new.check_in, new.check_out - 1, interval '1 day') day
    join public.accommodation_bookings b on b.unit_id=new.unit_id
      and b.booking_status in ('pending_host','accepted')
      and b.check_in<=day::date and b.check_out>day::date
    group by day
  ) n;
  if v_peak_occupancy>=v_unit.inventory_count then
    raise exception 'No room inventory is available for the selected dates.';
  end if;

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
