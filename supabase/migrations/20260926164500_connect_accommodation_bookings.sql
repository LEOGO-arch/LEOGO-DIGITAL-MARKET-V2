-- Connect customer Accommodation bookings to Accommodation Provider and Admin operations.
-- New bookings notify the provider; providers can accept/reject pending requests.

CREATE OR REPLACE FUNCTION public.accommodation_provider_list_bookings()
 RETURNS TABLE(id uuid, booking_reference text, customer_id uuid, property_id uuid, unit_id uuid, rate_id uuid, property_name text, room_name text, room_category text, rate_name text, meal_plan text, occupancy_type text, occupancy_pax smallint, guest_name text, guest_phone text, check_in date, check_out date, nights smallint, guests smallint, nightly_price_kes integer, total_amount_kes integer, special_requests text, booking_status text, host_response text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_host_id uuid;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  select h.id into v_host_id
  from public.accommodation_hosts h
  where h.user_id=v_uid
    and h.verification_status in ('approved','suspended');

  if v_host_id is null then
    raise exception 'Accommodation Provider account required';
  end if;

  return query
  select
    b.id,
    b.booking_reference,
    b.customer_id,
    b.property_id,
    b.unit_id,
    b.rate_id,
    b.property_name_snapshot,
    b.unit_name_snapshot,
    coalesce(u.room_category,'Room'),
    coalesce(b.rate_name_snapshot,r.rate_name),
    coalesce(b.meal_plan_snapshot,r.meal_plan),
    coalesce(b.occupancy_type_snapshot,r.occupancy_type),
    coalesce(b.occupancy_pax_snapshot,r.occupancy_pax),
    b.guest_name,
    b.guest_phone,
    b.check_in,
    b.check_out,
    b.nights,
    b.guests,
    b.nightly_price_kes,
    b.total_amount_kes,
    b.special_requests,
    b.booking_status,
    b.host_response,
    b.created_at,
    b.updated_at
  from public.accommodation_bookings b
  join public.accommodation_properties p on p.id=b.property_id
  left join public.accommodation_units u on u.id=b.unit_id
  left join public.accommodation_unit_rates r on r.id=b.rate_id
  where p.host_id=v_host_id
  order by
    case b.booking_status when 'pending_host' then 0 when 'accepted' then 1 else 2 end,
    b.created_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.accommodation_provider_respond_booking(p_booking_id uuid, p_action text, p_response text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_host_id uuid;
  v_booking public.accommodation_bookings%rowtype;
  v_status text;
  v_message text;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  select h.id into v_host_id
  from public.accommodation_hosts h
  where h.user_id=v_uid and h.verification_status='approved';

  if v_host_id is null then
    raise exception 'Approved Accommodation Provider account required';
  end if;

  if p_action not in ('accept','reject') then
    raise exception 'Choose accept or reject';
  end if;

  select b.* into v_booking
  from public.accommodation_bookings b
  join public.accommodation_properties p on p.id=b.property_id
  where b.id=p_booking_id
    and p.host_id=v_host_id
  for update;

  if not found then raise exception 'Accommodation booking not found'; end if;
  if v_booking.booking_status <> 'pending_host' then
    raise exception 'This booking has already been responded to';
  end if;

  if p_action='reject' and char_length(btrim(coalesce(p_response,''))) < 3 then
    raise exception 'Add a short reason before rejecting the booking';
  end if;

  if char_length(btrim(coalesce(p_response,''))) > 1000 then
    raise exception 'Response is too long';
  end if;

  v_status := case when p_action='accept' then 'accepted' else 'rejected' end;

  update public.accommodation_bookings
  set booking_status=v_status,
      host_response=nullif(btrim(coalesce(p_response,'')),''),
      updated_at=now()
  where id=v_booking.id
  returning * into v_booking;

  v_message := case
    when v_status='accepted' then
      'Your booking '||v_booking.booking_reference||' for '||
      v_booking.property_name_snapshot||' · '||v_booking.unit_name_snapshot||
      ' has been accepted by the property.'
    else
      'Your booking '||v_booking.booking_reference||' for '||
      v_booking.property_name_snapshot||' · '||v_booking.unit_name_snapshot||
      ' was not accepted. '||coalesce(v_booking.host_response,'Please choose another room or date.')
  end;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_booking.customer_id,
    'accommodation',
    case when v_status='accepted' then 'Accommodation booking accepted' else 'Accommodation booking not accepted' end,
    v_message,
    'accommodation_booking',
    v_booking.id,
    'accommodation_booking_'||v_status,
    'accommodation',
    jsonb_build_object(
      'booking_id',v_booking.id,
      'booking_reference',v_booking.booking_reference,
      'booking_status',v_status,
      'property_name',v_booking.property_name_snapshot,
      'room_name',v_booking.unit_name_snapshot
    )
  )
  on conflict(user_id,source_type,source_id,event_key)
  where source_id is not null
  do update set
    title=excluded.title,
    message=excluded.message,
    metadata=excluded.metadata,
    read_at=null,
    created_at=now();

  insert into public.partner_notifications(
    user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata
  ) values(
    v_uid,
    'accommodation',
    'booking_'||v_status,
    case when v_status='accepted' then 'Booking accepted' else 'Booking rejected' end,
    v_booking.booking_reference||' · '||v_booking.guest_name||' · '||v_booking.unit_name_snapshot,
    'accommodation_booking',
    v_booking.id,
    'bookings',
    jsonb_build_object(
      'booking_id',v_booking.id,
      'booking_reference',v_booking.booking_reference,
      'booking_status',v_status
    )
  );

  return jsonb_build_object(
    'ok',true,
    'booking_id',v_booking.id,
    'booking_reference',v_booking.booking_reference,
    'booking_status',v_booking.booking_status
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_list_accommodation_bookings()
 RETURNS TABLE(id uuid, booking_reference text, host_id uuid, host_user_id uuid, provider_name text, property_id uuid, property_name text, unit_id uuid, room_name text, room_category text, rate_name text, guest_name text, guest_phone text, customer_id uuid, check_in date, check_out date, nights smallint, guests smallint, nightly_price_kes integer, total_amount_kes integer, special_requests text, booking_status text, host_response text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_leogo_admin('approvals.read') then
    raise exception 'Admin access required';
  end if;

  return query
  select
    b.id,
    b.booking_reference,
    h.id,
    h.user_id,
    h.business_name,
    b.property_id,
    b.property_name_snapshot,
    b.unit_id,
    b.unit_name_snapshot,
    coalesce(u.room_category,'Room'),
    coalesce(b.rate_name_snapshot,r.rate_name),
    b.guest_name,
    b.guest_phone,
    b.customer_id,
    b.check_in,
    b.check_out,
    b.nights,
    b.guests,
    b.nightly_price_kes,
    b.total_amount_kes,
    b.special_requests,
    b.booking_status,
    b.host_response,
    b.created_at,
    b.updated_at
  from public.accommodation_bookings b
  join public.accommodation_properties p on p.id=b.property_id
  join public.accommodation_hosts h on h.id=p.host_id
  left join public.accommodation_units u on u.id=b.unit_id
  left join public.accommodation_unit_rates r on r.id=b.rate_id
  order by
    case b.booking_status when 'pending_host' then 0 when 'accepted' then 1 else 2 end,
    b.created_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_accommodation_provider_new_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_host_user uuid;
begin
  select h.user_id into v_host_user
  from public.accommodation_properties p
  join public.accommodation_hosts h on h.id=p.host_id
  where p.id=new.property_id;

  if v_host_user is not null then
    insert into public.partner_notifications(
      user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata
    ) values(
      v_host_user,
      'accommodation',
      'new_booking',
      'New accommodation booking',
      new.booking_reference||' · '||new.guest_name||' requested '||
      new.unit_name_snapshot||' for '||new.check_in::text||' to '||new.check_out::text||'.',
      'accommodation_booking',
      new.id,
      'bookings',
      jsonb_build_object(
        'booking_id',new.id,
        'booking_reference',new.booking_reference,
        'property_id',new.property_id,
        'unit_id',new.unit_id,
        'guest_name',new.guest_name,
        'check_in',new.check_in,
        'check_out',new.check_out,
        'total_amount_kes',new.total_amount_kes
      )
    );
  end if;

  return new;
end;
$function$
;

revoke all on function public.accommodation_provider_list_bookings() from public, anon;
grant execute on function public.accommodation_provider_list_bookings() to authenticated;

revoke all on function public.accommodation_provider_respond_booking(uuid,text,text) from public, anon;
grant execute on function public.accommodation_provider_respond_booking(uuid,text,text) to authenticated;

revoke all on function public.admin_list_accommodation_bookings() from public, anon;
grant execute on function public.admin_list_accommodation_bookings() to authenticated;

revoke all on function public.notify_accommodation_provider_new_booking() from public, anon, authenticated;

drop trigger if exists accommodation_booking_notify_provider_after_insert
on public.accommodation_bookings;

create trigger accommodation_booking_notify_provider_after_insert
after insert on public.accommodation_bookings
for each row
execute function public.notify_accommodation_provider_new_booking();
