CREATE OR REPLACE FUNCTION public.customer_create_service_request(p_service_id uuid, p_request_type text, p_request_details text, p_service_location text, p_nearest_landmark text DEFAULT NULL::text, p_preferred_date date DEFAULT NULL::date, p_payment_reference text DEFAULT NULL::text, p_preferred_time time without time zone DEFAULT NULL::time without time zone, p_service_county text DEFAULT NULL::text, p_service_sub_county text DEFAULT NULL::text, p_service_town_estate text DEFAULT NULL::text, p_location_description text DEFAULT NULL::text, p_map_link text DEFAULT NULL::text, p_latitude numeric DEFAULT NULL::numeric, p_longitude numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_service record;
  v_fee numeric(12,2) := 0;
  v_direct_fee numeric(12,2) := 0;
  v_quotation_fee numeric(12,2) := 0;
  v_account_id uuid;
  v_payment_reference text := nullif(upper(btrim(coalesce(p_payment_reference,''))),'');
  v_request_id uuid;
  v_reference text;
  v_payment_status text := 'not_required';
  v_status text := 'submitted';
begin
  if v_uid is null then raise exception 'Sign in to request a service'; end if;
  if p_request_type not in ('direct','quotation') then raise exception 'Choose a valid request type'; end if;
  if char_length(btrim(coalesce(p_request_details,''))) < 10 then raise exception 'Describe the service you need'; end if;
  if char_length(btrim(coalesce(p_service_location,''))) < 3 then raise exception 'Enter the service location'; end if;
  if p_preferred_time is null then raise exception 'Select the preferred service time'; end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then raise exception 'Latitude is invalid'; end if;
  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then raise exception 'Longitude is invalid'; end if;
  if (p_latitude is null) <> (p_longitude is null) then raise exception 'Latitude and longitude must be provided together'; end if;

  if p_preferred_date is not null and p_preferred_date < (now() at time zone 'Africa/Nairobi')::date then
    raise exception 'Preferred date cannot be in the past';
  end if;
  if p_preferred_date = (now() at time zone 'Africa/Nairobi')::date
     and p_preferred_time <= (now() at time zone 'Africa/Nairobi')::time then
    raise exception 'Preferred service time must be in the future';
  end if;
  if not exists(select 1 from public.customer_profiles where user_id=v_uid) then
    raise exception 'Complete your customer profile before requesting a service';
  end if;

  select
    s.id,s.provider_id,s.service_name,s.pricing_model,s.price_from_kes,
    (
      s.flash_sale_requested
      and s.flash_sale_status='approved'
      and s.pricing_model='fixed'
      and s.flash_sale_price_kes is not null
      and s.flash_sale_price_kes>0
      and s.flash_sale_starts_at<=now()
      and s.flash_sale_ends_at>now()
    ) as flash_sale_active,
    case
      when s.flash_sale_requested
       and s.flash_sale_status='approved'
       and s.pricing_model='fixed'
       and s.flash_sale_price_kes is not null
       and s.flash_sale_price_kes>0
       and s.flash_sale_starts_at<=now()
       and s.flash_sale_ends_at>now()
      then s.flash_sale_price_kes
      else s.price_from_kes
    end as effective_service_price_kes
  into v_service
  from public.service_provider_services s
  join public.service_provider_accounts p on p.user_id=s.provider_id
  where s.id=p_service_id and s.approval_status='approved' and s.is_available
    and p.application_status='approved' and p.availability_status<>'offline';
  if not found then raise exception 'This service is not currently available'; end if;

  select direct_request_fee_kes,quotation_fee_kes into v_direct_fee,v_quotation_fee
  from public.service_marketplace_settings where id=1;
  v_direct_fee:=coalesce(v_direct_fee,50);
  v_quotation_fee:=coalesce(v_quotation_fee,50);
  v_fee:=case when p_request_type='direct' then v_direct_fee else v_quotation_fee end;

  if v_fee>0 then
    if v_payment_reference is null or char_length(v_payment_reference)<6 or char_length(v_payment_reference)>80 then
      raise exception 'Enter a valid payment reference';
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

  v_reference:='SR-'||to_char(now() at time zone 'Africa/Nairobi','YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  insert into public.service_requests(
    request_reference,customer_id,service_id,provider_id,request_type,request_details,
    service_location,nearest_landmark,preferred_date,preferred_time,
    service_county,service_sub_county,service_town_estate,location_description,map_link,latitude,longitude,
    service_pricing_model_snapshot,service_normal_price_snapshot_kes,service_price_snapshot_kes,service_flash_sale_applied,
    direct_request_fee_kes,quotation_fee_kes,quotation_fee_account_id,payment_reference,payment_status,request_status
  ) values(
    v_reference,v_uid,v_service.id,v_service.provider_id,p_request_type,btrim(p_request_details),
    btrim(p_service_location),nullif(btrim(coalesce(p_nearest_landmark,'')),''),
    p_preferred_date,p_preferred_time,
    nullif(btrim(coalesce(p_service_county,'')),''),
    nullif(btrim(coalesce(p_service_sub_county,'')),''),
    nullif(btrim(coalesce(p_service_town_estate,'')),''),
    nullif(btrim(coalesce(p_location_description,'')),''),
    nullif(btrim(coalesce(p_map_link,'')),''),
    p_latitude,p_longitude,
    v_service.pricing_model,v_service.price_from_kes,v_service.effective_service_price_kes,coalesce(v_service.flash_sale_active,false),
    case when p_request_type='direct' then v_direct_fee else 0 end,
    case when p_request_type='quotation' then v_quotation_fee else 0 end,
    v_account_id,v_payment_reference,v_payment_status,v_status
  ) returning id into v_request_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_uid,'service_request','Service request received',
    'Request '||v_reference||' for '||v_service.service_name||
      case when v_status='awaiting_payment_verification'
        then ' is waiting for '||case when p_request_type='direct' then 'direct-request fee' else 'quotation fee' end||' verification.'
        else ' is waiting for LEOGO Admin dispatch.' end,
    'service_request',v_request_id,'service_request_created_'||v_request_id::text,'orders',
    jsonb_build_object('request_reference',v_reference,'request_type',p_request_type,'preferred_date',p_preferred_date,'preferred_time',p_preferred_time)
  );

  return jsonb_build_object(
    'ok',true,'request_id',v_request_id,'request_reference',v_reference,'request_status',v_status,
    'payment_status',v_payment_status,'preferred_date',p_preferred_date,'preferred_time',p_preferred_time,
    'direct_request_fee_kes',case when p_request_type='direct' then v_direct_fee else 0 end,
    'quotation_fee_kes',case when p_request_type='quotation' then v_quotation_fee else 0 end,
    'service_price_kes',v_service.effective_service_price_kes,
    'service_flash_sale_applied',coalesce(v_service.flash_sale_active,false)
  );
exception when unique_violation then
  raise exception 'This payment reference has already been submitted';
end;
$function$;

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
$function$;