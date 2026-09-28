-- LEOGO DIGITAL MARKET V2
-- Cyber partner notification/chat + service Flash Sale + standard delivery synchronization.
-- Generated from the verified live schema after the 29 Sep 2026 Cyber workflow update.

alter table public.cyber_services
  add column if not exists flash_sale_requested boolean not null default false,
  add column if not exists flash_sale_price_kes numeric,
  add column if not exists flash_sale_starts_at timestamptz,
  add column if not exists flash_sale_ends_at timestamptz,
  add column if not exists flash_sale_status text not null default 'none',
  add column if not exists flash_sale_admin_notes text;

alter table public.cyber_services drop constraint if exists cyber_services_flash_sale_status_check;
alter table public.cyber_services add constraint cyber_services_flash_sale_status_check
  check (flash_sale_status in ('none','requested','approved','rejected'));

alter table public.cyber_services drop constraint if exists cyber_services_flash_sale_price_check;
alter table public.cyber_services add constraint cyber_services_flash_sale_price_check
  check (
    flash_sale_price_kes is null
    or (flash_sale_price_kes >= 0 and price_kes is not null and flash_sale_price_kes < price_kes)
  );

alter table public.cyber_orders
  add column if not exists customer_chat_last_read_at timestamptz,
  add column if not exists provider_chat_last_read_at timestamptz;

