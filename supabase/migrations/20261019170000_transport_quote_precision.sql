-- Preserve transport state transitions and fee calculations while validating quoted money precision.
CREATE OR REPLACE FUNCTION public.transport_provider_quote_job(p_request_id uuid, p_transport_cost_kes numeric, p_provider_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_request public.transport_requests%rowtype;
  v_partner_percent numeric;
  v_customer_percent numeric;
  v_partner_commission numeric;
  v_customer_fee numeric;
  v_customer_total numeric;
  v_partner_net numeric;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if p_transport_cost_kes is null or p_transport_cost_kes <= 0 then raise exception 'Enter a valid transportation cost greater than zero'; end if;
  if p_transport_cost_kes > 10000000 then raise exception 'Transportation cost is too high'; end if;
  if p_transport_cost_kes<>round(p_transport_cost_kes,2) then raise exception 'Transportation cost may have at most two decimal places'; end if;

  select * into v_request
  from public.transport_requests
  where id=p_request_id and assigned_provider_id=v_uid
  for update;
  if not found then raise exception 'Transport job not found'; end if;
  if v_request.request_status <> 'assigned' then raise exception 'Only an assigned job can be quoted'; end if;

  select partner_commission_percent,customer_service_fee_percent
    into v_partner_percent,v_customer_percent
  from public.transport_finance_settings where id=1;

  v_partner_percent:=coalesce(v_partner_percent,10);
  v_customer_percent:=coalesce(v_customer_percent,2);
  v_partner_commission:=round(p_transport_cost_kes*v_partner_percent/100.0,2);
  v_customer_fee:=round(p_transport_cost_kes*v_customer_percent/100.0,2);
  v_customer_total:=round(p_transport_cost_kes+v_customer_fee,2);
  v_partner_net:=round(p_transport_cost_kes-v_partner_commission,2);

  update public.transport_requests set
    provider_quote_kes=round(p_transport_cost_kes,2),
    quote_partner_commission_percent=v_partner_percent,
    quote_partner_commission_kes=v_partner_commission,
    quote_customer_service_fee_percent=v_customer_percent,
    quote_customer_service_fee_kes=v_customer_fee,
    quote_customer_total_kes=v_customer_total,
    quote_partner_net_kes=v_partner_net,
    quoted_at=now(),
    provider_notes=coalesce(nullif(btrim(coalesce(p_provider_notes,'')),''),provider_notes),
    request_status='quoted',
    accepted_at=null,
    updated_at=now()
  where id=p_request_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_request.customer_id,'transport_request','Transport price awaiting your approval',
    v_request.request_reference||': Transport Provider quoted KSh '||
      trim(to_char(p_transport_cost_kes,'FM999999990.00'))||
      '. LEOGO service fee ('||trim(to_char(v_customer_percent,'FM990.##'))||'%) is KSh '||
      trim(to_char(v_customer_fee,'FM999999990.00'))||
      '. Total is KSh '||trim(to_char(v_customer_total,'FM999999990.00'))||
      '. Accept the price before the Transport Provider can start the job.',
    'transport_request',p_request_id,'transport_quote_'||p_request_id::text,'orders',
    jsonb_build_object('transport_cost_kes',round(p_transport_cost_kes,2),'customer_service_fee_percent',v_customer_percent,'customer_service_fee_kes',v_customer_fee,'customer_total_kes',v_customer_total,'customer_action_required',true)
  )
  on conflict(user_id,source_type,source_id,event_key)
  where source_id is not null
  do update set title=excluded.title,message=excluded.message,metadata=excluded.metadata,read_at=null,created_at=now();

  return jsonb_build_object('ok',true,'request_status','quoted','transport_cost_kes',round(p_transport_cost_kes,2),'partner_commission_percent',v_partner_percent,'partner_commission_kes',v_partner_commission,'partner_net_kes',v_partner_net,'customer_service_fee_percent',v_customer_percent,'customer_service_fee_kes',v_customer_fee,'customer_total_kes',v_customer_total);
end $function$
;
