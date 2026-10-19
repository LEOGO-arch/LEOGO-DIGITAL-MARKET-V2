-- Preserve settlement workflows; reject fractional-cent amounts before reservation.
CREATE OR REPLACE FUNCTION public.seller_request_settlement(p_account_id uuid, p_amount_kes numeric, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$;
declare
  v_uid uuid:=(select auth.uid());
  v_id uuid;
  v_available numeric;
begin

  -- LEOGO-SETTLEMENT-LOCK-V1: serialize requests and payouts for the same partner
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('LEOGO-SETTLEMENT:seller:'||(v_uid)::text,0));  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.seller_accounts s where s.user_id=v_uid and s.application_status='approved')
    then raise exception 'Approved Seller account required'; end if;
  if coalesce(p_amount_kes,0)<=0 then raise exception 'Settlement request amount must be greater than zero'; end if;
  if p_amount_kes <> round(p_amount_kes,2) then raise exception 'Settlement amount may have at most two decimal places'; end if;
  if not exists(
    select 1 from public.seller_settlement_accounts a
    where a.id=p_account_id and a.seller_id=v_uid and a.status='approved'
  ) then raise exception 'Choose an approved settlement account'; end if;

  v_available:=private.partner_available_balance('seller',v_uid);
  if p_amount_kes>v_available then
    raise exception 'Requested amount exceeds your available balance of KSh %',to_char(v_available,'FM999,999,999,990.00');
  end if;

  insert into public.seller_settlement_requests(seller_id,settlement_account_id,requested_amount_kes,seller_note)
  values(v_uid,p_account_id,round(p_amount_kes,2),nullif(btrim(coalesce(p_note,'')),''))
  returning id into v_id;

  perform private.notify_partner(
    v_uid,'seller','settlement_request_submitted',
    'Settlement request submitted',
    'Your settlement request has been sent to LEOGO Admin for review.',
    'seller_settlement_request',v_id,'settlements',
    jsonb_build_object('amount_kes',round(p_amount_kes,2),'status','pending')
  );
  return v_id;
end;
$function$;


CREATE OR REPLACE FUNCTION public.service_provider_request_settlement(p_account_id uuid, p_amount_kes numeric, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$;
declare
  v_uid uuid:=(select auth.uid());
  v_id uuid;
  v_available numeric;
begin

  -- LEOGO-SETTLEMENT-LOCK-V1: serialize requests and payouts for the same partner
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('LEOGO-SETTLEMENT:service_provider:'||(v_uid)::text,0));  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.service_provider_accounts p where p.user_id=v_uid and p.application_status='approved')
    then raise exception 'Approved Service Provider account required'; end if;
  if coalesce(p_amount_kes,0)<=0 then raise exception 'Settlement request amount must be greater than zero'; end if;
  if p_amount_kes <> round(p_amount_kes,2) then raise exception 'Settlement amount may have at most two decimal places'; end if;
  if not exists(
    select 1 from public.service_provider_settlement_accounts a
    where a.id=p_account_id and a.provider_id=v_uid and a.status='approved'
  ) then raise exception 'Choose an approved settlement account'; end if;

  v_available:=private.partner_available_balance('service_provider',v_uid);
  if p_amount_kes>v_available then
    raise exception 'Requested amount exceeds your available balance of KSh %',to_char(v_available,'FM999,999,999,990.00');
  end if;

  insert into public.service_provider_settlement_requests(provider_id,settlement_account_id,requested_amount_kes,provider_note)
  values(v_uid,p_account_id,round(p_amount_kes,2),nullif(btrim(coalesce(p_note,'')),''))
  returning id into v_id;

  perform private.notify_partner(
    v_uid,'service_provider','settlement_request_submitted',
    'Settlement request submitted',
    'Your Service Provider settlement request has been sent to LEOGO Admin for review.',
    'service_provider_settlement_request',v_id,'provider-settlements',
    jsonb_build_object('amount_kes',round(p_amount_kes,2),'status','pending')
  );
  return v_id;
end;
$function$;


CREATE OR REPLACE FUNCTION public.transport_provider_request_settlement(p_account_id uuid, p_amount_kes numeric, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$;
declare
  v_uid uuid:=(select auth.uid());
  v_id uuid; v_total numeric:=0; v_settled numeric:=0; v_pending numeric:=0; v_available numeric:=0;
begin

  -- LEOGO-SETTLEMENT-LOCK-V1: serialize requests and payouts for the same partner
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('LEOGO-SETTLEMENT:transport_provider:'||(v_uid)::text,0));  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.transport_provider_accounts where user_id=v_uid and application_status='approved')
    then raise exception 'Approved Transport Provider account required'; end if;
  if coalesce(p_amount_kes,0)<=0 then raise exception 'Settlement request amount must be greater than zero'; end if;
  if p_amount_kes <> round(p_amount_kes,2) then raise exception 'Settlement amount may have at most two decimal places'; end if;
  if not exists(select 1 from public.transport_provider_settlement_accounts where id=p_account_id and provider_id=v_uid and status='approved')
    then raise exception 'Choose an approved settlement account'; end if;

  select coalesce(sum(coalesce(r.quote_partner_net_kes,round(coalesce(r.provider_quote_kes,0)-coalesce(r.quote_partner_commission_kes,0),2))),0)
    into v_total from public.transport_requests r
    where r.assigned_provider_id=v_uid and r.request_status='completed' and r.completed_at is not null;
  select coalesce(sum(amount_kes),0) into v_settled from public.transport_provider_settlements where provider_id=v_uid and status='paid';
  select coalesce(sum(requested_amount_kes),0) into v_pending from public.transport_provider_settlement_requests where provider_id=v_uid and status in ('pending','under_review');
  v_available:=greatest(round(v_total-v_settled-v_pending-private.aftersales_liability_total('transport_provider',v_uid),2),0);
  if p_amount_kes>v_available then raise exception 'Requested amount exceeds your available balance of KSh %',to_char(v_available,'FM999,999,999,990.00'); end if;

  insert into public.transport_provider_settlement_requests(provider_id,settlement_account_id,requested_amount_kes,provider_note)
  values(v_uid,p_account_id,round(p_amount_kes,2),nullif(btrim(coalesce(p_note,'')),'')) returning id into v_id;

  perform private.notify_partner(v_uid,'transport','settlement_request_submitted','Settlement request submitted',
    'Your Transport Provider settlement request has been sent to LEOGO Admin for review.',
    'transport_provider_settlement_request',v_id,'transport-settlements',
    jsonb_build_object('amount_kes',round(p_amount_kes,2),'status','pending'));
  return v_id;
end $function$;

