-- LEOGO Staff Management V2
-- Keep the Staff Management permission checklist aligned with every Admin
-- responsibility currently enforced by the live backend.
--
-- Owner-only responsibilities remain protected:
-- - Staff Management / staff private documents
-- - Super Admin account security
-- - Full Audit Log

create or replace function private.normalize_admin_staff_permissions(p_permissions text[])
returns text[]
language plpgsql
immutable
set search_path=''
as $function$
declare
  v_permissions text[]:=coalesce(p_permissions,'{}'::text[]);
begin
  -- Manage/write permissions always carry the minimum read permission needed
  -- to open the module safely.
  if 'approvals.manage'=any(v_permissions) and not 'approvals.read'=any(v_permissions) then
    v_permissions:=array_append(v_permissions,'approvals.read');
  end if;
  if (
    'orders.write'=any(v_permissions)
    or 'orders.manage'=any(v_permissions)
    or 'orders.payment_verify'=any(v_permissions)
  ) and not 'orders.read'=any(v_permissions) then
    v_permissions:=array_append(v_permissions,'orders.read');
  end if;
  if 'settlements.manage'=any(v_permissions) and not 'settlements.read'=any(v_permissions) then
    v_permissions:=array_append(v_permissions,'settlements.read');
  end if;
  if 'products.manage'=any(v_permissions) and not 'products.read'=any(v_permissions) then
    v_permissions:=array_append(v_permissions,'products.read');
  end if;
  if 'premium.manage'=any(v_permissions) and not 'premium.read'=any(v_permissions) then
    v_permissions:=array_append(v_permissions,'premium.read');
  end if;
  if 'settings.manage'=any(v_permissions) and not 'settings.read'=any(v_permissions) then
    v_permissions:=array_append(v_permissions,'settings.read');
  end if;

  return array(
    select distinct permission
    from unnest(v_permissions) permission
    order by permission
  );
end
$function$;

revoke execute on function private.normalize_admin_staff_permissions(text[])
  from public,anon,authenticated;

create or replace function public.admin_staff_role_presets()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not private.is_leogo_super_admin() then
    raise exception 'Super Admin access required';
  end if;

  return jsonb_build_array(
    jsonb_build_object(
      'code','operations',
      'label','Operations Officer',
      'department','Operations',
      'description','Daily marketplace orders, Assisted Shopping, Aftersales, Group Orders, Rider, Pickup Station and delivery operations.',
      'permissions',to_jsonb(private.normalize_admin_staff_permissions(array[
        'dashboard.read',
        'orders.read',
        'orders.write',
        'orders.manage',
        'customers.read',
        'delivery.manage',
        'sellers.read',
        'products.read'
      ]::text[]))
    ),
    jsonb_build_object(
      'code','reviewer',
      'label','Marketplace & Approval Officer',
      'department','Marketplace & Approvals',
      'description','Approval Center, Seller/product approvals, partner onboarding, Flash Sales, marketplace listings and moderation.',
      'permissions',to_jsonb(private.normalize_admin_staff_permissions(array[
        'dashboard.read',
        'approvals.read',
        'approvals.manage',
        'sellers.read',
        'products.read',
        'products.manage',
        'customers.read'
      ]::text[]))
    ),
    jsonb_build_object(
      'code','finance',
      'label','Finance & Settlement Officer',
      'department','Finance',
      'description','Order payment verification, partner settlement review/payment and financial reporting.',
      'permissions',to_jsonb(private.normalize_admin_staff_permissions(array[
        'dashboard.read',
        'orders.read',
        'orders.payment_verify',
        'settlements.read',
        'settlements.manage',
        'sellers.read',
        'reports.export'
      ]::text[]))
    ),
    jsonb_build_object(
      'code','support',
      'label','Customer Support Officer',
      'department','Customer Support',
      'description','Customer Care chats, customer records, order tracking, Aftersales visibility and limited Seller/product visibility.',
      'permissions',to_jsonb(private.normalize_admin_staff_permissions(array[
        'dashboard.read',
        'orders.read',
        'customers.read',
        'support.chat',
        'sellers.read',
        'products.read'
      ]::text[]))
    ),
    jsonb_build_object(
      'code','read_only',
      'label','Read-only Staff',
      'department','Administration',
      'description','View selected operational, approval and supported configuration records without management permissions.',
      'permissions',to_jsonb(private.normalize_admin_staff_permissions(array[
        'dashboard.read',
        'orders.read',
        'customers.read',
        'sellers.read',
        'products.read',
        'approvals.read',
        'settings.read'
      ]::text[]))
    )
  );
end
$function$;

