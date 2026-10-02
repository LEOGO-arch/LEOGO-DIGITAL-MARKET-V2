-- Assisted Shopping V1.1 follow-up:
-- Allow assignment to either an active Staff Portal user or an active Admin-side
-- LEOGO staff account with order access.

alter table public.assisted_shopping_assignments
  drop constraint if exists assisted_shopping_assignments_staff_user_id_fkey;

alter table public.assisted_shopping_assignments
  add constraint assisted_shopping_assignments_staff_user_id_fkey
  foreign key(staff_user_id) references auth.users(id) on delete restrict;

create or replace function private.can_access_assisted_shopping_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select
    private.is_leogo_admin('orders.read')
    or exists(
      select 1
      from public.assisted_shopping_assignments a
      where a.request_id=p_request_id
        and a.staff_user_id=(select auth.uid())
        and (
          exists(
            select 1 from public.leogo_staff s
            where s.user_id=a.staff_user_id
              and s.status='active'
          )
          or exists(
            select 1 from public.admin_users au
            where au.user_id=a.staff_user_id
              and au.status='active'
          )
        )
    );
$function$;

create or replace function public.admin_list_assisted_shopping_staff()
returns table(
  user_id uuid,
  display_name text,
  phone text,
  staff_role text,
  availability_status text
)
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if not private.is_leogo_admin('orders.read')
     and not private.is_leogo_admin('orders.manage') then
    raise exception 'Order access required';
  end if;

  return query
  select x.user_id,x.display_name,x.phone,x.staff_role,x.availability_status
  from (
    select
      au.user_id,
      au.display_name,
      au.phone,
      au.role as staff_role,
      null::text as availability_status,
      case au.role
        when 'super_admin' then 0
        when 'admin' then 1
        when 'operations' then 2
        when 'support' then 3
        when 'reviewer' then 4
        else 5
      end as sort_group
    from public.admin_users au
    where au.status='active'
      and (
        au.role in ('super_admin','admin')
        or 'orders.read'=any(au.permissions)
        or 'orders.manage'=any(au.permissions)
      )

    union all

    select
      s.user_id,
      s.display_name,
      s.phone,
      s.staff_role,
      s.availability_status,
      case s.staff_role when 'operations' then 6 when 'support' then 7 when 'rider' then 8 else 9 end
    from public.leogo_staff s
    where s.status='active'
      and not exists(
        select 1 from public.admin_users au
        where au.user_id=s.user_id and au.status='active'
      )
  ) x
  order by x.sort_group,lower(x.display_name);
end
$function$;

create or replace function public.admin_list_assisted_shopping_assignments()
returns table(
  request_id uuid,
  staff_user_id uuid,
  staff_name text,
  staff_phone text,
  staff_role text,
  assigned_at timestamptz,
  assigned_by uuid
)
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if not private.is_leogo_admin('orders.read')
     and not private.is_leogo_admin('orders.manage') then
    raise exception 'Order access required';
  end if;

  return query
  select
    a.request_id,
    a.staff_user_id,
    coalesce(au.display_name,s.display_name,u.email::text,'LEOGO Staff') as staff_name,
    coalesce(au.phone,s.phone) as staff_phone,
    coalesce(au.role,s.staff_role,'staff') as staff_role,
    a.assigned_at,
    a.assigned_by
  from public.assisted_shopping_assignments a
  join auth.users u on u.id=a.staff_user_id
  left join public.admin_users au
    on au.user_id=a.staff_user_id and au.status='active'
  left join public.leogo_staff s
    on s.user_id=a.staff_user_id and s.status='active'
  order by a.assigned_at desc;
end
$function$;

create or replace function public.admin_assign_assisted_shopping_staff(
  p_request_id uuid,
  p_staff_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  r public.assisted_shopping_requests%rowtype;
  v_previous uuid;
  v_name text;
  v_role text;
  v_is_active boolean:=false;
begin
  if not private.is_leogo_admin('orders.manage') then
    raise exception 'Order management permission required';
  end if;

  select * into r
  from public.assisted_shopping_requests
  where id=p_request_id
  for update;

  if not found then raise exception 'Shopping List request not found'; end if;

  select a.staff_user_id into v_previous
  from public.assisted_shopping_assignments a
  where a.request_id=p_request_id;

  if p_staff_user_id is null then
    delete from public.assisted_shopping_assignments
    where request_id=p_request_id;

    insert into public.assisted_shopping_events(
      request_id,event_type,title,message,actor_user_id,actor_role,metadata
    ) values(
      p_request_id,'staff_unassigned','Assigned staff removed',
      'LEOGO Admin removed the staff assignment for this Shopping List.',
      (select auth.uid()),'admin',
      jsonb_build_object('previous_staff_user_id',v_previous)
    );

    perform private.write_admin_audit(
      'assisted_shopping.staff.unassigned',
      'assisted_shopping_request',
      p_request_id::text,
      jsonb_build_object('staff_user_id',v_previous),
      '{}'::jsonb,
      '{}'::jsonb
    );

    return jsonb_build_object('ok',true,'assigned',false);
  end if;

  select
    coalesce(au.display_name,s.display_name,u.email::text),
    coalesce(au.role,s.staff_role,'staff'),
    (
      (au.user_id is not null and au.status='active'
       and (
         au.role in ('super_admin','admin')
         or 'orders.read'=any(au.permissions)
         or 'orders.manage'=any(au.permissions)
       ))
      or
      (s.user_id is not null and s.status='active')
    )
  into v_name,v_role,v_is_active
  from auth.users u
  left join public.admin_users au on au.user_id=u.id
  left join public.leogo_staff s on s.user_id=u.id
  where u.id=p_staff_user_id;

  if not coalesce(v_is_active,false) then
    raise exception 'Choose an active LEOGO staff member with Shopping List access';
  end if;

  insert into public.assisted_shopping_assignments(
    request_id,staff_user_id,assigned_by,assigned_at
  ) values(
    p_request_id,p_staff_user_id,(select auth.uid()),now()
  )
  on conflict(request_id) do update
  set staff_user_id=excluded.staff_user_id,
      assigned_by=excluded.assigned_by,
      assigned_at=now();

  insert into public.assisted_shopping_events(
    request_id,event_type,title,message,actor_user_id,actor_role,metadata
  ) values(
    p_request_id,'staff_assigned','Staff assigned',
    'LEOGO assigned '||v_name||' to this Shopping List.',
    (select auth.uid()),'admin',
    jsonb_build_object(
      'staff_user_id',p_staff_user_id,
      'staff_name',v_name,
      'staff_role',v_role,
      'previous_staff_user_id',v_previous
    )
  );

  perform private.write_admin_audit(
    case when v_previous is null then 'assisted_shopping.staff.assigned'
         else 'assisted_shopping.staff.reassigned' end,
    'assisted_shopping_request',
    p_request_id::text,
    jsonb_build_object('staff_user_id',v_previous),
    jsonb_build_object(
      'staff_user_id',p_staff_user_id,
      'staff_name',v_name,
      'staff_role',v_role
    ),
    '{}'::jsonb
  );

  return jsonb_build_object(
    'ok',true,
    'assigned',true,
    'staff_user_id',p_staff_user_id,
    'staff_name',v_name,
    'staff_role',v_role
  );
end
$function$;
