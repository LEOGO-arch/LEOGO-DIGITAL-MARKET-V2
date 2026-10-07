-- LEOGO V2: staff operating County/Sub-County and location-aware rider assignment support.
-- Existing staff remain valid with NULL location until Super Admin updates them.
-- New Admin UI/Edge Function requires County + Sub-County for new staff.

alter table public.admin_users
  add column if not exists county_code text,
  add column if not exists sub_county_code text;

alter table public.leogo_staff
  add column if not exists county_code text,
  add column if not exists sub_county_code text;

do $block$
begin
  if not exists (select 1 from pg_constraint where conname='admin_users_county_code_fkey') then
    alter table public.admin_users
      add constraint admin_users_county_code_fkey
      foreign key (county_code) references public.kenya_counties(code);
  end if;
  if not exists (select 1 from pg_constraint where conname='admin_users_sub_county_code_fkey') then
    alter table public.admin_users
      add constraint admin_users_sub_county_code_fkey
      foreign key (sub_county_code) references public.kenya_subcounties(code);
  end if;
  if not exists (select 1 from pg_constraint where conname='leogo_staff_county_code_fkey') then
    alter table public.leogo_staff
      add constraint leogo_staff_county_code_fkey
      foreign key (county_code) references public.kenya_counties(code);
  end if;
  if not exists (select 1 from pg_constraint where conname='leogo_staff_sub_county_code_fkey') then
    alter table public.leogo_staff
      add constraint leogo_staff_sub_county_code_fkey
      foreign key (sub_county_code) references public.kenya_subcounties(code);
  end if;
end
$block$;

create index if not exists admin_users_sub_county_code_idx on public.admin_users(sub_county_code);
create index if not exists leogo_staff_sub_county_code_idx on public.leogo_staff(sub_county_code);

create or replace function public.admin_list_staff_directory()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
      'county_code',a.county_code,
      'county',county.name,
      'sub_county_code',a.sub_county_code,
      'sub_county',subcounty.name,
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
    left join public.kenya_counties county on county.code=a.county_code
    left join public.kenya_subcounties subcounty on subcounty.code=a.sub_county_code

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
      'county_code',s.county_code,
      'county',county.name,
      'sub_county_code',s.sub_county_code,
      'sub_county',subcounty.name,
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
    left join public.kenya_counties county on county.code=s.county_code
    left join public.kenya_subcounties subcounty on subcounty.code=s.sub_county_code
    where s.staff_role='rider'
  ) x;

  return v_result;
end
$function$;

revoke all on function public.admin_list_staff_directory() from public, anon;
grant execute on function public.admin_list_staff_directory() to authenticated;

create or replace function public.admin_list_riders_v2()
returns table(
  user_id uuid,
  display_name text,
  email text,
  phone text,
  status text,
  vehicle_type text,
  vehicle_registration text,
  county_code text,
  county text,
  sub_county_code text,
  sub_county text,
  availability_status text
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not private.is_leogo_admin('orders.read') then
    raise exception 'Admin access required';
  end if;

  return query
  select
    s.user_id,
    s.display_name,
    u.email::text,
    s.phone,
    s.status,
    s.vehicle_type,
    s.vehicle_registration,
    s.county_code,
    county.name,
    s.sub_county_code,
    subcounty.name,
    s.availability_status
  from public.leogo_staff s
  left join auth.users u on u.id=s.user_id
  left join public.kenya_counties county on county.code=s.county_code
  left join public.kenya_subcounties subcounty on subcounty.code=s.sub_county_code
  where s.staff_role='rider'
  order by
    case when s.status='active' then 0 else 1 end,
    county.name nulls last,
    subcounty.name nulls last,
    s.display_name;
end
$function$;

revoke all on function public.admin_list_riders_v2() from public, anon;
grant execute on function public.admin_list_riders_v2() to authenticated;

create or replace function public.admin_update_staff_access_v2(
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
  p_availability_status text default null,
  p_county_code text default null,
  p_sub_county_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
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
  if nullif(btrim(coalesce(p_county_code,'')),'') is null
     or nullif(btrim(coalesce(p_sub_county_code,'')),'') is null then
    raise exception 'Choose the staff County and Sub-County';
  end if;
  if not exists (
    select 1 from public.kenya_counties c
    where c.code=p_county_code and c.is_active
  ) then
    raise exception 'Choose an active LEOGO County';
  end if;
  if not exists (
    select 1 from public.kenya_subcounties s
    where s.code=p_sub_county_code
      and s.county_code=p_county_code
      and s.is_active
  ) then
    raise exception 'Choose a Sub-County that belongs to the selected County';
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
        county_code=p_county_code,
        sub_county_code=p_sub_county_code,
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
        county_code=p_county_code,
        sub_county_code=p_sub_county_code,
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
      'county_code',p_county_code,
      'sub_county_code',p_sub_county_code,
      'permissions',case when p_account_kind='admin_staff' then to_jsonb(v_permissions) else '[]'::jsonb end
    )
  );

  return jsonb_build_object(
    'ok',true,
    'user_id',p_user_id,
    'account_kind',p_account_kind,
    'county_code',p_county_code,
    'sub_county_code',p_sub_county_code,
    'permissions',case when p_account_kind='admin_staff' then to_jsonb(v_permissions) else '[]'::jsonb end
  );
end
$function$;

revoke all on function public.admin_update_staff_access_v2(uuid,text,text,text,text,text,text,text,text[],text,text,text,text,text,text,text) from public, anon;
grant execute on function public.admin_update_staff_access_v2(uuid,text,text,text,text,text,text,text,text[],text,text,text,text,text,text,text) to authenticated;
