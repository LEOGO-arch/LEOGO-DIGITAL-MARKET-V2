CREATE OR REPLACE FUNCTION public.admin_review_pickup_station_withdrawal(p_withdrawal_id uuid, p_decision text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row public.pickup_station_withdrawal_requests%rowtype; v_title text; v_message text;
begin
  if not (private.is_leogo_admin('settlements.manage') or private.is_leogo_admin('delivery.manage') or private.is_leogo_admin('settings.manage')) then
    raise exception 'Pickup Station withdrawal permission required';
  end if;
  if p_decision not in ('approve','reject','paid') then raise exception 'Choose approve, reject or paid'; end if;

  select * into v_row from public.pickup_station_withdrawal_requests where id=p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal request not found'; end if;

  if p_decision in ('approve','paid') then
    if v_row.requested_amount_kes > (
       (select coalesce(sum(earnings_amount_kes),0) from public.pickup_station_parcels where pickup_station_id=v_row.pickup_station_id and status='handed_over')
      +(select coalesce(sum(amount_kes),0) from public.aftersales_station_commissions where pickup_station_id=v_row.pickup_station_id)
      -(select coalesce(sum(requested_amount_kes),0) from public.pickup_station_withdrawal_requests
        where pickup_station_id=v_row.pickup_station_id and id<>v_row.id and status in ('pending','approved','paid'))
      -private.aftersales_liability_total('pickup_station',v_row.pickup_station_id)
    ) then raise exception 'Withdrawal exceeds current balance after Aftersales liability deductions';end if;
  end if;
  if p_decision='approve' then
    update public.pickup_station_withdrawal_requests
    set status='approved',admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
        reviewed_at=now(),reviewed_by=(select auth.uid()),updated_at=now()
    where id=p_withdrawal_id;
    v_title:='Pickup Station withdrawal approved';
    v_message:='Your withdrawal request of KSh '||v_row.requested_amount_kes::text||' has been approved.';
  elsif p_decision='reject' then
    update public.pickup_station_withdrawal_requests
    set status='rejected',admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
        reviewed_at=now(),reviewed_by=(select auth.uid()),updated_at=now()
    where id=p_withdrawal_id;
    v_title:='Pickup Station withdrawal rejected';
    v_message:='Your withdrawal request of KSh '||v_row.requested_amount_kes::text||' was not approved.';
  else
    if v_row.status not in ('approved','pending') then raise exception 'Only a pending or approved withdrawal can be marked paid'; end if;
    update public.pickup_station_withdrawal_requests
    set status='paid',admin_notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),admin_notes),
        reviewed_at=coalesce(reviewed_at,now()),reviewed_by=coalesce(reviewed_by,(select auth.uid())),
        paid_at=now(),updated_at=now()
    where id=p_withdrawal_id;
    v_title:='Pickup Station withdrawal paid';
    v_message:='Your withdrawal request of KSh '||v_row.requested_amount_kes::text||' has been marked paid.';
  end if;

  perform private.notify_partner(
    v_row.partner_id,'pickup_station','withdrawal_'||p_decision,v_title,v_message,
    'pickup_station_withdrawal',v_row.id,'pickup-earnings',
    jsonb_build_object('withdrawal_id',v_row.id,'amount_kes',v_row.requested_amount_kes,'decision',p_decision)
  );

  perform private.write_admin_audit(
    'pickup.withdrawal.'||p_decision,'pickup_station_withdrawal',v_row.id::text,
    to_jsonb(v_row),null,jsonb_build_object('notes',p_notes)
  );
  return jsonb_build_object('ok',true,'decision',p_decision);
end
$function$;