create or replace function public.admin_update_staff_access(
  p_user_id uuid,
  p_account_kind text,
  p_display_name text,
  p_phone text default null,
  p_department text default null,
  p_job_title text default null,
  p_role_code text default null,
  p_status text default null,
  p_permissions text[] default null,
  p_vehicle_type text default null,
  p_vehicle_registration text default null,
  p_id_number text default null,
  p_license_number text default null,
  p_availability_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_allowed_permissions constant text[] := array[
    'dashboard.read',
    'approvals.read','approvals.manage',
    'orders.read','orders.write','orders.manage','orders.payment_verify',
    'delivery.manage',
    'customers.read',
    'support.chat',
    'sellers.read',
    'settlements.read','settlements.manage',
    'products.read','products.manage',
    'premium.read','premium.manage',
    'reports.export','data.read',
    'payments.manage',
    'settings.read','fees.manage','settings.manage'
  ];
  v_permissions text[];
  v_permission text;
begin
  if not private.is_leogo_super_admin() then
    raise exception 'Super Admin access required';
  end if;
  if p_user_id=(select auth.uid()) then
    raise exception 'Use a separate owner-security workflow to change your own Super Admin access';
  end if;
  if char_length(btrim(coalesce(p_display_name,'')))<2 then
    raise exception 'Staff display name is required';
  end if;

  if p_account_kind='admin_staff' then
    if p_role_code not in ('operations','reviewer','finance','support','read_only') then
      raise exception 'Choose a supported Admin staff role';
    end if;
    if p_status not in ('active','suspended') then
      raise exception 'Unsupported Admin staff status';
    end if;

    v_permissions:=private.normalize_admin_staff_permissions(coalesce(p_permissions,'{}'::text[]));

    foreach v_permission in array v_permissions
    loop
      if not (v_permission=any(v_allowed_permissions)) then
        raise exception 'Unsupported permission: %',v_permission;
      end if;
    end loop;

    select to_jsonb(a)
    into v_before
    from public.admin_users a
    where a.user_id=p_user_id
    for update;

    if v_before is null then raise exception 'Admin staff account not found'; end if;
    if v_before->>'role'='super_admin' then
      raise exception 'Super Admin accounts are protected from this editor';
    end if;

    update public.admin_users
    set display_name=btrim(p_display_name),
        phone=nullif(btrim(coalesce(p_phone,'')),''),
        department=nullif(btrim(coalesce(p_department,'')),''),
        job_title=nullif(btrim(coalesce(p_job_title,'')),''),
        role=p_role_code,
        status=p_status,
        permissions=v_permissions,
        updated_at=now()
    where user_id=p_user_id;

    select to_jsonb(a)
    into v_after
    from public.admin_users a
    where a.user_id=p_user_id;

  elsif p_account_kind='rider' then
    if p_status not in ('active','inactive','suspended') then
      raise exception 'Unsupported Rider status';
    end if;
    if coalesce(p_availability_status,'available') not in ('available','off_duty','on_delivery') then
      raise exception 'Unsupported Rider availability';
    end if;

    select to_jsonb(s)
    into v_before
    from public.leogo_staff s
    where s.user_id=p_user_id and s.staff_role='rider'
    for update;

    if v_before is null then raise exception 'Rider account not found'; end if;

    update public.leogo_staff
    set display_name=btrim(p_display_name),
        phone=nullif(btrim(coalesce(p_phone,'')),''),
        status=p_status,
        vehicle_type=nullif(btrim(coalesce(p_vehicle_type,'')),''),
        vehicle_registration=nullif(upper(btrim(coalesce(p_vehicle_registration,''))),''),
        id_number=nullif(btrim(coalesce(p_id_number,'')),''),
        license_number=nullif(upper(btrim(coalesce(p_license_number,''))),''),
        availability_status=coalesce(p_availability_status,'available'),
        updated_at=now()
    where user_id=p_user_id and staff_role='rider';

    select to_jsonb(s)
    into v_after
    from public.leogo_staff s
    where s.user_id=p_user_id;
  else
    raise exception 'Unsupported staff account type';
  end if;

  perform private.write_admin_audit(
    'staff.access.updated',
    p_account_kind,
    p_user_id::text,
    v_before,
    v_after,
    jsonb_build_object(
      'role_code',p_role_code,
      'status',p_status,
      'permissions',case when p_account_kind='admin_staff' then to_jsonb(v_permissions) else '[]'::jsonb end
    )
  );

  return jsonb_build_object(
    'ok',true,
    'user_id',p_user_id,
    'account_kind',p_account_kind,
    'permissions',case when p_account_kind='admin_staff' then to_jsonb(v_permissions) else '[]'::jsonb end
  );
end
$function$;

revoke execute on function public.admin_staff_role_presets() from public,anon;
revoke execute on function public.admin_update_staff_access(
  uuid,text,text,text,text,text,text,text,text[],text,text,text,text,text
) from public,anon;

grant execute on function public.admin_staff_role_presets() to authenticated;
grant execute on function public.admin_update_staff_access(
  uuid,text,text,text,text,text,text,text,text[],text,text,text,text,text
) to authenticated;
