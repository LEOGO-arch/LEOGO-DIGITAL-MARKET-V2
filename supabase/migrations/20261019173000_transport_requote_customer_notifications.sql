-- Keep customer transport quote decision notifications fresh on repeated quotation rounds.
CREATE OR REPLACE FUNCTION public.customer_decide_transport_quote(p_request_id uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_request public.transport_requests%rowtype;
  v_provider uuid;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  select * into v_request
  from public.transport_requests
  where id=p_request_id and customer_id=v_uid
  for update;

  if not found then raise exception 'Transport request not found'; end if;
  if v_request.request_status <> 'quoted' then raise exception 'This transport price is no longer awaiting your decision'; end if;
  if v_request.provider_quote_kes is null or v_request.quote_customer_total_kes is null then raise exception 'No valid transport price was found'; end if;

  v_provider:=v_request.assigned_provider_id;

  if p_accept then
    update public.transport_requests set request_status='accepted',accepted_at=now(),updated_at=now() where id=p_request_id;

    if v_provider is not null then
      perform private.notify_partner(
        v_provider,'transport','transport_quote_accepted','Customer accepted transport price',
        v_request.request_reference||': Customer accepted the total transport price of KSh '||
          trim(to_char(v_request.quote_customer_total_kes,'FM999999990.00'))||
          '. You may now begin the job at the agreed schedule.',
        'transport_request',p_request_id,'transport-jobs',
        jsonb_build_object('status','accepted','customer_total_kes',v_request.quote_customer_total_kes)
      );
    end if;

    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    ) values(
      v_uid,'transport_request','Transport price accepted',
      v_request.request_reference||': You accepted the transport price. The Transport Provider can now begin the job.',
      'transport_request',p_request_id,'transport_quote_customer_accepted_'||p_request_id::text,'orders',
      jsonb_build_object('status','accepted','customer_total_kes',v_request.quote_customer_total_kes)
    )
    on conflict(user_id,source_type,source_id,event_key)
    where source_id is not null
    do update set title=excluded.title,message=excluded.message,metadata=excluded.metadata,read_at=null,created_at=now();

    return jsonb_build_object('ok',true,'request_status','accepted');
  end if;

  update public.transport_requests
  set request_status='assigned',
      provider_quote_kes=null,
      quote_partner_commission_percent=null,
      quote_partner_commission_kes=null,
      quote_customer_service_fee_percent=null,
      quote_customer_service_fee_kes=null,
      quote_customer_total_kes=null,
      quote_partner_net_kes=null,
      quoted_at=null,
      accepted_at=null,
      updated_at=now()
  where id=p_request_id;

  if v_provider is not null then
    perform private.notify_partner(
      v_provider,'transport','transport_quote_rejected','Customer declined transport price',
      v_request.request_reference||': Customer did not accept the quoted transport price. You may submit a revised transport cost.',
      'transport_request',p_request_id,'transport-jobs',
      jsonb_build_object('status','assigned','quote_rejected',true)
    );
  end if;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_uid,'transport_request','Transport price declined',
    v_request.request_reference||': You declined the transport price. The Transport Provider can submit a revised cost.',
    'transport_request',p_request_id,'transport_quote_customer_rejected_'||p_request_id::text,'orders',
    jsonb_build_object('status','assigned','quote_rejected',true)
  )
  on conflict(user_id,source_type,source_id,event_key)
  where source_id is not null
    do update set title=excluded.title,message=excluded.message,metadata=excluded.metadata,read_at=null,created_at=now();

  return jsonb_build_object('ok',true,'request_status','assigned','quote_rejected',true);
end $function$
;