create table if not exists public.cyber_order_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.cyber_orders(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer','provider')),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists cyber_order_messages_order_created_idx
  on public.cyber_order_messages(order_id,created_at);
create index if not exists cyber_order_messages_sender_idx
  on public.cyber_order_messages(sender_id);

alter table public.cyber_order_messages enable row level security;
revoke all on public.cyber_order_messages from anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_cyber_flash_sale_requests()
 RETURNS TABLE(service_id uuid, provider_id uuid, provider_name text, service_name text, normal_price_kes numeric, flash_sale_price_kes numeric, flash_sale_starts_at timestamp with time zone, flash_sale_ends_at timestamp with time zone, flash_sale_status text, flash_sale_admin_notes text, updated_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select s.id,s.provider_id,c.business_name,s.service_name,s.price_kes,s.flash_sale_price_kes,
         s.flash_sale_starts_at,s.flash_sale_ends_at,s.flash_sale_status,s.flash_sale_admin_notes,s.updated_at
  from public.cyber_services s
  join public.cyber_provider_accounts c on c.user_id=s.provider_id
  where private.is_leogo_admin('approvals.read')
    and s.flash_sale_requested=true
  order by
    case s.flash_sale_status when 'requested' then 0 when 'approved' then 1 else 2 end,
    s.updated_at desc
$function$;

CREATE OR REPLACE FUNCTION public.admin_review_cyber_service_flash_sale(p_service_id uuid, p_decision text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_service public.cyber_services%rowtype;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Admin approval permission required'; end if;
  if p_decision not in ('approve','reject') then raise exception 'Choose approve or reject'; end if;

  select * into v_service
  from public.cyber_services
  where id=p_service_id and flash_sale_requested=true
  for update;

  if not found then raise exception 'Flash Sale request not found'; end if;
  if p_decision='approve' and (v_service.approval_status<>'approved' or v_service.pricing_model='quote') then
    raise exception 'The Cyber service must be approved and have a fixed price first';
  end if;
  if p_decision='approve' and (
    v_service.flash_sale_price_kes is null
    or v_service.flash_sale_price_kes<=0
    or v_service.flash_sale_price_kes>=v_service.price_kes
    or v_service.flash_sale_ends_at<=now()
  ) then
    raise exception 'The Flash Sale request is no longer valid';
  end if;

  update public.cyber_services
  set flash_sale_status=case when p_decision='approve' then 'approved' else 'rejected' end,
      flash_sale_admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
      updated_at=now()
  where id=p_service_id;

  perform private.notify_partner(
    v_service.provider_id,'cyber',
    case when p_decision='approve' then 'cyber_flash_sale_approved' else 'cyber_flash_sale_rejected' end,
    case when p_decision='approve' then 'Flash Sale approved' else 'Flash Sale needs attention' end,
    v_service.service_name||case when p_decision='approve' then ' is approved for Flash Sale.' else ' Flash Sale request was not approved.' end||
      case when nullif(btrim(coalesce(p_notes,'')),'') is null then '' else ' Admin note: '||btrim(p_notes) end,
    'cyber_service',p_service_id,'cyber-flashsale',
    jsonb_build_object('flash_sale_status',case when p_decision='approve' then 'approved' else 'rejected' end)
  );

  return jsonb_build_object('ok',true,'service_id',p_service_id,'flash_sale_status',
    case when p_decision='approve' then 'approved' else 'rejected' end);
end
$function$;

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
    select s.provider_id,s.service_name,s.pricing_model,
      case
        when s.flash_sale_requested=true
         and s.flash_sale_status='approved'
         and s.flash_sale_price_kes is not null
         and s.flash_sale_starts_at<=now()
         and s.flash_sale_ends_at>now()
        then s.flash_sale_price_kes
        else s.price_kes
      end,
      s.requires_file_upload
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

    -- Keep Cyber delivery on the exact same standard rule used by normal marketplace orders.
    v_delivery:=case p_delivery_zone_code
      when 'cbd' then 50
      when 'estate' then 80
      else 200
    end;
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
$function$;

CREATE OR REPLACE FUNCTION public.customer_list_cyber_order_messages(p_order_id uuid)
 RETURNS TABLE(message_id uuid, sender_role text, body text, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select m.id,m.sender_role,m.body,m.created_at
  from public.cyber_order_messages m
  join public.cyber_orders o on o.id=m.order_id
  where m.order_id=p_order_id and o.customer_id=(select auth.uid())
  order by m.created_at
$function$;

CREATE OR REPLACE FUNCTION public.customer_mark_cyber_order_chat_read(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.cyber_orders
  set customer_chat_last_read_at=now()
  where id=p_order_id and customer_id=(select auth.uid());
  if not found then raise exception 'Cyber order not found'; end if;
end
$function$;

CREATE OR REPLACE FUNCTION public.customer_send_cyber_order_message(p_order_id uuid, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_order public.cyber_orders%rowtype;
  v_body text := btrim(coalesce(p_body,''));
  v_message_id uuid;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if char_length(v_body)<1 then raise exception 'Write a message first'; end if;
  if char_length(v_body)>2000 then raise exception 'Message must be 2000 characters or fewer'; end if;

  select * into v_order from public.cyber_orders
  where id=p_order_id and customer_id=v_uid;
  if not found then raise exception 'Cyber order not found'; end if;

  insert into public.cyber_order_messages(order_id,sender_id,sender_role,body)
  values(p_order_id,v_uid,'customer',v_body)
  returning id into v_message_id;

  update public.cyber_orders set customer_chat_last_read_at=now(),updated_at=updated_at where id=p_order_id;

  perform private.notify_partner(
    v_order.provider_id,'cyber','cyber_customer_message','New customer message',
    v_order.order_reference||' · '||left(v_body,180),
    'cyber_order_message',v_message_id,'cyber-chat',
    jsonb_build_object('order_id',p_order_id,'order_reference',v_order.order_reference)
  );

  return jsonb_build_object('ok',true,'message_id',v_message_id);
end
$function$;

CREATE OR REPLACE FUNCTION public.cyber_provider_list_chat_threads()
 RETURNS TABLE(order_id uuid, order_reference text, customer_name text, item_name text, order_status text, last_message_at timestamp with time zone, last_message_preview text, unread_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    o.id,
    o.order_reference,
    coalesce(cp.full_name,u.email::text,'Customer'),
    o.item_name,
    o.order_status,
    (select m.created_at from public.cyber_order_messages m where m.order_id=o.id order by m.created_at desc limit 1),
    (select left(m.body,160) from public.cyber_order_messages m where m.order_id=o.id order by m.created_at desc limit 1),
    (select count(*) from public.cyber_order_messages m
      where m.order_id=o.id and m.sender_role='customer'
        and (o.provider_chat_last_read_at is null or m.created_at>o.provider_chat_last_read_at))
  from public.cyber_orders o
  left join public.customer_profiles cp on cp.user_id=o.customer_id
  left join auth.users u on u.id=o.customer_id
  where o.provider_id=(select auth.uid())
  order by
    coalesce((select max(m.created_at) from public.cyber_order_messages m where m.order_id=o.id),o.created_at) desc
$function$;

CREATE OR REPLACE FUNCTION public.cyber_provider_list_order_messages(p_order_id uuid)
 RETURNS TABLE(message_id uuid, sender_role text, body text, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select m.id,m.sender_role,m.body,m.created_at
  from public.cyber_order_messages m
  join public.cyber_orders o on o.id=m.order_id
  where m.order_id=p_order_id and o.provider_id=(select auth.uid())
  order by m.created_at
$function$;

CREATE OR REPLACE FUNCTION public.cyber_provider_list_service_flash_sales()
 RETURNS TABLE(service_id uuid, flash_sale_requested boolean, flash_sale_price_kes numeric, flash_sale_starts_at timestamp with time zone, flash_sale_ends_at timestamp with time zone, flash_sale_status text, flash_sale_admin_notes text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select s.id,s.flash_sale_requested,s.flash_sale_price_kes,s.flash_sale_starts_at,
         s.flash_sale_ends_at,s.flash_sale_status,s.flash_sale_admin_notes
  from public.cyber_services s
  where s.provider_id=(select auth.uid())
  order by s.updated_at desc
$function$;

CREATE OR REPLACE FUNCTION public.cyber_provider_mark_order_chat_read(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.cyber_orders
  set provider_chat_last_read_at=now()
  where id=p_order_id and provider_id=(select auth.uid());
  if not found then raise exception 'Cyber order not found'; end if;
end
$function$;

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
$function$;

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
      approval_status='pending',admin_notes=null,submitted_at=now(),approved_at=null,approved_by=null,
      flash_sale_requested=false,flash_sale_price_kes=null,flash_sale_starts_at=null,flash_sale_ends_at=null,
      flash_sale_status='none',flash_sale_admin_notes=null,
      updated_at=now()
    where id=p_service_id and provider_id=v_uid
    returning id into v_id;
    if v_id is null then raise exception 'Cyber service not found'; end if;
  end if;

  perform private.notify_partner(v_uid,'cyber','cyber_service_submitted','Cyber service sent for approval',
    btrim(p_service_name)||' has been sent to LEOGO Admin for approval.',
    'cyber_service',v_id,'cyber-services',jsonb_build_object('approval_status','pending'));
  return jsonb_build_object('ok',true,'service_id',v_id,'approval_status','pending');
end
$function$;

CREATE OR REPLACE FUNCTION public.cyber_provider_send_order_message(p_order_id uuid, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_order public.cyber_orders%rowtype;
  v_body text := btrim(coalesce(p_body,''));
  v_message_id uuid;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if char_length(v_body)<1 then raise exception 'Write a message first'; end if;
  if char_length(v_body)>2000 then raise exception 'Message must be 2000 characters or fewer'; end if;

  select * into v_order from public.cyber_orders
  where id=p_order_id and provider_id=v_uid;
  if not found then raise exception 'Cyber order not found'; end if;

  insert into public.cyber_order_messages(order_id,sender_id,sender_role,body)
  values(p_order_id,v_uid,'provider',v_body)
  returning id into v_message_id;

  update public.cyber_orders set provider_chat_last_read_at=now(),updated_at=updated_at where id=p_order_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values (
    v_order.customer_id,'cyber_chat','New Cyber message',
    v_order.order_reference||' · '||left(v_body,180),
    'cyber_order_message',v_message_id,'cyber_chat_'||v_message_id::text,'orders',
    jsonb_build_object('order_id',p_order_id,'order_reference',v_order.order_reference)
  ) on conflict(event_key) do nothing;

  return jsonb_build_object('ok',true,'message_id',v_message_id);
end
$function$;

CREATE OR REPLACE FUNCTION public.public_list_cyber_service_flash_sales(p_provider_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(service_id uuid, flash_sale_price_kes numeric, flash_sale_starts_at timestamp with time zone, flash_sale_ends_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select s.id,s.flash_sale_price_kes,s.flash_sale_starts_at,s.flash_sale_ends_at
  from public.cyber_services s
  join public.cyber_provider_accounts c on c.user_id=s.provider_id
  where c.application_status='approved'
    and s.approval_status='approved'
    and s.is_available=true
    and s.pricing_model<>'quote'
    and s.flash_sale_requested=true
    and s.flash_sale_status='approved'
    and s.flash_sale_price_kes is not null
    and s.flash_sale_starts_at<=now()
    and s.flash_sale_ends_at>now()
    and (p_provider_id is null or s.provider_id=p_provider_id)
  order by s.flash_sale_ends_at
$function$;

revoke execute on function public.cyber_provider_request_service_flash_sale(uuid,numeric,timestamptz,timestamptz) from public,anon;
revoke execute on function public.admin_list_cyber_flash_sale_requests() from public,anon;
revoke execute on function public.admin_review_cyber_service_flash_sale(uuid,text,text) from public,anon;
revoke execute on function public.public_list_cyber_service_flash_sales(uuid) from public;
revoke execute on function public.cyber_provider_list_service_flash_sales() from public,anon;
revoke execute on function public.cyber_provider_list_chat_threads() from public,anon;
revoke execute on function public.cyber_provider_list_order_messages(uuid) from public,anon;
revoke execute on function public.cyber_provider_mark_order_chat_read(uuid) from public,anon;
revoke execute on function public.cyber_provider_send_order_message(uuid,text) from public,anon;
revoke execute on function public.customer_list_cyber_order_messages(uuid) from public,anon;
revoke execute on function public.customer_mark_cyber_order_chat_read(uuid) from public,anon;
revoke execute on function public.customer_send_cyber_order_message(uuid,text) from public,anon;

grant execute on function public.cyber_provider_request_service_flash_sale(uuid,numeric,timestamptz,timestamptz) to authenticated;
grant execute on function public.admin_list_cyber_flash_sale_requests() to authenticated;
grant execute on function public.admin_review_cyber_service_flash_sale(uuid,text,text) to authenticated;
grant execute on function public.public_list_cyber_service_flash_sales(uuid) to anon,authenticated;
grant execute on function public.cyber_provider_list_service_flash_sales() to authenticated;
grant execute on function public.cyber_provider_list_chat_threads() to authenticated;
grant execute on function public.cyber_provider_list_order_messages(uuid) to authenticated;
grant execute on function public.cyber_provider_mark_order_chat_read(uuid) to authenticated;
grant execute on function public.cyber_provider_send_order_message(uuid,text) to authenticated;
grant execute on function public.customer_list_cyber_order_messages(uuid) to authenticated;
grant execute on function public.customer_mark_cyber_order_chat_read(uuid) to authenticated;
grant execute on function public.customer_send_cyber_order_message(uuid,text) to authenticated;
