-- Preserve Cyber Flash Sale approval rules; reject fractional-cent advertised prices.
CREATE OR REPLACE FUNCTION public.cyber_provider_request_service_flash_sale(p_service_id uuid, p_flash_price_kes numeric, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_service public.cyber_services%rowtype;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  select * into v_service
  from public.cyber_services
  where id=p_service_id and provider_id=v_uid
  for update;

  if not found then raise exception 'Cyber service not found'; end if;
  if v_service.approval_status<>'approved' then raise exception 'Only an approved service can be submitted to Flash Sale'; end if;
  if v_service.pricing_model='quote' or v_service.price_kes is null then raise exception 'Quotation-only services cannot use Flash Sale'; end if;
  if p_flash_price_kes is null or p_flash_price_kes<=0 or p_flash_price_kes>=v_service.price_kes then
    raise exception 'Flash Sale price must be lower than the normal service price';
  end if;
  if p_flash_price_kes<>round(p_flash_price_kes,2) then raise exception 'Flash Sale price may have at most two decimal places'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then
    raise exception 'Choose a valid Flash Sale start and end time';
  end if;
  if p_ends_at<=now() then raise exception 'Flash Sale end time must be in the future'; end if;

  update public.cyber_services
  set flash_sale_requested=true,
      flash_sale_price_kes=round(p_flash_price_kes,2),
      flash_sale_starts_at=p_starts_at,
      flash_sale_ends_at=p_ends_at,
      flash_sale_status='requested',
      flash_sale_admin_notes=null,
      updated_at=now()
  where id=p_service_id;

  perform private.notify_partner(
    v_uid,'cyber','cyber_flash_sale_submitted','Flash Sale sent for approval',
    v_service.service_name||' Flash Sale request has been sent to LEOGO Admin.',
    'cyber_service',p_service_id,'cyber-flashsale',
    jsonb_build_object('flash_sale_status','requested','flash_sale_price_kes',p_flash_price_kes)
  );

  return jsonb_build_object('ok',true,'service_id',p_service_id,'flash_sale_status','requested');
end
$function$
;
