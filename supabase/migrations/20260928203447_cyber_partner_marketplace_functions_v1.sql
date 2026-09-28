-- LEOGO DIGITAL MARKET V2
-- Cyber marketplace RPC functions

CREATE OR REPLACE FUNCTION public.admin_get_cyber_settings()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb;
begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Admin access required'; end if;
  select to_jsonb(s) into v from public.cyber_marketplace_settings s where id=1;
  return v;
end
$function$


CREATE OR REPLACE FUNCTION public.admin_list_cyber_orders()
 RETURNS TABLE(id uuid, order_reference text, customer_id uuid, customer_name text, provider_id uuid, provider_name text, item_type text, item_name text, quantity numeric, subtotal_kes numeric, provider_quote_kes numeric, pricing_status text, fulfilment_method text, delivery_zone_code text, delivery_address text, delivery_fee_kes numeric, total_kes numeric, payment_reference text, payment_status text, order_status text, customer_notes text, created_at timestamp with time zone, files jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Admin access required'; end if;
  return query
  select o.id,o.order_reference,o.customer_id,coalesce(cp.full_name,u.email::text,'Customer'),o.provider_id,c.business_name,
         o.item_type,o.item_name,o.quantity,o.subtotal_kes,o.provider_quote_kes,o.pricing_status,o.fulfilment_method,
         o.delivery_zone_code,o.delivery_address,o.delivery_fee_kes,o.total_kes,o.payment_reference,o.payment_status,o.order_status,
         o.customer_notes,o.created_at,
         coalesce((select jsonb_agg(jsonb_build_object('path',f.storage_path,'name',f.original_name,'mime',f.mime_type,'size',f.size_bytes) order by f.created_at)
                   from public.cyber_order_files f where f.order_id=o.id),'[]'::jsonb)
  from public.cyber_orders o
  join public.cyber_provider_accounts c on c.user_id=o.provider_id
  left join public.customer_profiles cp on cp.user_id=o.customer_id
  left join auth.users u on u.id=o.customer_id
  order by o.created_at desc;
end
$function$


CREATE OR REPLACE FUNCTION public.admin_list_cyber_products()
 RETURNS TABLE(id uuid, provider_id uuid, provider_name text, product_name text, description text, price_kes numeric, quantity_available numeric, measurement_unit text, image_path text, availability_status text, approval_status text, admin_notes text, submitted_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Admin access required'; end if;
  return query
  select p.id,p.provider_id,c.business_name,p.product_name,p.description,p.price_kes,p.quantity_available,
         p.measurement_unit,p.image_path,p.availability_status,p.approval_status,p.admin_notes,p.submitted_at
  from public.cyber_products p join public.cyber_provider_accounts c on c.user_id=p.provider_id
  order by p.submitted_at desc;
end
$function$


CREATE OR REPLACE FUNCTION public.admin_list_cyber_profile_changes()
 RETURNS TABLE(id uuid, partner_id uuid, business_name text, email text, status text, submitted_at timestamp with time zone, admin_notes text, payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Admin access required'; end if;
  return query
  select r.id,r.partner_id,coalesce(c.business_name,u.email::text,'Cyber Partner'),u.email::text,
         r.status,r.submitted_at,r.admin_notes,
         r.payload||jsonb_build_object('profile_change_request_id',r.id,'partner_type','cyber')
  from public.partner_profile_change_requests r
  left join public.cyber_provider_accounts c on c.user_id=r.partner_id
  left join auth.users u on u.id=r.partner_id
  where r.partner_type='cyber' and r.status in ('submitted','under_review','changes_requested')
  order by r.submitted_at desc;
end
$function$


CREATE OR REPLACE FUNCTION public.admin_list_cyber_providers()
 RETURNS TABLE(user_id uuid, business_name text, owner_name text, email text, phone text, id_number text, county text, sub_county text, town text, location_details text, shop_latitude numeric, shop_longitude numeric, shop_map_link text, business_description text, profile_picture_path text, business_id_document_path text, business_licence_path text, registration_certificate_path text, other_permit_paths text[], application_status text, availability_status text, submitted_at timestamp with time zone, approved_at timestamp with time zone, admin_notes text, service_count bigint, product_count bigint, order_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Admin access required'; end if;
  return query
  select c.user_id,c.business_name,c.owner_name,u.email::text,c.phone,c.id_number,c.county,c.sub_county,c.town,
         c.location_details,c.shop_latitude,c.shop_longitude,c.shop_map_link,c.business_description,c.profile_picture_path,
         c.business_id_document_path,c.business_licence_path,c.registration_certificate_path,c.other_permit_paths,
         c.application_status,c.availability_status,c.submitted_at,c.approved_at,c.admin_notes,
         (select count(*) from public.cyber_services s where s.provider_id=c.user_id),
         (select count(*) from public.cyber_products p where p.provider_id=c.user_id),
         (select count(*) from public.cyber_orders o where o.provider_id=c.user_id)
  from public.cyber_provider_accounts c
  left join auth.users u on u.id=c.user_id
  order by coalesce(c.submitted_at,c.created_at) desc;
end
$function$


CREATE OR REPLACE FUNCTION public.admin_list_cyber_services()
 RETURNS TABLE(id uuid, provider_id uuid, provider_name text, service_name text, service_category text, description text, pricing_model text, price_kes numeric, unit_label text, requires_file_upload boolean, is_available boolean, approval_status text, admin_notes text, submitted_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Admin access required'; end if;
  return query
  select s.id,s.provider_id,c.business_name,s.service_name,s.service_category,s.description,s.pricing_model,
         s.price_kes,s.unit_label,s.requires_file_upload,s.is_available,s.approval_status,s.admin_notes,s.submitted_at
  from public.cyber_services s join public.cyber_provider_accounts c on c.user_id=s.provider_id
  order by s.submitted_at desc;
end
$function$


CREATE OR REPLACE FUNCTION public.admin_review_cyber_product(p_product_id uuid, p_decision text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_before jsonb; v_after jsonb; v_provider uuid; v_name text;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('approve','reject','under_review','changes_requested') then raise exception 'Unsupported decision'; end if;
  if p_decision in ('reject','changes_requested') and char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'A clear reason is required'; end if;
  select to_jsonb(p),p.provider_id,p.product_name into v_before,v_provider,v_name from public.cyber_products p where p.id=p_product_id for update;
  if v_before is null then raise exception 'Cyber product not found'; end if;
  update public.cyber_products set
    approval_status=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected'
      when 'changes_requested' then 'changes_requested' else 'under_review' end,
    approved_at=case when p_decision='approve' then now() else null end,
    approved_by=case when p_decision='approve' then (select auth.uid()) else null end,
    admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
    updated_at=now()
  where id=p_product_id;
  select to_jsonb(p) into v_after from public.cyber_products p where p.id=p_product_id;
  perform private.notify_partner(v_provider,'cyber','cyber_product_'||p_decision,
    case p_decision when 'approve' then 'Cyber product approved' when 'changes_requested' then 'Cyber product needs correction'
      when 'reject' then 'Cyber product not approved' else 'Cyber product under review' end,
    v_name||case p_decision when 'approve' then ' is now visible to customers.'
      when 'changes_requested' then ' needs correction before approval.'
      when 'reject' then ' was not approved.' else ' is under Admin review.' end
      ||case when nullif(btrim(coalesce(p_notes,'')),'') is null then '' else ' Admin note: '||btrim(p_notes) end,
    'cyber_product',p_product_id,'cyber-products',jsonb_build_object('decision',p_decision));
  perform private.write_admin_audit('approval.cyber_product.'||p_decision,'cyber_product',p_product_id::text,v_before,v_after,jsonb_build_object('notes',p_notes));
  return jsonb_build_object('ok',true,'decision',p_decision);
end
$function$


CREATE OR REPLACE FUNCTION public.admin_review_cyber_profile_change(p_change_id uuid, p_decision text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_req public.partner_profile_change_requests%rowtype; v_before jsonb; v_after jsonb; v_payload jsonb;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('approve','reject','under_review','changes_requested') then raise exception 'Unsupported decision'; end if;
  if p_decision in ('reject','changes_requested') and char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'A clear reason is required'; end if;

  select * into v_req from public.partner_profile_change_requests where id=p_change_id and partner_type='cyber' for update;
  if not found then raise exception 'Cyber profile change request not found'; end if;
  if v_req.status not in ('submitted','under_review','changes_requested') then raise exception 'This Cyber profile change has already been reviewed'; end if;
  v_payload:=v_req.payload;

  if p_decision='approve' then
    select to_jsonb(c) into v_before from public.cyber_provider_accounts c where c.user_id=v_req.partner_id for update;
    update public.cyber_provider_accounts set
      business_name=v_payload->>'business_name',owner_name=v_payload->>'owner_name',id_number=v_payload->>'id_number',phone=v_payload->>'phone',
      county=v_payload->>'county',sub_county=v_payload->>'sub_county',county_code=v_payload->>'county_code',sub_county_code=v_payload->>'sub_county_code',
      town=v_payload->>'town',location_details=v_payload->>'location_details',
      shop_latitude=(v_payload->>'shop_latitude')::numeric,shop_longitude=(v_payload->>'shop_longitude')::numeric,
      shop_map_link=nullif(v_payload->>'shop_map_link',''),business_description=nullif(v_payload->>'business_description',''),
      profile_picture_path=coalesce(nullif(v_payload->>'profile_picture_path',''),profile_picture_path),
      business_id_document_path=v_payload->>'business_id_document_path',
      business_licence_path=nullif(v_payload->>'business_licence_path',''),
      registration_certificate_path=nullif(v_payload->>'registration_certificate_path',''),
      other_permit_paths=coalesce(array(select jsonb_array_elements_text(coalesce(v_payload->'other_permit_paths','[]'::jsonb))),'{}'::text[]),
      admin_notes=null,updated_at=now()
    where user_id=v_req.partner_id and application_status='approved';
    if not found then raise exception 'Approved Cyber account not found'; end if;
    select to_jsonb(c) into v_after from public.cyber_provider_accounts c where c.user_id=v_req.partner_id;
  end if;

  update public.partner_profile_change_requests set
    status=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' when 'changes_requested' then 'changes_requested' else 'under_review' end,
    admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
    reviewed_at=case when p_decision in ('approve','reject') then now() else null end,
    reviewed_by=(select auth.uid()),updated_at=now()
  where id=p_change_id;

  perform private.notify_partner(v_req.partner_id,'cyber','profile_change_'||p_decision,
    case p_decision when 'approve' then 'Cyber profile changes approved' when 'changes_requested' then 'Cyber profile changes need correction'
      when 'reject' then 'Cyber profile changes not approved' else 'Cyber profile changes under review' end,
    case p_decision when 'approve' then 'Your approved Cyber profile has been updated.'
      when 'changes_requested' then 'LEOGO Admin requested corrections to your Cyber profile changes.'
      when 'reject' then 'Your proposed Cyber profile changes were not approved. Your previous profile remains active.'
      else 'LEOGO Admin is reviewing your Cyber profile changes.' end
      ||case when nullif(btrim(coalesce(p_notes,'')),'') is null then '' else ' Admin note: '||btrim(p_notes) end,
    'partner_profile_change',p_change_id,'cyber-profile',jsonb_build_object('decision',p_decision));

  perform private.write_admin_audit('approval.cyber_profile_change.'||p_decision,'partner_profile_change',p_change_id::text,v_before,coalesce(v_after,v_payload),jsonb_build_object('notes',p_notes));
  return jsonb_build_object('ok',true,'decision',p_decision);
end
$function$


CREATE OR REPLACE FUNCTION public.admin_review_cyber_provider(p_user_id uuid, p_decision text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_before jsonb; v_after jsonb; v_name text;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('approve','reject','under_review','changes_requested','suspend','reactivate') then raise exception 'Unsupported decision'; end if;
  if p_decision in ('reject','changes_requested','suspend') and char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'A clear reason is required'; end if;

  select to_jsonb(c),c.business_name into v_before,v_name from public.cyber_provider_accounts c where c.user_id=p_user_id for update;
  if v_before is null then raise exception 'Cyber Provider not found'; end if;

  update public.cyber_provider_accounts set
    application_status=case p_decision
      when 'approve' then 'approved' when 'reject' then 'rejected' when 'changes_requested' then 'changes_requested'
      when 'under_review' then 'under_review' when 'suspend' then 'suspended' else 'approved' end,
    approved_at=case when p_decision in ('approve','reactivate') then coalesce(approved_at,now()) else approved_at end,
    approved_by=case when p_decision in ('approve','reactivate') then (select auth.uid()) else approved_by end,
    admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
    updated_at=now()
  where user_id=p_user_id;

  select to_jsonb(c) into v_after from public.cyber_provider_accounts c where c.user_id=p_user_id;
  perform private.notify_partner(
    p_user_id,'cyber','cyber_application_'||p_decision,
    case p_decision when 'approve' then 'Cyber application approved' when 'changes_requested' then 'Cyber application needs correction'
      when 'reject' then 'Cyber application not approved' when 'suspend' then 'Cyber account suspended'
      when 'reactivate' then 'Cyber account reactivated' else 'Cyber application under review' end,
    v_name||case p_decision when 'approve' then ' is approved to offer Cyber Services on LEOGO.'
      when 'changes_requested' then ' needs corrections before approval.'
      when 'reject' then ' was not approved.'
      when 'suspend' then ' has been suspended.'
      when 'reactivate' then ' is active again.'
      else ' is under Admin review.' end
      ||case when nullif(btrim(coalesce(p_notes,'')),'') is null then '' else ' Admin note: '||btrim(p_notes) end,
    'cyber_provider',p_user_id,'cyber-overview',jsonb_build_object('decision',p_decision)
  );
  perform private.write_admin_audit('approval.cyber_provider.'||p_decision,'cyber_provider',p_user_id::text,v_before,v_after,jsonb_build_object('notes',p_notes));
  return jsonb_build_object('ok',true,'decision',p_decision);
end
$function$


CREATE OR REPLACE FUNCTION public.admin_review_cyber_service(p_service_id uuid, p_decision text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_before jsonb; v_after jsonb; v_provider uuid; v_name text;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('approve','reject','under_review','changes_requested') then raise exception 'Unsupported decision'; end if;
  if p_decision in ('reject','changes_requested') and char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'A clear reason is required'; end if;
  select to_jsonb(s),s.provider_id,s.service_name into v_before,v_provider,v_name from public.cyber_services s where s.id=p_service_id for update;
  if v_before is null then raise exception 'Cyber service not found'; end if;
  update public.cyber_services set
    approval_status=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected'
      when 'changes_requested' then 'changes_requested' else 'under_review' end,
    approved_at=case when p_decision='approve' then now() else null end,
    approved_by=case when p_decision='approve' then (select auth.uid()) else null end,
    admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
    updated_at=now()
  where id=p_service_id;
  select to_jsonb(s) into v_after from public.cyber_services s where s.id=p_service_id;
  perform private.notify_partner(v_provider,'cyber','cyber_service_'||p_decision,
    case p_decision when 'approve' then 'Cyber service approved' when 'changes_requested' then 'Cyber service needs correction'
      when 'reject' then 'Cyber service not approved' else 'Cyber service under review' end,
    v_name||case p_decision when 'approve' then ' is now visible to customers.'
      when 'changes_requested' then ' needs correction before approval.'
      when 'reject' then ' was not approved.' else ' is under Admin review.' end
      ||case when nullif(btrim(coalesce(p_notes,'')),'') is null then '' else ' Admin note: '||btrim(p_notes) end,
    'cyber_service',p_service_id,'cyber-services',jsonb_build_object('decision',p_decision));
  perform private.write_admin_audit('approval.cyber_service.'||p_decision,'cyber_service',p_service_id::text,v_before,v_after,jsonb_build_object('notes',p_notes));
  return jsonb_build_object('ok',true,'decision',p_decision);
end
$function$


CREATE OR REPLACE FUNCTION public.admin_update_cyber_settings(p_cbd_fee numeric, p_estate_fee numeric, p_outside_town_fee numeric, p_delivery_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_leogo_admin('fees.manage') and not private.is_leogo_admin('settings.manage') then
    raise exception 'Fee-management permission required';
  end if;
  if least(coalesce(p_cbd_fee,-1),coalesce(p_estate_fee,-1),coalesce(p_outside_town_fee,-1))<0 then
    raise exception 'Delivery fees cannot be negative';
  end if;
  update public.cyber_marketplace_settings set
    cbd_delivery_fee_kes=p_cbd_fee,estate_delivery_fee_kes=p_estate_fee,outside_town_delivery_fee_kes=p_outside_town_fee,
    delivery_note=coalesce(nullif(btrim(coalesce(p_delivery_note,'')),''),delivery_note),
    updated_by=(select auth.uid()),updated_at=now()
  where id=1;
  return (select to_jsonb(s) from public.cyber_marketplace_settings s where id=1);
end
$function$


CREATE OR REPLACE FUNCTION public.admin_verify_cyber_order_payment(p_order_id uuid, p_decision text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_order public.cyber_orders%rowtype;
begin
  if not private.is_leogo_admin('approvals.manage') and not private.is_leogo_admin('orders.payment_verify') then
    raise exception 'Payment verification permission required';
  end if;
  if p_decision not in ('verify','reject') then raise exception 'Unsupported payment decision'; end if;
  select * into v_order from public.cyber_orders where id=p_order_id for update;
  if not found then raise exception 'Cyber order not found'; end if;
  if v_order.payment_status<>'pending_verification' then raise exception 'This Cyber payment is not awaiting verification'; end if;

  if p_decision='verify' then
    if v_order.item_type='product' then
      update public.cyber_products
      set quantity_available=quantity_available-v_order.quantity,
          availability_status=case when quantity_available-v_order.quantity<=0 then 'out_of_stock' else availability_status end,
          updated_at=now()
      where id=v_order.product_id and quantity_available>=v_order.quantity;
      if not found then raise exception 'Product stock is no longer sufficient'; end if;
    end if;
    update public.cyber_orders set payment_status='verified',payment_verified_at=now(),payment_verified_by=(select auth.uid()),
      order_status=case when order_status='awaiting_payment' then 'submitted' else order_status end,
      admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
      updated_at=now()
    where id=p_order_id;
    perform private.notify_partner(v_order.provider_id,'cyber','cyber_payment_verified','Cyber order payment verified',
      v_order.order_reference||' payment has been verified. You can now process the order.',
      'cyber_order',p_order_id,'cyber-orders',jsonb_build_object('payment_status','verified'));
    insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
    values(v_order.customer_id,'cyber_order','Cyber payment verified',
      v_order.order_reference||' payment has been verified by LEOGO Admin.',
      'cyber_order',p_order_id,'cyber_payment_verified_'||p_order_id::text,'orders',jsonb_build_object('payment_status','verified'))
    on conflict(event_key) do nothing;
  else
    update public.cyber_orders set payment_status='rejected',admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
      updated_at=now() where id=p_order_id;
    insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
    values(v_order.customer_id,'cyber_order','Cyber payment needs attention',
      v_order.order_reference||' payment could not be verified.'||case when nullif(btrim(coalesce(p_notes,'')),'') is null then '' else ' Admin note: '||btrim(p_notes) end,
      'cyber_order',p_order_id,'cyber_payment_rejected_'||p_order_id::text,'orders',jsonb_build_object('payment_status','rejected'))
    on conflict(event_key) do nothing;
  end if;

  perform private.write_admin_audit('cyber_order.payment.'||p_decision,'cyber_order',p_order_id::text,to_jsonb(v_order),null,jsonb_build_object('notes',p_notes));
  return jsonb_build_object('ok',true,'decision',p_decision);
end
$function$


CREATE OR REPLACE FUNCTION public.customer_create_cyber_order(p_item_type text, p_item_id uuid, p_quantity numeric, p_customer_notes text, p_fulfilment_method text, p_delivery_zone_code text DEFAULT NULL::text, p_delivery_address text DEFAULT NULL::text, p_delivery_landmark text DEFAULT NULL::text, p_delivery_map_link text DEFAULT NULL::text, p_delivery_latitude numeric DEFAULT NULL::numeric, p_delivery_longitude numeric DEFAULT NULL::numeric, p_payment_reference text DEFAULT NULL::text, p_files jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_provider uuid; v_name text; v_pricing text; v_price numeric; v_requires_file boolean := false;
  v_qty numeric := greatest(coalesce(p_quantity,1),1);
  v_subtotal numeric := 0; v_delivery numeric := 0; v_total numeric := 0;
  v_order_id uuid; v_ref text; v_status text; v_payment_status text; v_file jsonb; v_path text;
  v_available numeric;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if p_item_type not in ('service','product') then raise exception 'Choose a Cyber service or product'; end if;
  if p_fulfilment_method not in ('pickup','delivery') then raise exception 'Choose pickup or delivery'; end if;

  if p_item_type='service' then
    select s.provider_id,s.service_name,s.pricing_model,s.price_kes,s.requires_file_upload
      into v_provider,v_name,v_pricing,v_price,v_requires_file
    from public.cyber_services s
    join public.cyber_provider_accounts c on c.user_id=s.provider_id
    where s.id=p_item_id and s.approval_status='approved' and s.is_available and c.application_status='approved';
    if v_provider is null then raise exception 'This Cyber service is not currently available'; end if;
    if v_pricing='quote' then
      v_subtotal:=0; v_status:='awaiting_quote';
    else
      v_subtotal:=round(coalesce(v_price,0)*v_qty,2); v_status:='awaiting_payment';
    end if;
  else
    select p.provider_id,p.product_name,'fixed',p.price_kes,false,p.quantity_available
      into v_provider,v_name,v_pricing,v_price,v_requires_file,v_available
    from public.cyber_products p
    join public.cyber_provider_accounts c on c.user_id=p.provider_id
    where p.id=p_item_id and p.approval_status='approved' and p.availability_status='available'
      and c.application_status='approved';
    if v_provider is null then raise exception 'This Cyber product is not currently available'; end if;
    if v_qty>v_available then raise exception 'Requested quantity is higher than available stock'; end if;
    v_subtotal:=round(v_price*v_qty,2); v_status:='awaiting_payment';
  end if;

  if p_fulfilment_method='delivery' then
    if p_delivery_zone_code not in ('cbd','estate','outside_town') then raise exception 'Choose a delivery zone'; end if;
    if char_length(btrim(coalesce(p_delivery_address,'')))<3 then raise exception 'Enter the delivery address'; end if;
    select case p_delivery_zone_code
      when 'cbd' then cbd_delivery_fee_kes
      when 'estate' then estate_delivery_fee_kes
      else outside_town_delivery_fee_kes end
    into v_delivery from public.cyber_marketplace_settings where id=1;
  end if;

  v_total:=round(v_subtotal+coalesce(v_delivery,0),2);
  if v_pricing='quote' then
    v_payment_status:='not_required';
  else
    v_payment_status:=case when v_total>0 then 'pending_verification' else 'not_required' end;
    if v_total>0 and char_length(btrim(coalesce(p_payment_reference,'')))<3 then
      raise exception 'Enter the payment reference';
    end if;
  end if;

  if v_requires_file and (p_files is null or jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files)=0) then
    raise exception 'Upload the document/file required for this service';
  end if;
  if p_files is not null and jsonb_typeof(p_files)<>'array' then raise exception 'Uploaded file information is invalid'; end if;

  v_order_id:=gen_random_uuid();
  v_ref:='CYB-'||upper(substr(replace(v_order_id::text,'-',''),1,8));

  insert into public.cyber_orders(
    id,order_reference,customer_id,provider_id,item_type,service_id,product_id,item_name,pricing_model,quantity,
    unit_price_kes,subtotal_kes,pricing_status,fulfilment_method,delivery_zone_code,delivery_address,delivery_landmark,
    delivery_map_link,delivery_latitude,delivery_longitude,delivery_fee_kes,total_kes,customer_notes,payment_reference,
    payment_status,order_status,submitted_at,updated_at
  ) values (
    v_order_id,v_ref,v_uid,v_provider,p_item_type,
    case when p_item_type='service' then p_item_id else null end,
    case when p_item_type='product' then p_item_id else null end,
    v_name,v_pricing,v_qty,v_price,v_subtotal,
    case when v_pricing='quote' then 'quote_requested' else 'fixed' end,
    p_fulfilment_method,p_delivery_zone_code,nullif(btrim(coalesce(p_delivery_address,'')),''),
    nullif(btrim(coalesce(p_delivery_landmark,'')),''),
    nullif(btrim(coalesce(p_delivery_map_link,'')),''),
    p_delivery_latitude,p_delivery_longitude,v_delivery,v_total,
    nullif(btrim(coalesce(p_customer_notes,'')),''),
    case when v_pricing='quote' then null else nullif(btrim(coalesce(p_payment_reference,'')),'') end,
    v_payment_status,v_status,now(),now()
  );

  if p_files is not null then
    for v_file in select * from jsonb_array_elements(p_files)
    loop
      v_path:=nullif(btrim(coalesce(v_file->>'path','')),'');
      if v_path is null or split_part(v_path,'/',1)<>v_uid::text then raise exception 'Invalid uploaded file path'; end if;
      insert into public.cyber_order_files(order_id,uploaded_by,storage_path,original_name,mime_type,size_bytes)
      values(
        v_order_id,v_uid,v_path,coalesce(nullif(v_file->>'name',''),'Customer document'),
        nullif(v_file->>'mime',''),
        case when nullif(v_file->>'size','') is null then null else (v_file->>'size')::bigint end
      );
    end loop;
  end if;

  perform private.notify_partner(
    v_provider,'cyber',
    case when v_pricing='quote' then 'cyber_quote_request' else 'cyber_order_received' end,
    case when v_pricing='quote' then 'New Cyber quotation request' else 'New Cyber customer order' end,
    v_ref||' · '||v_name||case when v_payment_status='pending_verification' then ' · payment awaiting Admin verification' else '' end,
    'cyber_order',v_order_id,'cyber-orders',jsonb_build_object('order_reference',v_ref,'fulfilment_method',p_fulfilment_method)
  );

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values (
    v_uid,'cyber_order','Cyber order received',
    v_ref||' for '||v_name||' has been submitted.',
    'cyber_order',v_order_id,'cyber_order_created_'||v_order_id::text,'orders',
    jsonb_build_object('order_reference',v_ref,'fulfilment_method',p_fulfilment_method)
  ) on conflict(event_key) do nothing;

  return jsonb_build_object(
    'ok',true,'order_id',v_order_id,'order_reference',v_ref,'subtotal_kes',v_subtotal,
    'delivery_fee_kes',v_delivery,'total_kes',v_total,'payment_status',v_payment_status,'order_status',v_status
  );
end
$function$


CREATE OR REPLACE FUNCTION public.customer_decide_cyber_quote(p_order_id uuid, p_decision text, p_payment_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := (select auth.uid()); v_order public.cyber_orders%rowtype; v_total numeric;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if p_decision not in ('accept','reject') then raise exception 'Choose accept or reject'; end if;
  select * into v_order from public.cyber_orders where id=p_order_id and customer_id=v_uid for update;
  if not found then raise exception 'Cyber order not found'; end if;
  if v_order.pricing_status<>'quoted' or v_order.provider_quote_kes is null then raise exception 'There is no active Cyber quote to decide'; end if;

  if p_decision='reject' then
    update public.cyber_orders set pricing_status='quote_rejected',order_status='cancelled',updated_at=now() where id=p_order_id;
    perform private.notify_partner(v_order.provider_id,'cyber','cyber_quote_rejected','Cyber quote declined',
      v_order.order_reference||' quote was declined by the customer.','cyber_order',p_order_id,'cyber-orders','{}'::jsonb);
    return jsonb_build_object('ok',true,'decision','reject');
  end if;

  v_total:=round(v_order.provider_quote_kes+v_order.delivery_fee_kes,2);
  if v_total>0 and char_length(btrim(coalesce(p_payment_reference,'')))<3 then raise exception 'Enter the payment reference'; end if;
  update public.cyber_orders set
    pricing_status='quote_accepted',subtotal_kes=v_order.provider_quote_kes,total_kes=v_total,
    payment_reference=nullif(btrim(coalesce(p_payment_reference,'')),''),
    payment_status=case when v_total>0 then 'pending_verification' else 'not_required' end,
    order_status=case when v_total>0 then 'awaiting_payment' else 'submitted' end,
    updated_at=now()
  where id=p_order_id;
  return jsonb_build_object('ok',true,'decision','accept','total_kes',v_total);
end
$function$


CREATE OR REPLACE FUNCTION public.customer_list_cyber_orders()
 RETURNS TABLE(id uuid, order_reference text, provider_id uuid, provider_name text, item_type text, item_name text, quantity numeric, unit_price_kes numeric, subtotal_kes numeric, provider_quote_kes numeric, provider_quote_notes text, pricing_status text, fulfilment_method text, delivery_address text, delivery_fee_kes numeric, total_kes numeric, payment_reference text, payment_status text, order_status text, shop_location text, shop_map_link text, created_at timestamp with time zone, files jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select o.id,o.order_reference,o.provider_id,c.business_name,o.item_type,o.item_name,o.quantity,o.unit_price_kes,
         o.subtotal_kes,o.provider_quote_kes,o.provider_quote_notes,o.pricing_status,o.fulfilment_method,
         o.delivery_address,o.delivery_fee_kes,o.total_kes,o.payment_reference,o.payment_status,o.order_status,
         concat_ws(', ',c.location_details,c.town,c.county),c.shop_map_link,o.created_at,
         coalesce((select jsonb_agg(jsonb_build_object('path',f.storage_path,'name',f.original_name,'mime',f.mime_type,'size',f.size_bytes) order by f.created_at)
                   from public.cyber_order_files f where f.order_id=o.id),'[]'::jsonb)
  from public.cyber_orders o
  join public.cyber_provider_accounts c on c.user_id=o.provider_id
  where o.customer_id=(select auth.uid())
  order by o.created_at desc
$function$


CREATE OR REPLACE FUNCTION public.cyber_provider_get_own_account()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := (select auth.uid()); v_result jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select to_jsonb(c) into v_result from public.cyber_provider_accounts c where c.user_id=v_uid;
  return v_result;
end
$function$


CREATE OR REPLACE FUNCTION public.cyber_provider_list_orders()
 RETURNS TABLE(id uuid, order_reference text, customer_id uuid, customer_name text, customer_phone text, item_type text, item_name text, quantity numeric, subtotal_kes numeric, provider_quote_kes numeric, provider_quote_notes text, pricing_status text, fulfilment_method text, delivery_address text, delivery_landmark text, delivery_map_link text, delivery_fee_kes numeric, total_kes numeric, payment_status text, order_status text, customer_notes text, created_at timestamp with time zone, files jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select o.id,o.order_reference,o.customer_id,coalesce(cp.full_name,u.email::text,'Customer'),cp.phone,
         o.item_type,o.item_name,o.quantity,o.subtotal_kes,o.provider_quote_kes,o.provider_quote_notes,o.pricing_status,
         o.fulfilment_method,o.delivery_address,o.delivery_landmark,o.delivery_map_link,o.delivery_fee_kes,o.total_kes,
         o.payment_status,o.order_status,o.customer_notes,o.created_at,
         coalesce((select jsonb_agg(jsonb_build_object('path',f.storage_path,'name',f.original_name,'mime',f.mime_type,'size',f.size_bytes) order by f.created_at)
                   from public.cyber_order_files f where f.order_id=o.id),'[]'::jsonb)
  from public.cyber_orders o
  left join public.customer_profiles cp on cp.user_id=o.customer_id
  left join auth.users u on u.id=o.customer_id
  where o.provider_id=(select auth.uid())
  order by o.created_at desc
$function$


CREATE OR REPLACE FUNCTION public.cyber_provider_list_products()
 RETURNS SETOF cyber_products
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.* from public.cyber_products p
  where p.provider_id=(select auth.uid())
  order by p.created_at desc
$function$


CREATE OR REPLACE FUNCTION public.cyber_provider_list_services()
 RETURNS SETOF cyber_services
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select s.* from public.cyber_services s
  where s.provider_id=(select auth.uid())
  order by s.created_at desc
$function$


CREATE OR REPLACE FUNCTION public.cyber_provider_quote_order(p_order_id uuid, p_quote_kes numeric, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := (select auth.uid()); v_order public.cyber_orders%rowtype;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if p_quote_kes is null or p_quote_kes<0 then raise exception 'Enter a valid quotation amount'; end if;
  select * into v_order from public.cyber_orders where id=p_order_id and provider_id=v_uid for update;
  if not found then raise exception 'Cyber order not found'; end if;
  if v_order.pricing_status not in ('quote_requested','quoted') then raise exception 'This Cyber order does not require a quotation'; end if;

  update public.cyber_orders set provider_quote_kes=p_quote_kes,
    provider_quote_notes=nullif(btrim(coalesce(p_notes,'')),''),
    pricing_status='quoted',order_status='awaiting_quote',updated_at=now()
  where id=p_order_id;

  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(v_order.customer_id,'cyber_order','Cyber quotation received',
    v_order.order_reference||' quotation: KSh '||trim(to_char(p_quote_kes,'FM999999990.00')),
    'cyber_order',p_order_id,'cyber_quote_'||p_order_id::text||'_'||extract(epoch from now())::bigint::text,
    'orders',jsonb_build_object('quote_kes',p_quote_kes))
  on conflict(event_key) do nothing;

  return jsonb_build_object('ok',true,'pricing_status','quoted','quote_kes',p_quote_kes);
end
$function$


CREATE OR REPLACE FUNCTION public.cyber_provider_save_product(p_product_id uuid, p_product_name text, p_description text, p_price_kes numeric, p_quantity_available numeric, p_measurement_unit text, p_image_path text, p_availability_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := (select auth.uid()); v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.cyber_provider_accounts where user_id=v_uid and application_status='approved') then
    raise exception 'Approved Cyber account required';
  end if;
  if char_length(btrim(coalesce(p_product_name,'')))<2 then raise exception 'Product name is required'; end if;
  if p_price_kes is null or p_price_kes<0 then raise exception 'Enter a valid product price'; end if;
  if coalesce(p_quantity_available,0)<0 then raise exception 'Quantity cannot be negative'; end if;
  if p_availability_status not in ('available','out_of_stock','inactive') then raise exception 'Choose a valid availability status'; end if;

  if p_product_id is null then
    insert into public.cyber_products(
      provider_id,product_name,description,price_kes,quantity_available,measurement_unit,image_path,
      availability_status,approval_status,admin_notes,submitted_at,updated_at
    ) values (
      v_uid,btrim(p_product_name),nullif(btrim(coalesce(p_description,'')),''),
      p_price_kes,p_quantity_available,coalesce(nullif(btrim(coalesce(p_measurement_unit,'')),''),'piece'),
      nullif(btrim(coalesce(p_image_path,'')),''),
      p_availability_status,'pending',null,now(),now()
    ) returning id into v_id;
  else
    update public.cyber_products set
      product_name=btrim(p_product_name),description=nullif(btrim(coalesce(p_description,'')),''),
      price_kes=p_price_kes,quantity_available=p_quantity_available,
      measurement_unit=coalesce(nullif(btrim(coalesce(p_measurement_unit,'')),''),'piece'),
      image_path=coalesce(nullif(btrim(coalesce(p_image_path,'')),''),image_path),
      availability_status=p_availability_status,approval_status='pending',admin_notes=null,
      submitted_at=now(),approved_at=null,approved_by=null,updated_at=now()
    where id=p_product_id and provider_id=v_uid
    returning id into v_id;
    if v_id is null then raise exception 'Cyber product not found'; end if;
  end if;

  perform private.notify_partner(v_uid,'cyber','cyber_product_submitted','Cyber product sent for approval',
    btrim(p_product_name)||' has been sent to LEOGO Admin for approval.',
    'cyber_product',v_id,'cyber-products',jsonb_build_object('approval_status','pending'));
  return jsonb_build_object('ok',true,'product_id',v_id,'approval_status','pending');
end
$function$


CREATE OR REPLACE FUNCTION public.cyber_provider_save_service(p_service_id uuid, p_service_name text, p_service_category text, p_description text, p_pricing_model text, p_price_kes numeric, p_unit_label text, p_requires_file_upload boolean, p_accepts_multiple_files boolean, p_is_available boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := (select auth.uid()); v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.cyber_provider_accounts where user_id=v_uid and application_status='approved') then
    raise exception 'Approved Cyber account required';
  end if;
  if char_length(btrim(coalesce(p_service_name,'')))<2 then raise exception 'Service name is required'; end if;
  if p_service_category not in ('photocopy','printing','typesetting','online_service','scanning','lamination','branding','design','other') then raise exception 'Choose a valid Cyber service category'; end if;
  if p_pricing_model not in ('per_page','per_item','fixed','quote') then raise exception 'Choose a valid pricing model'; end if;
  if p_pricing_model<>'quote' and (p_price_kes is null or p_price_kes<0) then raise exception 'Enter the service price'; end if;

  if p_service_id is null then
    insert into public.cyber_services(
      provider_id,service_name,service_category,description,pricing_model,price_kes,unit_label,
      requires_file_upload,accepts_multiple_files,is_available,approval_status,admin_notes,submitted_at,updated_at
    ) values (
      v_uid,btrim(p_service_name),p_service_category,nullif(btrim(coalesce(p_description,'')),''),
      p_pricing_model,case when p_pricing_model='quote' then null else p_price_kes end,
      nullif(btrim(coalesce(p_unit_label,'')),''),
      coalesce(p_requires_file_upload,false),coalesce(p_accepts_multiple_files,true),coalesce(p_is_available,true),
      'pending',null,now(),now()
    ) returning id into v_id;
  else
    update public.cyber_services set
      service_name=btrim(p_service_name),service_category=p_service_category,
      description=nullif(btrim(coalesce(p_description,'')),''),
      pricing_model=p_pricing_model,price_kes=case when p_pricing_model='quote' then null else p_price_kes end,
      unit_label=nullif(btrim(coalesce(p_unit_label,'')),''),
      requires_file_upload=coalesce(p_requires_file_upload,false),
      accepts_multiple_files=coalesce(p_accepts_multiple_files,true),
      is_available=coalesce(p_is_available,true),
      approval_status='pending',admin_notes=null,submitted_at=now(),approved_at=null,approved_by=null,updated_at=now()
    where id=p_service_id and provider_id=v_uid
    returning id into v_id;
    if v_id is null then raise exception 'Cyber service not found'; end if;
  end if;

  perform private.notify_partner(v_uid,'cyber','cyber_service_submitted','Cyber service sent for approval',
    btrim(p_service_name)||' has been sent to LEOGO Admin for approval.',
    'cyber_service',v_id,'cyber-services',jsonb_build_object('approval_status','pending'));
  return jsonb_build_object('ok',true,'service_id',v_id,'approval_status','pending');
end
$function$


CREATE OR REPLACE FUNCTION public.cyber_provider_submit_application(p_business_name text, p_owner_name text, p_id_number text, p_phone text, p_county_code text, p_sub_county_code text, p_town text, p_location_details text, p_shop_latitude numeric, p_shop_longitude numeric, p_shop_map_link text DEFAULT NULL::text, p_business_description text DEFAULT NULL::text, p_profile_picture_path text DEFAULT NULL::text, p_business_id_document_path text DEFAULT NULL::text, p_business_licence_path text DEFAULT NULL::text, p_registration_certificate_path text DEFAULT NULL::text, p_other_permit_paths text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_county text;
  v_subcounty text;
  v_existing text;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if char_length(btrim(coalesce(p_business_name,'')))<2 then raise exception 'Cyber business name is required'; end if;
  if char_length(btrim(coalesce(p_owner_name,'')))<2 then raise exception 'Owner name is required'; end if;
  if coalesce(p_phone,'') !~ '^[+]254[17][0-9]{8}$' then raise exception 'Enter a valid Kenyan phone number'; end if;
  if nullif(btrim(coalesce(p_id_number,'')),'') is null then raise exception 'ID number is required'; end if;
  if nullif(btrim(coalesce(p_business_id_document_path,'')),'') is null then raise exception 'Business ID / identification document is required'; end if;
  if p_shop_latitude is null or p_shop_longitude is null or p_shop_latitude not between -90 and 90 or p_shop_longitude not between -180 and 180 then
    raise exception 'Pin the Cyber shop location before submitting';
  end if;

  select c.name into v_county from public.kenya_counties c where c.code=p_county_code and c.is_active;
  if v_county is null then raise exception 'Choose a valid county'; end if;
  select s.name into v_subcounty from public.kenya_subcounties s
  where s.code=p_sub_county_code and s.county_code=p_county_code and s.is_active;
  if v_subcounty is null then raise exception 'Choose a valid sub-county'; end if;

  select application_status into v_existing from public.cyber_provider_accounts where user_id=v_uid;
  if v_existing='approved' then raise exception 'Approved Cyber profiles must submit changes for Admin approval'; end if;
  if v_existing='suspended' then raise exception 'This Cyber account is suspended. Contact LEOGO Admin'; end if;

  insert into public.cyber_provider_accounts(
    user_id,business_name,owner_name,id_number,phone,county,sub_county,county_code,sub_county_code,
    town,location_details,shop_latitude,shop_longitude,shop_map_link,business_description,profile_picture_path,
    business_id_document_path,business_licence_path,registration_certificate_path,other_permit_paths,
    application_status,submitted_at,admin_notes,updated_at
  ) values (
    v_uid,btrim(p_business_name),btrim(p_owner_name),upper(btrim(p_id_number)),btrim(p_phone),
    v_county,v_subcounty,p_county_code,p_sub_county_code,btrim(p_town),btrim(p_location_details),
    p_shop_latitude,p_shop_longitude,nullif(btrim(coalesce(p_shop_map_link,'')),''),
    nullif(btrim(coalesce(p_business_description,'')),''),
    nullif(btrim(coalesce(p_profile_picture_path,'')),''),
    btrim(p_business_id_document_path),nullif(btrim(coalesce(p_business_licence_path,'')),''),
    nullif(btrim(coalesce(p_registration_certificate_path,'')),''),
    coalesce(p_other_permit_paths,'{}'::text[]),'submitted',now(),null,now()
  )
  on conflict(user_id) do update set
    business_name=excluded.business_name,owner_name=excluded.owner_name,id_number=excluded.id_number,phone=excluded.phone,
    county=excluded.county,sub_county=excluded.sub_county,county_code=excluded.county_code,sub_county_code=excluded.sub_county_code,
    town=excluded.town,location_details=excluded.location_details,shop_latitude=excluded.shop_latitude,shop_longitude=excluded.shop_longitude,
    shop_map_link=excluded.shop_map_link,business_description=excluded.business_description,
    profile_picture_path=coalesce(excluded.profile_picture_path,public.cyber_provider_accounts.profile_picture_path),
    business_id_document_path=excluded.business_id_document_path,business_licence_path=excluded.business_licence_path,
    registration_certificate_path=excluded.registration_certificate_path,other_permit_paths=excluded.other_permit_paths,
    application_status='submitted',submitted_at=now(),approved_at=null,approved_by=null,admin_notes=null,updated_at=now();

  perform private.notify_partner(
    v_uid,'cyber','cyber_application_submitted','Cyber application submitted',
    'Your Cyber Services application has been sent to LEOGO Admin for review.',
    'cyber_provider',v_uid,'cyber-overview',jsonb_build_object('status','submitted')
  );
  return jsonb_build_object('ok',true,'status','submitted');
end
$function$


CREATE OR REPLACE FUNCTION public.cyber_provider_submit_profile_change(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_county text; v_subcounty text; v_clean jsonb; v_id uuid; v_existing text;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.cyber_provider_accounts where user_id=v_uid and application_status='approved') then
    raise exception 'Approved Cyber account required';
  end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Profile details are required'; end if;
  select status into v_existing from public.partner_profile_change_requests where partner_type='cyber' and partner_id=v_uid;
  if v_existing='under_review' then raise exception 'Your Cyber profile changes are currently under Admin review'; end if;
  if char_length(btrim(coalesce(p_payload->>'business_name','')))<2 then raise exception 'Cyber business name is required'; end if;
  if char_length(btrim(coalesce(p_payload->>'owner_name','')))<2 then raise exception 'Owner name is required'; end if;
  if coalesce(p_payload->>'phone','') !~ '^[+]254[17][0-9]{8}$' then raise exception 'Enter a valid Kenyan phone number'; end if;
  if nullif(p_payload->>'shop_latitude','') is null or nullif(p_payload->>'shop_longitude','') is null then
    raise exception 'Pin the Cyber shop location';
  end if;

  select c.name into v_county from public.kenya_counties c where c.code=p_payload->>'county_code' and c.is_active;
  if v_county is null then raise exception 'Choose a valid county'; end if;
  select s.name into v_subcounty from public.kenya_subcounties s
  where s.code=p_payload->>'sub_county_code' and s.county_code=p_payload->>'county_code' and s.is_active;
  if v_subcounty is null then raise exception 'Choose a valid sub-county'; end if;

  v_clean=jsonb_build_object(
    'business_name',btrim(p_payload->>'business_name'),'owner_name',btrim(p_payload->>'owner_name'),
    'id_number',upper(btrim(p_payload->>'id_number')),'phone',btrim(p_payload->>'phone'),
    'county',v_county,'sub_county',v_subcounty,'county_code',p_payload->>'county_code','sub_county_code',p_payload->>'sub_county_code',
    'town',btrim(p_payload->>'town'),'location_details',btrim(p_payload->>'location_details'),
    'shop_latitude',(p_payload->>'shop_latitude')::numeric,'shop_longitude',(p_payload->>'shop_longitude')::numeric,
    'shop_map_link',nullif(btrim(coalesce(p_payload->>'shop_map_link','')),''),
    'business_description',nullif(btrim(coalesce(p_payload->>'business_description','')),''),
    'profile_picture_path',nullif(p_payload->>'profile_picture_path',''),
    'business_id_document_path',p_payload->>'business_id_document_path',
    'business_licence_path',nullif(p_payload->>'business_licence_path',''),
    'registration_certificate_path',nullif(p_payload->>'registration_certificate_path',''),
    'other_permit_paths',coalesce(p_payload->'other_permit_paths','[]'::jsonb)
  );

  insert into public.partner_profile_change_requests(partner_type,partner_id,payload,status,admin_notes,submitted_at,reviewed_at,reviewed_by,updated_at)
  values('cyber',v_uid,v_clean,'submitted',null,now(),null,null,now())
  on conflict(partner_type,partner_id) do update set
    payload=excluded.payload,status='submitted',admin_notes=null,submitted_at=now(),reviewed_at=null,reviewed_by=null,updated_at=now()
  returning id into v_id;

  perform private.notify_partner(
    v_uid,'cyber','profile_change_submitted','Cyber profile changes sent for approval',
    'Your current approved Cyber profile remains active until LEOGO Admin approves the changes.',
    'partner_profile_change',v_id,'cyber-profile',jsonb_build_object('status','submitted')
  );
  return jsonb_build_object('ok',true,'change_id',v_id,'status','submitted');
end
$function$


CREATE OR REPLACE FUNCTION public.cyber_provider_update_order_status(p_order_id uuid, p_status text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := (select auth.uid()); v_order public.cyber_orders%rowtype;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if p_status not in ('accepted','processing','ready_for_pickup','out_for_delivery','completed','rejected') then
    raise exception 'Unsupported Cyber order status';
  end if;
  select * into v_order from public.cyber_orders where id=p_order_id and provider_id=v_uid for update;
  if not found then raise exception 'Cyber order not found'; end if;
  if v_order.pricing_status='quote_requested' or v_order.pricing_status='quoted' then raise exception 'Complete the quotation step first'; end if;
  if v_order.payment_status='pending_verification' then raise exception 'Payment is still awaiting LEOGO Admin verification'; end if;
  if v_order.payment_status='rejected' then raise exception 'Payment was rejected'; end if;
  if p_status='out_for_delivery' and v_order.fulfilment_method<>'delivery' then raise exception 'This is a pickup order'; end if;
  if p_status='ready_for_pickup' and v_order.fulfilment_method<>'pickup' then raise exception 'This is a delivery order'; end if;

  update public.cyber_orders set
    order_status=p_status,
    accepted_at=case when p_status='accepted' then now() else accepted_at end,
    completed_at=case when p_status='completed' then now() else completed_at end,
    provider_quote_notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),provider_quote_notes),
    updated_at=now()
  where id=p_order_id;

  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(v_order.customer_id,'cyber_order','Cyber order updated',
    v_order.order_reference||' is now '||replace(p_status,'_',' ')||'.',
    'cyber_order',p_order_id,'cyber_status_'||p_order_id::text||'_'||p_status,'orders',
    jsonb_build_object('status',p_status))
  on conflict(event_key) do nothing;

  return jsonb_build_object('ok',true,'order_status',p_status);
end
$function$


CREATE OR REPLACE FUNCTION public.get_customer_payment_destination(p_function_code text)
 RETURNS TABLE(function_code text, display_name text, account_type text, business_name text, account_name text, till_number text, paybill_number text, account_number text, bank_name text, branch text, instructions text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if p_function_code not in (
    'wallet_sacco_deposits','savings_challenge','loan_repayment','marketplace_orders',
    'lipa_pole_pole','premium_payments','accommodation_payments','service_payments',
    'transport_payments','cyber_orders','other_revenue'
  ) then raise exception 'Unsupported payment function'; end if;

  return query
  select a.function_code,p.display_name,p.account_type,p.business_name,p.account_name,
         p.till_number,p.paybill_number,p.account_number,p.bank_name,p.branch,p.instructions
  from public.payment_account_assignments a
  join public.payment_accounts p on p.id=a.account_id
  where a.function_code=p_function_code and p.status='active'
  limit 1;
end
$function$


CREATE OR REPLACE FUNCTION public.public_cyber_marketplace_settings()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'cbd_delivery_fee_kes',cbd_delivery_fee_kes,
    'estate_delivery_fee_kes',estate_delivery_fee_kes,
    'outside_town_delivery_fee_kes',outside_town_delivery_fee_kes,
    'delivery_note',delivery_note
  )
  from public.cyber_marketplace_settings where id=1
$function$


CREATE OR REPLACE FUNCTION public.public_list_cyber_products(p_provider_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, provider_id uuid, provider_name text, product_name text, description text, price_kes numeric, quantity_available numeric, measurement_unit text, image_path text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id,p.provider_id,c.business_name,p.product_name,p.description,p.price_kes,p.quantity_available,p.measurement_unit,p.image_path
  from public.cyber_products p
  join public.cyber_provider_accounts c on c.user_id=p.provider_id
  where c.application_status='approved' and p.approval_status='approved'
    and p.availability_status='available' and p.quantity_available>0
    and (p_provider_id is null or p.provider_id=p_provider_id)
  order by c.business_name,p.product_name
$function$


CREATE OR REPLACE FUNCTION public.public_list_cyber_services(p_provider_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, provider_id uuid, provider_name text, service_name text, service_category text, description text, pricing_model text, price_kes numeric, unit_label text, requires_file_upload boolean, accepts_multiple_files boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select s.id,s.provider_id,c.business_name,s.service_name,s.service_category,s.description,s.pricing_model,
         s.price_kes,s.unit_label,s.requires_file_upload,s.accepts_multiple_files
  from public.cyber_services s
  join public.cyber_provider_accounts c on c.user_id=s.provider_id
  where c.application_status='approved' and s.approval_status='approved' and s.is_available
    and (p_provider_id is null or s.provider_id=p_provider_id)
  order by c.business_name,s.service_category,s.service_name
$function$


CREATE OR REPLACE FUNCTION public.public_list_cyber_shops()
 RETURNS TABLE(provider_id uuid, business_name text, town text, county text, location_details text, shop_latitude numeric, shop_longitude numeric, shop_map_link text, business_description text, profile_picture_path text, availability_status text, service_count bigint, product_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.user_id,c.business_name,c.town,c.county,c.location_details,c.shop_latitude,c.shop_longitude,
         c.shop_map_link,c.business_description,c.profile_picture_path,c.availability_status,
         (select count(*) from public.cyber_services s where s.provider_id=c.user_id and s.approval_status='approved' and s.is_available),
         (select count(*) from public.cyber_products p where p.provider_id=c.user_id and p.approval_status='approved' and p.availability_status='available' and p.quantity_available>0)
  from public.cyber_provider_accounts c
  where c.application_status='approved'
  order by c.business_name
$function$


-- Function permissions
grant execute on function public.cyber_provider_get_own_account() to authenticated;
grant execute on function public.cyber_provider_submit_application(text,text,text,text,text,text,text,text,numeric,numeric,text,text,text,text,text,text,text[]) to authenticated;
grant execute on function public.cyber_provider_submit_profile_change(jsonb) to authenticated;
grant execute on function public.cyber_provider_list_services() to authenticated;
grant execute on function public.cyber_provider_save_service(uuid,text,text,text,text,numeric,text,boolean,boolean,boolean) to authenticated;
grant execute on function public.cyber_provider_list_products() to authenticated;
grant execute on function public.cyber_provider_save_product(uuid,text,text,numeric,numeric,text,text,text) to authenticated;
grant execute on function public.cyber_provider_list_orders() to authenticated;
grant execute on function public.cyber_provider_quote_order(uuid,numeric,text) to authenticated;
grant execute on function public.cyber_provider_update_order_status(uuid,text,text) to authenticated;
grant execute on function public.public_list_cyber_shops() to anon,authenticated;
grant execute on function public.public_list_cyber_services(uuid) to anon,authenticated;
grant execute on function public.public_list_cyber_products(uuid) to anon,authenticated;
grant execute on function public.public_cyber_marketplace_settings() to anon,authenticated;
grant execute on function public.customer_create_cyber_order(text,uuid,numeric,text,text,text,text,text,text,numeric,numeric,text,jsonb) to authenticated;
grant execute on function public.customer_list_cyber_orders() to authenticated;
grant execute on function public.customer_decide_cyber_quote(uuid,text,text) to authenticated;
grant execute on function public.admin_list_cyber_providers() to authenticated;
grant execute on function public.admin_list_cyber_services() to authenticated;
grant execute on function public.admin_list_cyber_products() to authenticated;
grant execute on function public.admin_list_cyber_orders() to authenticated;
grant execute on function public.admin_list_cyber_profile_changes() to authenticated;
grant execute on function public.admin_review_cyber_provider(uuid,text,text) to authenticated;
grant execute on function public.admin_review_cyber_service(uuid,text,text) to authenticated;
grant execute on function public.admin_review_cyber_product(uuid,text,text) to authenticated;
grant execute on function public.admin_verify_cyber_order_payment(uuid,text,text) to authenticated;
grant execute on function public.admin_get_cyber_settings() to authenticated;
grant execute on function public.admin_update_cyber_settings(numeric,numeric,numeric,text) to authenticated;
grant execute on function public.admin_review_cyber_profile_change(uuid,text,text) to authenticated;
grant execute on function public.get_customer_payment_destination(text) to authenticated;
