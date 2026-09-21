-- LEOGO Staff Management and staff-role permission separation.
-- Generated from the applied production definitions on 2026-09-21.

alter table public.admin_users
  add column if not exists phone text,
  add column if not exists department text,
  add column if not exists job_title text;

alter table public.leogo_staff
  add column if not exists id_number text,
  add column if not exists license_number text,
  add column if not exists availability_status text not null default 'available',
  add column if not exists notes text;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conname='leogo_staff_availability_status_check'
      and conrelid='public.leogo_staff'::regclass
  ) then
    alter table public.leogo_staff
      add constraint leogo_staff_availability_status_check
      check(availability_status in ('available','off_duty','on_delivery'));
  end if;
end $$;

CREATE OR REPLACE FUNCTION private.is_leogo_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(
    select 1
    from public.admin_users a
    where a.user_id=(select auth.uid())
      and a.status='active'
      and a.role='super_admin'
  );
$function$

CREATE OR REPLACE FUNCTION public.admin_assign_rider_to_order(p_order_id uuid, p_rider_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_order public.marketplace_orders%rowtype; v_rider public.leogo_staff%rowtype; v_job uuid;
begin
  if not private.is_leogo_admin('delivery.manage') and not private.is_leogo_admin('orders.manage') then
    raise exception 'Delivery management permission required';
  end if;

  select * into v_order from public.marketplace_orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.order_status in ('cancelled','delivered') then raise exception 'This order cannot be assigned for delivery'; end if;

  select * into v_rider from public.leogo_staff
  where user_id=p_rider_id and staff_role='rider' and status='active' and availability_status<>'off_duty';
  if not found then raise exception 'Choose an active available LEOGO rider'; end if;

  insert into public.marketplace_delivery_jobs(order_id,rider_id,status,assigned_at,assigned_by,updated_at)
  values(p_order_id,p_rider_id,'assigned',now(),(select auth.uid()),now())
  on conflict(order_id) do update
  set rider_id=excluded.rider_id,status='assigned',assigned_at=now(),assigned_by=(select auth.uid()),updated_at=now()
  returning id into v_job;

  insert into public.partner_notifications(user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata)
  values(p_rider_id,'transport','delivery_assigned','Delivery assigned',
    'You have been assigned order '||v_order.order_reference||'. Open Rider Jobs to view pickup and customer delivery details.',
    'marketplace_delivery_job',v_job,'rider_jobs',jsonb_build_object('order_id',p_order_id,'order_reference',v_order.order_reference));

  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(v_order.customer_id,'delivery','Rider assigned','A LEOGO rider has been assigned to order '||v_order.order_reference||'.',
    'marketplace_delivery_job',v_job,'delivery_assigned','orders',jsonb_build_object('rider_name',v_rider.display_name));

  perform private.notify_partner(
    so.seller_id,'seller','delivery_assigned','Rider assigned',
    'LEOGO rider '||v_rider.display_name||' has been assigned to order '||v_order.order_reference||'.',
    'marketplace_delivery_job',v_job,'orders',jsonb_build_object('rider_name',v_rider.display_name)
  ) from public.marketplace_seller_orders so where so.order_id=p_order_id;

  perform private.write_admin_audit(
    'delivery.rider.assigned','marketplace_delivery_job',v_job::text,null,
    jsonb_build_object('order_id',p_order_id,'rider_id',p_rider_id,'rider_name',v_rider.display_name)
  );

  return jsonb_build_object('ok',true,'delivery_job_id',v_job,'rider_name',v_rider.display_name);
end $function$

CREATE OR REPLACE FUNCTION public.admin_list_seller_settlement_accounts()
 RETURNS TABLE(id uuid, seller_id uuid, seller_name text, seller_email text, account_type text, account_name text, phone_number text, till_number text, paybill_number text, account_number text, bank_name text, bank_branch text, status text, is_primary boolean, replaces_account_id uuid, submitted_at timestamp with time zone, reviewed_at timestamp with time zone, reviewed_by uuid, admin_notes text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_leogo_admin('settlements.read') then raise exception 'Settlement access required'; end if;
  return query
  select a.id,a.seller_id,s.business_name,u.email::text,a.account_type,a.account_name,
         a.phone_number,a.till_number,a.paybill_number,a.account_number,a.bank_name,a.bank_branch,
         a.status,a.is_primary,a.replaces_account_id,a.submitted_at,a.reviewed_at,a.reviewed_by,a.admin_notes
  from public.seller_settlement_accounts a
  join public.seller_accounts s on s.user_id=a.seller_id
  left join auth.users u on u.id=a.seller_id
  order by case when a.status='pending_review' then 0 else 1 end,a.submitted_at desc;
end $function$

CREATE OR REPLACE FUNCTION public.admin_list_seller_settlement_requests()
 RETURNS TABLE(id uuid, seller_id uuid, seller_name text, seller_email text, settlement_account_id uuid, requested_amount_kes numeric, seller_note text, status text, admin_notes text, submitted_at timestamp with time zone, reviewed_at timestamp with time zone, settlement_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_leogo_admin('settlements.read') then raise exception 'Settlement access required'; end if;
  return query
  select r.id,r.seller_id,s.business_name,u.email::text,r.settlement_account_id,
         r.requested_amount_kes,r.seller_note,r.status,r.admin_notes,r.submitted_at,r.reviewed_at,r.settlement_id
  from public.seller_settlement_requests r
  join public.seller_accounts s on s.user_id=r.seller_id
  left join auth.users u on u.id=r.seller_id
  order by case when r.status in ('pending','under_review') then 0 else 1 end,r.submitted_at desc;
end $function$

CREATE OR REPLACE FUNCTION public.admin_list_seller_settlements()
 RETURNS TABLE(id uuid, seller_id uuid, seller_name text, seller_email text, settlement_account_id uuid, amount_kes numeric, settlement_reference text, status text, paid_at timestamp with time zone, processed_by uuid, notes text, destination_snapshot jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_leogo_admin('settlements.read') then raise exception 'Settlement access required'; end if;
  return query
  select st.id,st.seller_id,s.business_name,u.email::text,st.settlement_account_id,
         st.amount_kes,st.settlement_reference,st.status,st.paid_at,st.processed_by,st.notes,st.destination_snapshot
  from public.seller_settlements st
  join public.seller_accounts s on s.user_id=st.seller_id
  left join auth.users u on u.id=st.seller_id
  order by st.paid_at desc;
end $function$

CREATE OR REPLACE FUNCTION public.admin_list_staff_directory()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
begin
  if not private.is_leogo_super_admin() then
    raise exception 'Super Admin access required';
  end if;

  select coalesce(jsonb_agg(row_data order by
    case row_data->>'role_code'
      when 'super_admin' then 0
      when 'operations' then 1
      when 'reviewer' then 2
      when 'finance' then 3
      when 'support' then 4
      when 'read_only' then 5
      when 'rider' then 6
      else 7 end,
    lower(row_data->>'display_name')
  ),'[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'account_kind','admin_staff',
      'user_id',a.user_id,
      'display_name',a.display_name,
      'email',u.email,
      'phone',a.phone,
      'role_code',a.role,
      'role_label',case a.role
        when 'super_admin' then 'Super Admin / Owner'
        when 'operations' then 'Operations Officer'
        when 'reviewer' then 'Marketplace & Approval Officer'
        when 'finance' then 'Finance & Settlement Officer'
        when 'support' then 'Customer Support Officer'
        when 'read_only' then 'Read-only Staff'
        when 'admin' then 'Legacy Full Admin'
        else initcap(replace(a.role,'_',' '))
      end,
      'department',a.department,
      'job_title',a.job_title,
      'status',a.status,
      'permissions',to_jsonb(a.permissions),
      'vehicle_type',null,
      'vehicle_registration',null,
      'id_number',null,
      'license_number',null,
      'availability_status',null,
      'created_at',a.created_at,
      'created_by',a.created_by,
      'created_by_name',creator.email,
      'last_sign_in_at',u.last_sign_in_at
    ) as row_data
    from public.admin_users a
    join auth.users u on u.id=a.user_id
    left join auth.users creator on creator.id=a.created_by

    union all

    select jsonb_build_object(
      'account_kind','rider',
      'user_id',s.user_id,
      'display_name',s.display_name,
      'email',u.email,
      'phone',s.phone,
      'role_code','rider',
      'role_label','Rider / Delivery Staff',
      'department','Delivery',
      'job_title','LEOGO Rider',
      'status',s.status,
      'permissions','[]'::jsonb,
      'vehicle_type',s.vehicle_type,
      'vehicle_registration',s.vehicle_registration,
      'id_number',s.id_number,
      'license_number',s.license_number,
      'availability_status',s.availability_status,
      'created_at',s.created_at,
      'created_by',s.created_by,
      'created_by_name',creator.email,
      'last_sign_in_at',u.last_sign_in_at
    ) as row_data
    from public.leogo_staff s
    join auth.users u on u.id=s.user_id
    left join auth.users creator on creator.id=s.created_by
    where s.staff_role='rider'
  ) x;

  return v_result;
end $function$

CREATE OR REPLACE FUNCTION public.admin_pay_seller_settlement_request(p_request_id uuid, p_reference text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_req public.seller_settlement_requests%rowtype; v_settlement_id uuid;
begin
  if not private.is_leogo_admin('settlements.manage') then raise exception 'Settlement management permission required'; end if;
  if char_length(btrim(coalesce(p_reference,'')))<3 then raise exception 'Payment reference is required'; end if;

  select * into v_req from public.seller_settlement_requests where id=p_request_id for update;
  if not found then raise exception 'Settlement request not found'; end if;
  if v_req.status not in ('pending','under_review') then raise exception 'Settlement request is already closed'; end if;

  v_settlement_id:=public.admin_record_seller_settlement(
    v_req.seller_id,v_req.settlement_account_id,v_req.requested_amount_kes,btrim(p_reference),p_notes
  );

  update public.seller_settlement_requests
  set status='paid',admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
      reviewed_at=now(),reviewed_by=(select auth.uid()),settlement_id=v_settlement_id,updated_at=now()
  where id=p_request_id;

  perform private.notify_partner(
    v_req.seller_id,'seller','settlement_request_paid','Settlement request paid',
    'Your requested settlement has been processed by LEOGO.',
    'seller_settlement_request',p_request_id,'settlements',
    jsonb_build_object('settlement_id',v_settlement_id,'reference',btrim(p_reference))
  );
  return v_settlement_id;
end $function$

CREATE OR REPLACE FUNCTION public.admin_record_seller_settlement(p_seller_id uuid, p_account_id uuid, p_amount_kes numeric, p_reference text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_account public.seller_settlement_accounts%rowtype; v_id uuid;
begin
  if not private.is_leogo_admin('settlements.manage') then raise exception 'Settlement management permission required'; end if;
  if coalesce(p_amount_kes,0)<=0 then raise exception 'Settlement amount must be greater than zero'; end if;
  if char_length(btrim(coalesce(p_reference,'')))<3 then raise exception 'Payment reference is required'; end if;

  select * into v_account
  from public.seller_settlement_accounts
  where id=p_account_id and seller_id=p_seller_id and status='approved';
  if not found then raise exception 'Choose an approved settlement account for this Seller'; end if;

  insert into public.seller_settlements(
    seller_id,settlement_account_id,amount_kes,settlement_reference,status,paid_at,processed_by,notes,destination_snapshot
  ) values(
    p_seller_id,p_account_id,p_amount_kes,btrim(p_reference),'paid',now(),(select auth.uid()),
    nullif(btrim(coalesce(p_notes,'')),''),
    jsonb_build_object(
      'account_type',v_account.account_type,'account_name',v_account.account_name,'phone_number',v_account.phone_number,
      'till_number',v_account.till_number,'paybill_number',v_account.paybill_number,'account_number',v_account.account_number,
      'bank_name',v_account.bank_name,'bank_branch',v_account.bank_branch
    )
  ) returning id into v_id;

  perform private.write_admin_audit(
    'seller.settlement.paid','seller_settlement',v_id::text,null,
    jsonb_build_object('seller_id',p_seller_id,'amount_kes',p_amount_kes,'reference',btrim(p_reference)),
    jsonb_build_object('settlement_account_id',p_account_id)
  );

  perform private.notify_partner(
    p_seller_id,'seller','settlement_paid','Seller settlement completed',
    'LEOGO recorded a Seller settlement of KSh '||to_char(p_amount_kes,'FM999,999,999,990.00')||' with reference '||btrim(p_reference)||'.',
    'seller_settlement',v_id,'settlements',jsonb_build_object('amount_kes',p_amount_kes,'reference',btrim(p_reference))
  );
  return v_id;
end $function$

CREATE OR REPLACE FUNCTION public.admin_review_seller_settlement_account(p_account_id uuid, p_decision text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_account public.seller_settlement_accounts%rowtype; v_before jsonb; v_after jsonb;
begin
  if not private.is_leogo_admin('settlements.manage') then raise exception 'Settlement management permission required'; end if;
  if p_decision not in ('approve','reject','disable') then raise exception 'Unsupported decision'; end if;
  if p_decision='reject' and char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'A clear rejection reason is required'; end if;

  select * into v_account from public.seller_settlement_accounts where id=p_account_id for update;
  if not found then raise exception 'Settlement account not found'; end if;
  v_before:=to_jsonb(v_account);

  if p_decision='approve' then
    if v_account.status<>'pending_review' then raise exception 'Only pending accounts can be approved'; end if;
    if v_account.is_primary then
      update public.seller_settlement_accounts
      set is_primary=false,updated_at=now()
      where seller_id=v_account.seller_id and id<>v_account.id and status='approved' and is_primary=true;
    end if;
    update public.seller_settlement_accounts
    set status='approved',reviewed_at=now(),reviewed_by=(select auth.uid()),
        admin_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now()
    where id=p_account_id;
    if v_account.replaces_account_id is not null then
      update public.seller_settlement_accounts
      set status='superseded',is_primary=false,updated_at=now()
      where id=v_account.replaces_account_id and seller_id=v_account.seller_id and status='approved';
    end if;
  elsif p_decision='reject' then
    if v_account.status<>'pending_review' then raise exception 'Only pending accounts can be rejected'; end if;
    update public.seller_settlement_accounts
    set status='rejected',reviewed_at=now(),reviewed_by=(select auth.uid()),admin_notes=btrim(p_notes),updated_at=now()
    where id=p_account_id;
  else
    if v_account.status<>'approved' then raise exception 'Only approved accounts can be disabled'; end if;
    update public.seller_settlement_accounts
    set status='disabled',is_primary=false,reviewed_at=now(),reviewed_by=(select auth.uid()),
        admin_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now()
    where id=p_account_id;
  end if;

  select to_jsonb(a) into v_after from public.seller_settlement_accounts a where a.id=p_account_id;
  perform private.write_admin_audit('seller.settlement_account.'||p_decision,'seller_settlement_account',p_account_id::text,
    v_before,v_after,jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''))
  );
  return jsonb_build_object('ok',true,'account_id',p_account_id,'decision',p_decision);
end $function$

CREATE OR REPLACE FUNCTION public.admin_review_seller_settlement_request(p_request_id uuid, p_decision text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_req public.seller_settlement_requests%rowtype;
begin
  if not private.is_leogo_admin('settlements.manage') then raise exception 'Settlement management permission required'; end if;
  if p_decision not in ('under_review','reject') then raise exception 'Unsupported decision'; end if;
  if p_decision='reject' and char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'A clear rejection reason is required'; end if;
  select * into v_req from public.seller_settlement_requests where id=p_request_id for update;
  if not found then raise exception 'Settlement request not found'; end if;
  if v_req.status not in ('pending','under_review') then raise exception 'Settlement request is already closed'; end if;

  update public.seller_settlement_requests
  set status=case when p_decision='reject' then 'rejected' else 'under_review' end,
      admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
      reviewed_at=now(),reviewed_by=(select auth.uid()),updated_at=now()
  where id=p_request_id;

  perform private.notify_partner(
    v_req.seller_id,'seller',
    case when p_decision='reject' then 'settlement_request_rejected' else 'settlement_request_under_review' end,
    case when p_decision='reject' then 'Settlement request rejected' else 'Settlement request under review' end,
    case when p_decision='reject' then 'LEOGO Admin rejected your settlement request. Open Settlements to review the reason.' else 'LEOGO Admin is reviewing your settlement request.' end,
    'seller_settlement_request',p_request_id,'settlements',
    jsonb_build_object('status',case when p_decision='reject' then 'rejected' else 'under_review' end,'admin_notes',p_notes)
  );

  perform private.write_admin_audit('seller.settlement_request.'||p_decision,'seller_settlement_request',p_request_id::text,
    to_jsonb(v_req),null,jsonb_build_object('notes',p_notes)
  );
  return jsonb_build_object('ok',true,'request_id',p_request_id,'decision',p_decision);
end $function$

CREATE OR REPLACE FUNCTION public.admin_staff_role_presets()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_leogo_super_admin() then
    raise exception 'Super Admin access required';
  end if;

  return jsonb_build_array(
    jsonb_build_object(
      'code','operations','label','Operations Officer','department','Operations',
      'description','Daily order, customer, Seller fulfilment and delivery operations.',
      'permissions',jsonb_build_array(
        'dashboard.read','orders.read','orders.manage','customers.read','delivery.manage','sellers.read','products.read'
      )
    ),
    jsonb_build_object(
      'code','reviewer','label','Marketplace & Approval Officer','department','Marketplace & Approvals',
      'description','Seller applications, Seller products, personal listings and marketplace approvals.',
      'permissions',jsonb_build_array(
        'dashboard.read','approvals.read','approvals.manage','sellers.read','products.read','products.manage','customers.read'
      )
    ),
    jsonb_build_object(
      'code','finance','label','Finance & Settlement Officer','department','Finance',
      'description','Order payment verification, Seller settlement review/payment and financial reporting.',
      'permissions',jsonb_build_array(
        'dashboard.read','orders.read','orders.payment_verify','settlements.read','settlements.manage','sellers.read','reports.export'
      )
    ),
    jsonb_build_object(
      'code','support','label','Customer Support Officer','department','Customer Support',
      'description','Customer support, order tracking and limited Seller/product visibility.',
      'permissions',jsonb_build_array(
        'dashboard.read','orders.read','customers.read','sellers.read','products.read'
      )
    ),
    jsonb_build_object(
      'code','read_only','label','Read-only Staff','department','Administration',
      'description','View selected operational records without sensitive update permissions.',
      'permissions',jsonb_build_array(
        'dashboard.read','orders.read','customers.read','sellers.read','products.read','approvals.read'
      )
    )
  );
end $function$

CREATE OR REPLACE FUNCTION public.admin_update_staff_access(p_user_id uuid, p_account_kind text, p_display_name text, p_phone text DEFAULT NULL::text, p_department text DEFAULT NULL::text, p_job_title text DEFAULT NULL::text, p_role_code text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_permissions text[] DEFAULT NULL::text[], p_vehicle_type text DEFAULT NULL::text, p_vehicle_registration text DEFAULT NULL::text, p_id_number text DEFAULT NULL::text, p_license_number text DEFAULT NULL::text, p_availability_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_allowed_permissions constant text[] := array[
    'dashboard.read','approvals.read','approvals.manage','customers.read',
    'orders.read','orders.manage','orders.payment_verify','delivery.manage',
    'sellers.read','settlements.read','settlements.manage',
    'products.read','products.manage','payments.manage','premium.read',
    'premium.manage','reports.export','fees.manage','settings.manage'
  ];
  v_permission text;
begin
  if not private.is_leogo_super_admin() then raise exception 'Super Admin access required'; end if;
  if p_user_id=(select auth.uid()) then raise exception 'Use a separate owner-security workflow to change your own Super Admin access'; end if;
  if char_length(btrim(coalesce(p_display_name,'')))<2 then raise exception 'Staff display name is required'; end if;

  if p_account_kind='admin_staff' then
    if p_role_code not in ('operations','reviewer','finance','support','read_only') then raise exception 'Choose a supported Admin staff role'; end if;
    if p_status not in ('active','suspended') then raise exception 'Unsupported Admin staff status'; end if;

    foreach v_permission in array coalesce(p_permissions,'{}'::text[])
    loop
      if not (v_permission=any(v_allowed_permissions)) then raise exception 'Unsupported permission: %',v_permission; end if;
    end loop;

    select to_jsonb(a) into v_before from public.admin_users a where a.user_id=p_user_id for update;
    if v_before is null then raise exception 'Admin staff account not found'; end if;
    if v_before->>'role'='super_admin' then raise exception 'Super Admin accounts are protected from this editor'; end if;

    update public.admin_users
    set display_name=btrim(p_display_name),
        phone=nullif(btrim(coalesce(p_phone,'')),''),
        department=nullif(btrim(coalesce(p_department,'')),''),
        job_title=nullif(btrim(coalesce(p_job_title,'')),''),
        role=p_role_code,status=p_status,permissions=coalesce(p_permissions,'{}'::text[]),updated_at=now()
    where user_id=p_user_id;
    select to_jsonb(a) into v_after from public.admin_users a where a.user_id=p_user_id;

  elsif p_account_kind='rider' then
    if p_status not in ('active','inactive','suspended') then raise exception 'Unsupported Rider status'; end if;
    if coalesce(p_availability_status,'available') not in ('available','off_duty','on_delivery') then raise exception 'Unsupported Rider availability'; end if;

    select to_jsonb(s) into v_before from public.leogo_staff s where s.user_id=p_user_id and s.staff_role='rider' for update;
    if v_before is null then raise exception 'Rider account not found'; end if;

    update public.leogo_staff
    set display_name=btrim(p_display_name),phone=nullif(btrim(coalesce(p_phone,'')),''),
        status=p_status,vehicle_type=nullif(btrim(coalesce(p_vehicle_type,'')),''),
        vehicle_registration=nullif(upper(btrim(coalesce(p_vehicle_registration,''))),''),
        id_number=nullif(btrim(coalesce(p_id_number,'')),''),
        license_number=nullif(upper(btrim(coalesce(p_license_number,''))),''),
        availability_status=coalesce(p_availability_status,'available'),updated_at=now()
    where user_id=p_user_id and staff_role='rider';
    select to_jsonb(s) into v_after from public.leogo_staff s where s.user_id=p_user_id;
  else
    raise exception 'Unsupported staff account type';
  end if;

  perform private.write_admin_audit(
    'staff.access.updated',p_account_kind,p_user_id::text,v_before,v_after,
    jsonb_build_object('role_code',p_role_code,'status',p_status)
  );
  return jsonb_build_object('ok',true,'user_id',p_user_id,'account_kind',p_account_kind);
end $function$

CREATE OR REPLACE FUNCTION public.admin_verify_marketplace_order_payment(p_order_id uuid, p_paid boolean, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_order public.marketplace_orders%rowtype;
begin
  if not private.is_leogo_admin('orders.payment_verify') then raise exception 'Payment verification permission required'; end if;
  select * into v_order from public.marketplace_orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  update public.marketplace_orders
  set payment_status=case when p_paid then 'verified_paid' else 'rejected' end,
      payment_verified_at=now(),payment_verified_by=(select auth.uid()),updated_at=now()
  where id=p_order_id;

  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(v_order.customer_id,'payment',
    case when p_paid then 'Order payment verified' else 'Order payment rejected' end,
    'Payment for order '||v_order.order_reference||case when p_paid then ' has been verified.' else ' could not be verified.' end,
    'marketplace_order',p_order_id,'order_payment_'||case when p_paid then 'verified' else 'rejected' end,
    'orders',jsonb_build_object('notes',p_notes));

  perform private.notify_partner(
    so.seller_id,'seller','order_payment_'||case when p_paid then 'verified' else 'rejected' end,
    case when p_paid then 'Order payment verified' else 'Order payment rejected' end,
    'Payment status changed for order '||v_order.order_reference||'.',
    'marketplace_order',p_order_id,'orders',
    jsonb_build_object('payment_status',case when p_paid then 'verified_paid' else 'rejected' end)
  ) from public.marketplace_seller_orders so where so.order_id=p_order_id;

  perform private.write_admin_audit(
    'order.payment.'||case when p_paid then 'verified' else 'rejected' end,
    'marketplace_order',p_order_id::text,to_jsonb(v_order),null,jsonb_build_object('notes',p_notes)
  );
  return jsonb_build_object('ok',true);
end $function$

revoke execute on function public.admin_staff_role_presets() from public,anon;
revoke execute on function public.admin_list_staff_directory() from public,anon;
revoke execute on function public.admin_update_staff_access(uuid,text,text,text,text,text,text,text,text[],text,text,text,text,text) from public,anon;

grant execute on function public.admin_staff_role_presets() to authenticated;
grant execute on function public.admin_list_staff_directory() to authenticated;
grant execute on function public.admin_update_staff_access(uuid,text,text,text,text,text,text,text,text[],text,text,text,text,text) to authenticated;
