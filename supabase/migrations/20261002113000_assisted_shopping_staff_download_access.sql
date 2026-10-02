-- LEOGO Assisted Shopping V1.1
-- Admin may assign one active LEOGO staff member to an Assisted Shopping request.
-- Admin and the assigned staff member can securely read/download the Shopping List
-- and its private attachments. Customer access remains unchanged.

create table if not exists public.assisted_shopping_assignments(
  request_id uuid primary key references public.assisted_shopping_requests(id) on delete cascade,
  staff_user_id uuid not null references public.leogo_staff(user_id) on delete restrict,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now()
);

create index if not exists assisted_shopping_assignments_staff_idx
  on public.assisted_shopping_assignments(staff_user_id,assigned_at desc);

alter table public.assisted_shopping_assignments enable row level security;
revoke all on table public.assisted_shopping_assignments from anon,authenticated;
grant all on table public.assisted_shopping_assignments to service_role;

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
      join public.leogo_staff s on s.user_id=a.staff_user_id
      where a.request_id=p_request_id
        and a.staff_user_id=(select auth.uid())
        and s.status='active'
    );
$function$;

revoke execute on function private.can_access_assisted_shopping_request(uuid)
  from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.can_access_assisted_shopping_request(uuid)
  to authenticated;

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
  select s.user_id,s.display_name,s.phone,s.staff_role,s.availability_status
  from public.leogo_staff s
  where s.status='active'
  order by
    case s.staff_role when 'operations' then 0 when 'support' then 1 when 'rider' then 2 else 3 end,
    lower(s.display_name);
end
$function$;

revoke execute on function public.admin_list_assisted_shopping_staff()
  from public,anon;
grant execute on function public.admin_list_assisted_shopping_staff()
  to authenticated;

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
  select a.request_id,a.staff_user_id,s.display_name,s.phone,s.staff_role,a.assigned_at,a.assigned_by
  from public.assisted_shopping_assignments a
  join public.leogo_staff s on s.user_id=a.staff_user_id
  order by a.assigned_at desc;
end
$function$;

revoke execute on function public.admin_list_assisted_shopping_assignments()
  from public,anon;
grant execute on function public.admin_list_assisted_shopping_assignments()
  to authenticated;

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
  v_staff public.leogo_staff%rowtype;
  v_previous uuid;
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

  select * into v_staff
  from public.leogo_staff s
  where s.user_id=p_staff_user_id
    and s.status='active';

  if not found then
    raise exception 'Choose an active LEOGO staff member';
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
    'LEOGO assigned '||v_staff.display_name||' to this Shopping List.',
    (select auth.uid()),'admin',
    jsonb_build_object(
      'staff_user_id',p_staff_user_id,
      'staff_name',v_staff.display_name,
      'staff_role',v_staff.staff_role,
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
      'staff_name',v_staff.display_name,
      'staff_role',v_staff.staff_role
    ),
    '{}'::jsonb
  );

  return jsonb_build_object(
    'ok',true,
    'assigned',true,
    'staff_user_id',p_staff_user_id,
    'staff_name',v_staff.display_name,
    'staff_role',v_staff.staff_role
  );
end
$function$;

revoke execute on function public.admin_assign_assisted_shopping_staff(uuid,uuid)
  from public,anon;
grant execute on function public.admin_assign_assisted_shopping_staff(uuid,uuid)
  to authenticated;

create or replace function public.staff_list_assigned_assisted_shopping_requests()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Staff sign in required'; end if;

  if not exists(
    select 1 from public.leogo_staff s
    where s.user_id=v_uid and s.status='active'
  ) then
    raise exception 'Active LEOGO staff account required';
  end if;

  select coalesce(jsonb_agg(row_data order by (row_data->>'assigned_at')::timestamptz desc),'[]'::jsonb)
  into v_result
  from (
    select
      (
        to_jsonb(r)
        || jsonb_build_object(
          'customer_name',cp.full_name,
          'customer_phone',cp.phone,
          'customer_email',u.email,
          'pickup_station_name',ps.station_name,
          'pickup_station_address',concat_ws(', ',ps.address_line,ps.town,ps.county),
          'assigned_at',a.assigned_at,
          'files',coalesce((
            select jsonb_agg(jsonb_build_object(
              'id',f.id,
              'path',f.storage_path,
              'name',f.original_name,
              'mime',f.mime_type,
              'size',f.size_bytes
            ) order by f.created_at)
            from public.assisted_shopping_files f
            where f.request_id=r.id
          ),'[]'::jsonb),
          'items',coalesce((
            select jsonb_agg(to_jsonb(i) order by i.sort_order,i.created_at)
            from public.assisted_shopping_quote_items i
            where i.request_id=r.id
          ),'[]'::jsonb),
          'order_reference',o.order_reference,
          'order_status',o.order_status,
          'delivery_status',d.status
        )
      ) row_data
    from public.assisted_shopping_assignments a
    join public.assisted_shopping_requests r on r.id=a.request_id
    left join public.customer_profiles cp on cp.user_id=r.customer_id
    left join auth.users u on u.id=r.customer_id
    left join public.pickup_stations ps on ps.id=r.pickup_station_id
    left join public.marketplace_orders o on o.id=r.marketplace_order_id
    left join public.marketplace_delivery_jobs d on d.order_id=o.id
    where a.staff_user_id=v_uid
  ) q;

  return v_result;
end
$function$;

revoke execute on function public.staff_list_assigned_assisted_shopping_requests()
  from public,anon;
grant execute on function public.staff_list_assigned_assisted_shopping_requests()
  to authenticated;

-- Assigned staff may read attachment bytes for only the Shopping Lists assigned to them.
drop policy if exists assisted_shopping_files_read_authorized on storage.objects;
create policy assisted_shopping_files_read_authorized
on storage.objects for select to authenticated
using(
  bucket_id='assisted-shopping-files'
  and (
    split_part(name,'/',1)=(select auth.uid())::text
    or private.is_leogo_admin('orders.read')
    or exists(
      select 1
      from public.assisted_shopping_files f
      where f.storage_path=name
        and private.can_access_assisted_shopping_request(f.request_id)
    )
  )
);
