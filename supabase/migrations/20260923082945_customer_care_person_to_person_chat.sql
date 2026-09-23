
create table if not exists public.customer_care_threads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references auth.users(id) on delete cascade,
  assigned_staff_id uuid references auth.users(id) on delete set null,
  status text not null default 'waiting'
    check (status in ('waiting','open','closed')),
  assigned_at timestamptz,
  customer_last_read_at timestamptz,
  staff_last_read_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_care_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.customer_care_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer','staff','system')),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists customer_care_threads_staff_status_idx
  on public.customer_care_threads(assigned_staff_id,status,last_message_at desc nulls last);

create index if not exists customer_care_threads_status_idx
  on public.customer_care_threads(status,last_message_at desc nulls last);

create index if not exists customer_care_messages_thread_created_idx
  on public.customer_care_messages(thread_id,created_at);

alter table public.customer_care_threads enable row level security;
alter table public.customer_care_messages enable row level security;

revoke all on public.customer_care_threads from anon,authenticated;
revoke all on public.customer_care_messages from anon,authenticated;

create or replace function private.is_customer_care_staff()
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select private.is_leogo_admin('support.chat');
$function$;

create or replace function private.try_assign_customer_care_thread(p_thread_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_current uuid;
  v_agent uuid;
begin
  select t.assigned_staff_id into v_current
  from public.customer_care_threads t
  where t.id=p_thread_id
  for update;

  if not found then return null; end if;

  if v_current is not null and exists(
    select 1 from public.admin_users a
    where a.user_id=v_current
      and a.status='active'
      and (
        a.role in ('super_admin','admin')
        or a.role='support'
        or 'support.chat'=any(a.permissions)
      )
  ) then
    return v_current;
  end if;

  select a.user_id into v_agent
  from public.admin_users a
  where a.status='active'
    and a.role='support'
    and (
      'support.chat'=any(a.permissions)
      or 'customers.read'=any(a.permissions)
    )
  order by
    (
      select count(*)
      from public.customer_care_threads q
      where q.assigned_staff_id=a.user_id
        and q.status in ('waiting','open')
    ) asc,
    a.created_at asc
  limit 1;

  update public.customer_care_threads
  set assigned_staff_id=v_agent,
      assigned_at=case when v_agent is not null then now() else null end,
      status=case when v_agent is not null and status<>'closed' then 'open' else status end,
      updated_at=now()
  where id=p_thread_id;

  return v_agent;
end
$function$;

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
  v_unread integer;
begin
  if v_uid is null then raise exception 'Login required'; end if;

  insert into public.customer_care_threads(customer_id,status)
  values(v_uid,'waiting')
  on conflict(customer_id) do nothing;

  select * into v_thread
  from public.customer_care_threads
  where customer_id=v_uid
  for update;

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

create or replace function public.customer_list_support_messages()
returns table(
  message_id uuid,
  sender_role text,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_thread_id uuid;
begin
  if v_uid is null then raise exception 'Login required'; end if;

  select t.id into v_thread_id
  from public.customer_care_threads t
  where t.customer_id=v_uid;

  if v_thread_id is null then return; end if;

  return query
  select m.id,m.sender_role,m.body,m.created_at
  from (
    select x.*
    from public.customer_care_messages x
    where x.thread_id=v_thread_id
    order by x.created_at desc
    limit 300
  ) m
  order by m.created_at asc;
end
$function$;

create or replace function public.customer_send_support_message(p_body text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_thread public.customer_care_threads%rowtype;
  v_message_id uuid;
  v_body text:=btrim(coalesce(p_body,''));
  v_agent uuid;
begin
  if v_uid is null then raise exception 'Login required'; end if;
  if char_length(v_body)<1 then raise exception 'Write a message first'; end if;
  if char_length(v_body)>2000 then raise exception 'Message must be 2000 characters or fewer'; end if;

  insert into public.customer_care_threads(customer_id,status)
  values(v_uid,'waiting')
  on conflict(customer_id) do nothing;

  select * into v_thread
  from public.customer_care_threads
  where customer_id=v_uid
  for update;

  v_agent=private.try_assign_customer_care_thread(v_thread.id);

  insert into public.customer_care_messages(thread_id,sender_id,sender_role,body)
  values(v_thread.id,v_uid,'customer',v_body)
  returning id into v_message_id;

  update public.customer_care_threads
  set status=case when coalesce(v_agent,assigned_staff_id) is null then 'waiting' else 'open' end,
      last_message_at=now(),
      last_message_preview=left(v_body,180),
      updated_at=now()
  where id=v_thread.id;

  return jsonb_build_object(
    'ok',true,
    'thread_id',v_thread.id,
    'message_id',v_message_id,
    'assigned_staff_id',coalesce(v_agent,v_thread.assigned_staff_id)
  );
end
$function$;

create or replace function public.customer_mark_support_chat_read()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
begin
  if v_uid is null then return; end if;
  update public.customer_care_threads
  set customer_last_read_at=now(),updated_at=updated_at
  where customer_id=v_uid;
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
  where
    v_role in ('super_admin','admin')
    or t.assigned_staff_id=v_uid
    or t.assigned_staff_id is null
  order by
    case when t.assigned_staff_id is null then 0 else 1 end,
    case when t.status='open' then 0 when t.status='waiting' then 1 else 2 end,
    coalesce(t.last_message_at,t.created_at) desc;
end
$function$;

create or replace function public.staff_claim_support_thread(p_thread_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_role text;
  v_thread public.customer_care_threads%rowtype;
begin
  if not private.is_customer_care_staff() then
    raise exception 'Customer Care chat permission required';
  end if;

  select a.role into v_role
  from public.admin_users a
  where a.user_id=v_uid and a.status='active';

  select * into v_thread
  from public.customer_care_threads
  where id=p_thread_id
  for update;

  if not found then raise exception 'Chat not found'; end if;

  if v_thread.assigned_staff_id is not null
     and v_thread.assigned_staff_id<>v_uid
     and v_role not in ('super_admin','admin') then
    raise exception 'This chat is already assigned to another Customer Care officer';
  end if;

  update public.customer_care_threads
  set assigned_staff_id=v_uid,
      assigned_at=now(),
      status='open',
      staff_last_read_at=now(),
      updated_at=now()
  where id=p_thread_id;

  return jsonb_build_object('ok',true,'thread_id',p_thread_id,'assigned_staff_id',v_uid);
end
$function$;

create or replace function public.staff_list_support_messages(p_thread_id uuid)
returns table(
  message_id uuid,
  sender_role text,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_role text;
  v_thread public.customer_care_threads%rowtype;
begin
  if not private.is_customer_care_staff() then
    raise exception 'Customer Care chat permission required';
  end if;

  select a.role into v_role
  from public.admin_users a
  where a.user_id=v_uid and a.status='active';

  select * into v_thread
  from public.customer_care_threads
  where id=p_thread_id;

  if not found then raise exception 'Chat not found'; end if;

  if v_role not in ('super_admin','admin')
     and v_thread.assigned_staff_id is not null
     and v_thread.assigned_staff_id<>v_uid then
    raise exception 'This chat is assigned to another Customer Care officer';
  end if;

  if v_thread.assigned_staff_id=v_uid then
    update public.customer_care_threads
    set staff_last_read_at=now()
    where id=p_thread_id;
  end if;

  return query
  select m.id,m.sender_role,m.body,m.created_at
  from (
    select x.*
    from public.customer_care_messages x
    where x.thread_id=p_thread_id
    order by x.created_at desc
    limit 300
  ) m
  order by m.created_at asc;
end
$function$;

create or replace function public.staff_send_support_message(
  p_thread_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_thread public.customer_care_threads%rowtype;
  v_message_id uuid;
  v_body text:=btrim(coalesce(p_body,''));
begin
  if not private.is_customer_care_staff() then
    raise exception 'Customer Care chat permission required';
  end if;

  if char_length(v_body)<1 then raise exception 'Write a message first'; end if;
  if char_length(v_body)>2000 then raise exception 'Message must be 2000 characters or fewer'; end if;

  select * into v_thread
  from public.customer_care_threads
  where id=p_thread_id
  for update;

  if not found then raise exception 'Chat not found'; end if;

  if v_thread.assigned_staff_id is null then
    raise exception 'Claim this chat before replying';
  end if;

  if v_thread.assigned_staff_id<>v_uid then
    raise exception 'This chat is assigned to another Customer Care officer';
  end if;

  insert into public.customer_care_messages(thread_id,sender_id,sender_role,body)
  values(p_thread_id,v_uid,'staff',v_body)
  returning id into v_message_id;

  update public.customer_care_threads
  set status='open',
      staff_last_read_at=now(),
      last_message_at=now(),
      last_message_preview=left(v_body,180),
      updated_at=now()
  where id=p_thread_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  values(
    v_thread.customer_id,'support','New Customer Care message',
    'LEOGO Customer Care sent you a new message.',
    'customer_care_message',v_message_id,'customer_care_message','chat',
    jsonb_build_object('thread_id',p_thread_id,'message_id',v_message_id)
  );

  return jsonb_build_object('ok',true,'thread_id',p_thread_id,'message_id',v_message_id);
end
$function$;

create or replace function public.staff_set_support_thread_status(
  p_thread_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_role text;
  v_thread public.customer_care_threads%rowtype;
begin
  if not private.is_customer_care_staff() then
    raise exception 'Customer Care chat permission required';
  end if;

  if p_status not in ('open','closed') then
    raise exception 'Unsupported chat status';
  end if;

  select a.role into v_role
  from public.admin_users a
  where a.user_id=v_uid and a.status='active';

  select * into v_thread
  from public.customer_care_threads
  where id=p_thread_id
  for update;

  if not found then raise exception 'Chat not found'; end if;

  if v_role not in ('super_admin','admin')
     and v_thread.assigned_staff_id<>v_uid then
    raise exception 'This chat is assigned to another Customer Care officer';
  end if;

  update public.customer_care_threads
  set status=p_status,
      updated_at=now()
  where id=p_thread_id;

  return jsonb_build_object('ok',true,'thread_id',p_thread_id,'status',p_status);
end
$function$;

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
      'description','Customer support, live customer chat, order tracking and limited Seller/product visibility.',
      'permissions',jsonb_build_array(
        'dashboard.read','support.chat','orders.read','customers.read','sellers.read','products.read'
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
end
$function$;

update public.admin_users
set permissions=array_append(permissions,'support.chat'),
    updated_at=now()
where role='support'
  and status='active'
  and not ('support.chat'=any(permissions));

revoke execute on function public.customer_open_support_chat() from public,anon;
revoke execute on function public.customer_list_support_messages() from public,anon;
revoke execute on function public.customer_send_support_message(text) from public,anon;
revoke execute on function public.customer_mark_support_chat_read() from public,anon;
revoke execute on function public.staff_list_support_threads() from public,anon;
revoke execute on function public.staff_claim_support_thread(uuid) from public,anon;
revoke execute on function public.staff_list_support_messages(uuid) from public,anon;
revoke execute on function public.staff_send_support_message(uuid,text) from public,anon;
revoke execute on function public.staff_set_support_thread_status(uuid,text) from public,anon;

grant execute on function public.customer_open_support_chat() to authenticated;
grant execute on function public.customer_list_support_messages() to authenticated;
grant execute on function public.customer_send_support_message(text) to authenticated;
grant execute on function public.customer_mark_support_chat_read() to authenticated;
grant execute on function public.staff_list_support_threads() to authenticated;
grant execute on function public.staff_claim_support_thread(uuid) to authenticated;
grant execute on function public.staff_list_support_messages(uuid) to authenticated;
grant execute on function public.staff_send_support_message(uuid,text) to authenticated;
grant execute on function public.staff_set_support_thread_status(uuid,text) to authenticated;
