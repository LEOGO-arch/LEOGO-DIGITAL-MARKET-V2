-- Guard Service Provider money precision without changing state transitions or existing balances.
CREATE OR REPLACE FUNCTION public.service_provider_update_job(p_request_id uuid, p_action text, p_quote_kes numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text, p_quote_valid_until date DEFAULT NULL::date, p_final_amount_kes numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=(select auth.uid());
  v_request public.service_requests%rowtype;
  v_new_status text;
  v_title text;
  v_message text;
  v_quote_reference text;
  v_final_amount numeric;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select * into v_request from public.service_requests
  where id=p_request_id and provider_id=v_uid for update;
  if not found then raise exception 'Service job not found'; end if;

  if p_action='decline' then
    if v_request.request_status<>'dispatched' then raise exception 'This request can no longer be declined'; end if;
    if char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'Enter a reason for declining'; end if;
    v_new_status:='declined';v_title:='Provider declined request';
    v_message:=v_request.request_reference||' was declined by the provider. LEOGO Admin will follow up.';
  elsif p_action='accept' then
    if v_request.request_type<>'direct' or v_request.request_status<>'dispatched' then raise exception 'This direct request cannot be accepted now'; end if;
    v_new_status:='accepted';v_title:='Service request accepted';v_message:='The provider accepted '||v_request.request_reference||'.';
  elsif p_action='quote' then
    if v_request.request_type<>'quotation' or v_request.request_status<>'dispatched' then raise exception 'This quotation request cannot be quoted now'; end if;
    if p_quote_kes is null or p_quote_kes<=0 or p_quote_kes>100000000 then raise exception 'Enter a valid quotation amount'; end if;
    if p_quote_kes<>round(p_quote_kes,2) then raise exception 'Quotation amount may have at most two decimal places'; end if;
    if v_request.service_flash_sale_applied
       and v_request.service_price_snapshot_kes is not null
       and p_quote_kes>v_request.service_price_snapshot_kes then
      raise exception 'This request locked an approved Flash Sale price of KSh %',
        trim(to_char(v_request.service_price_snapshot_kes,'FM999999999990.00'));
    end if;
    if p_quote_valid_until is not null and p_quote_valid_until < (now() at time zone 'Africa/Nairobi')::date then
      raise exception 'Quotation validity date cannot be in the past';
    end if;
    v_new_status:='quoted';v_title:='Your service quotation is ready';
    v_quote_reference:='QT-'||replace(v_request.request_reference,'SR-','');
    v_message:=v_request.request_reference||' has a provider quotation of KSh '||trim(to_char(round(p_quote_kes,2),'FM999999999990.00'))||'. View, download, accept or reject it in My Activity.';
  elsif p_action='start' then
    if not((v_request.request_type='direct' and v_request.request_status='accepted') or (v_request.request_type='quotation' and v_request.request_status='quote_accepted'))
      then raise exception 'This service cannot be started yet'; end if;
    v_new_status:='in_progress';v_title:='Service work started';v_message:=v_request.request_reference||' is now in progress.';
  elsif p_action='complete' then
    if v_request.request_status<>'in_progress' then raise exception 'Only an in-progress service can be completed'; end if;
    if v_request.request_type='direct' then
      if p_final_amount_kes is null or p_final_amount_kes<=0 or p_final_amount_kes>100000000 then
        raise exception 'Enter the final agreed labour amount before completing this direct service';
      end if;
      if p_final_amount_kes<>round(p_final_amount_kes,2) then raise exception 'Final labour amount may have at most two decimal places'; end if;
      v_final_amount:=round(p_final_amount_kes,2);
      if v_request.service_flash_sale_applied
         and v_request.service_price_snapshot_kes is not null
         and v_final_amount>v_request.service_price_snapshot_kes then
        raise exception 'This request locked an approved Flash Sale price of KSh %',
          trim(to_char(v_request.service_price_snapshot_kes,'FM999999999990.00'));
      end if;
    else
      v_final_amount:=v_request.provider_quote_kes;
      if v_final_amount is null or v_final_amount<=0 then raise exception 'This quotation has no valid earning amount'; end if;
    end if;
    v_new_status:='completed';v_title:='Service completed';v_message:=v_request.request_reference||' has been marked completed by the provider.';
  else raise exception 'Unsupported service job action';
  end if;

  update public.service_requests set
    request_status=v_new_status,
    provider_quote_kes=case when p_action='quote' then round(p_quote_kes,2) else provider_quote_kes end,
    provider_labour_kes=case when p_action='complete' then v_final_amount else provider_labour_kes end,
    provider_quote_notes=case when p_action in('quote','decline') then nullif(btrim(coalesce(p_notes,'')),'') else provider_quote_notes end,
    quote_reference=case when p_action='quote' then v_quote_reference else quote_reference end,
    quote_valid_until=case when p_action='quote' then p_quote_valid_until else quote_valid_until end,
    responded_at=case when p_action in('accept','decline','quote') then now() else responded_at end,
    quoted_at=case when p_action='quote' then now() else quoted_at end,
    started_at=case when p_action='start' then now() else started_at end,
    completed_at=case when p_action='complete' then now() else completed_at end,
    updated_at=now()
  where id=p_request_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_request.customer_id,'service_request',v_title,v_message,'service_request',p_request_id,
    'service_request_'||v_new_status||'_'||p_request_id::text,'orders',
    jsonb_build_object(
      'request_status',v_new_status,
      'quote_kes',case when p_action='quote' then round(p_quote_kes,2) else v_request.provider_quote_kes end,
      'final_amount_kes',case when p_action='complete' then v_final_amount else null end,
      'quote_reference',v_quote_reference
    )
  );
  return jsonb_build_object('ok',true,'request_status',v_new_status,'quote_reference',v_quote_reference,'final_amount_kes',v_final_amount);
end;
$function$
;
