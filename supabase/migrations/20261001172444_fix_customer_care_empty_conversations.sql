
-- Customer Care chat hygiene:
-- 1) merely opening/loading chat never creates a thread;
-- 2) Admin lists only conversations that contain at least one real message.

create or replace function public.customer_open_support_chat()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_thread public.customer_care_threads%rowtype;
  v_agent_name text;
  v_customer_name text;
  v_unread integer:=0;
begin
  if v_uid is null then raise exception 'Login required'; end if;

  select * into v_thread
  from public.customer_care_threads
  where customer_id=v_uid;

  if not found then
    select cp.full_name into v_customer_name
    from public.customer_profiles cp
    where cp.user_id=v_uid;

    return jsonb_build_object(
      'exists',false,
      'thread_id',null,
      'status',null,
      'assigned_staff_id',null,
      'assigned_staff_name',null,
      'customer_name',coalesce(v_customer_name,'Customer'),
      'last_message_at',null,
      'unread_count',0
    );
  end if;

  -- Historical empty rows must behave as "no conversation" and are not
  -- assigned/queued simply because the customer page loaded.
  if not exists(
    select 1 from public.customer_care_messages m
    where m.thread_id=v_thread.id
  ) then
    select cp.full_name into v_customer_name
    from public.customer_profiles cp
    where cp.user_id=v_uid;

    return jsonb_build_object(
      'exists',false,
      'thread_id',null,
      'status',null,
      'assigned_staff_id',null,
      'assigned_staff_name',null,
      'customer_name',coalesce(v_customer_name,'Customer'),
      'last_message_at',null,
      'unread_count',0
    );
  end if;

  -- Only a real conversation may be assigned/reassigned.
  if v_thread.assigned_staff_id is null
     or not exists(
       select 1 from public.admin_users a
       where a.user_id=v_thread.assigned_staff_id
         and a.status='active'
         and (
           a.role in ('super_admin','admin','support')
           or 'support.chat'=any(a.permissions)
         )
     ) then
    perform private.try_assign_customer_care_thread(v_thread.id);
    select * into v_thread
    from public.customer_care_threads
    where id=v_thread.id;
  end if;

  select a.display_name into v_agent_name
  from public.admin_users a
  where a.user_id=v_thread.assigned_staff_id;

  select cp.full_name into v_customer_name
  from public.customer_profiles cp
  where cp.user_id=v_uid;

  select count(*)::integer into v_unread
  from public.customer_care_messages m
  where m.thread_id=v_thread.id
    and m.sender_role='staff'
    and (v_thread.customer_last_read_at is null or m.created_at>v_thread.customer_last_read_at);

  return jsonb_build_object(
    'exists',true,
    'thread_id',v_thread.id,
    'status',v_thread.status,
    'assigned_staff_id',v_thread.assigned_staff_id,
    'assigned_staff_name',v_agent_name,
    'customer_name',coalesce(v_customer_name,'Customer'),
    'last_message_at',v_thread.last_message_at,
    'unread_count',coalesce(v_unread,0)
  );
end
$function$;

create or replace function public.customer_support_chat_summary()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_thread public.customer_care_threads%rowtype;
  v_agent_name text;
  v_unread integer:=0;
begin
  if v_uid is null then
    return jsonb_build_object('exists',false,'unread_count',0);
  end if;

  select * into v_thread
  from public.customer_care_threads
  where customer_id=v_uid
    and exists(
      select 1 from public.customer_care_messages m
      where m.thread_id=customer_care_threads.id
    );

  if not found then
    return jsonb_build_object('exists',false,'unread_count',0);
  end if;

  select a.display_name into v_agent_name
  from public.admin_users a
  where a.user_id=v_thread.assigned_staff_id;

  select count(*)::integer into v_unread
  from public.customer_care_messages m
  where m.thread_id=v_thread.id
    and m.sender_role='staff'
    and (v_thread.customer_last_read_at is null or m.created_at>v_thread.customer_last_read_at);

  return jsonb_build_object(
    'exists',true,
    'thread_id',v_thread.id,
    'status',v_thread.status,
    'assigned_staff_id',v_thread.assigned_staff_id,
    'assigned_staff_name',v_agent_name,
    'last_message_at',v_thread.last_message_at,
    'unread_count',coalesce(v_unread,0)
  );
end
$function$;

create or replace function public.staff_list_support_threads()
returns table(
  thread_id uuid,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  assigned_staff_id uuid,
  assigned_staff_name text,
  status text,
  last_message_preview text,
  last_message_at timestamptz,
  unread_count bigint,
  created_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_role text;
begin
  if not private.is_customer_care_staff() then
    raise exception 'Customer Care chat permission required';
  end if;

  select a.role into v_role
  from public.admin_users a
  where a.user_id=v_uid and a.status='active';

  return query
  select
    t.id,
    t.customer_id,
    coalesce(cp.full_name,'Customer'),
    cp.phone,
    t.assigned_staff_id,
    assignee.display_name,
    t.status,
    t.last_message_preview,
    t.last_message_at,
    (
      select count(*)
      from public.customer_care_messages m
      where m.thread_id=t.id
        and m.sender_role='customer'
        and (t.staff_last_read_at is null or m.created_at>t.staff_last_read_at)
    ) as unread_count,
    t.created_at
  from public.customer_care_threads t
  left join public.customer_profiles cp on cp.user_id=t.customer_id
  left join public.admin_users assignee on assignee.user_id=t.assigned_staff_id
  where exists(
      select 1 from public.customer_care_messages existing_message
      where existing_message.thread_id=t.id
    )
    and (
      v_role in ('super_admin','admin')
      or t.assigned_staff_id=v_uid
      or t.assigned_staff_id is null
    )
  order by
    case when t.assigned_staff_id is null then 0 else 1 end,
    case when t.status='open' then 0 when t.status='waiting' then 1 else 2 end,
    coalesce(t.last_message_at,t.created_at) desc;
end
$function$;
