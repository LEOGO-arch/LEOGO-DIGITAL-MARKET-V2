
create table if not exists public.customer_care_update_approvals (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.customer_care_threads(id) on delete cascade,
  proposed_by uuid not null references auth.users(id) on delete cascade,
  update_type text not null check (update_type in ('message','status')),
  proposed_body text,
  proposed_status text,
  approval_status text not null default 'submitted'
    check (approval_status in ('submitted','approved','rejected')),
  admin_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (update_type='message' and proposed_body is not null and proposed_status is null)
    or
    (update_type='status' and proposed_status in ('open','closed') and proposed_body is null)
  )
);

create index if not exists customer_care_update_approvals_queue_idx
  on public.customer_care_update_approvals(approval_status,created_at);

alter table public.customer_care_update_approvals enable row level security;
revoke all on public.customer_care_update_approvals from anon,authenticated;

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
  v_body text:=btrim(coalesce(p_body,''));
  v_role text;
  v_message_id uuid;
  v_approval_id uuid;
begin
  if not private.is_customer_care_staff() then
    raise exception 'Customer Care chat permission required';
  end if;
  if char_length(v_body)<1 then raise exception 'Write a message first'; end if;
  if char_length(v_body)>2000 then raise exception 'Message must be 2000 characters or fewer'; end if;

  select a.role into v_role
  from public.admin_users a
  where a.user_id=v_uid and a.status='active';

  select * into v_thread
  from public.customer_care_threads
  where id=p_thread_id
  for update;

  if not found then raise exception 'Chat not found'; end if;
  if v_thread.assigned_staff_id is null then raise exception 'Claim this chat before replying'; end if;
  if v_thread.assigned_staff_id<>v_uid and v_role not in ('super_admin','admin') then
    raise exception 'This chat is assigned to another Customer Care officer';
  end if;
  if v_thread.status='closed' then raise exception 'Reopen this chat before replying'; end if;

  if v_role in ('super_admin','admin') then
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

    return jsonb_build_object('ok',true,'published',true,'thread_id',p_thread_id,'message_id',v_message_id);
  end if;

  if exists(
    select 1 from public.customer_care_update_approvals q
    where q.thread_id=p_thread_id
      and q.proposed_by=v_uid
      and q.update_type='message'
      and q.approval_status='submitted'
      and q.proposed_body=v_body
  ) then
    raise exception 'This reply is already waiting for Admin approval';
  end if;

  insert into public.customer_care_update_approvals(
    thread_id,proposed_by,update_type,proposed_body
  )
  values(p_thread_id,v_uid,'message',v_body)
  returning id into v_approval_id;

  update public.customer_care_threads
  set staff_last_read_at=now(),updated_at=now()
  where id=p_thread_id;

  return jsonb_build_object(
    'ok',true,
    'published',false,
    'pending_approval',true,
    'approval_id',v_approval_id,
    'thread_id',p_thread_id
  );
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
  v_approval_id uuid;
begin
  if not private.is_customer_care_staff() then
    raise exception 'Customer Care chat permission required';
  end if;
  if p_status not in ('open','closed') then raise exception 'Unsupported chat status'; end if;

  select a.role into v_role
  from public.admin_users a
  where a.user_id=v_uid and a.status='active';

  select * into v_thread
  from public.customer_care_threads
  where id=p_thread_id
  for update;

  if not found then raise exception 'Chat not found'; end if;
  if v_role not in ('super_admin','admin') and v_thread.assigned_staff_id<>v_uid then
    raise exception 'This chat is assigned to another Customer Care officer';
  end if;

  if v_role in ('super_admin','admin') then
    update public.customer_care_threads
    set status=p_status,updated_at=now()
    where id=p_thread_id;

    return jsonb_build_object('ok',true,'published',true,'thread_id',p_thread_id,'status',p_status);
  end if;

  if exists(
    select 1 from public.customer_care_update_approvals q
    where q.thread_id=p_thread_id
      and q.proposed_by=v_uid
      and q.update_type='status'
      and q.proposed_status=p_status
      and q.approval_status='submitted'
  ) then
    raise exception 'This status update is already waiting for Admin approval';
  end if;

  insert into public.customer_care_update_approvals(
    thread_id,proposed_by,update_type,proposed_status
  )
  values(p_thread_id,v_uid,'status',p_status)
  returning id into v_approval_id;

  return jsonb_build_object(
    'ok',true,
    'published',false,
    'pending_approval',true,
    'approval_id',v_approval_id,
    'thread_id',p_thread_id,
    'status',p_status
  );
end
$function$;

create or replace function public.admin_list_support_update_approvals()
returns table(
  approval_id uuid,
  thread_id uuid,
  customer_id uuid,
  customer_name text,
  proposed_by uuid,
  proposed_by_name text,
  update_type text,
  proposed_body text,
  proposed_status text,
  approval_status text,
  admin_notes text,
  created_at timestamptz,
  reviewed_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not private.is_leogo_super_admin()
     and not exists(
       select 1 from public.admin_users a
       where a.user_id=(select auth.uid())
         and a.status='active'
         and a.role='admin'
     ) then
    raise exception 'Admin approval access required';
  end if;

  return query
  select
    q.id,
    q.thread_id,
    t.customer_id,
    coalesce(cp.full_name,'Customer'),
    q.proposed_by,
    coalesce(a.display_name,'Customer Care Officer'),
    q.update_type,
    q.proposed_body,
    q.proposed_status,
    q.approval_status,
    q.admin_notes,
    q.created_at,
    q.reviewed_at
  from public.customer_care_update_approvals q
  join public.customer_care_threads t on t.id=q.thread_id
  left join public.customer_profiles cp on cp.user_id=t.customer_id
  left join public.admin_users a on a.user_id=q.proposed_by
  order by
    case q.approval_status when 'submitted' then 0 when 'rejected' then 1 else 2 end,
    q.created_at desc;
end
$function$;

create or replace function public.admin_review_support_update(
  p_approval_id uuid,
  p_action text,
  p_admin_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_queue public.customer_care_update_approvals%rowtype;
  v_thread public.customer_care_threads%rowtype;
  v_message_id uuid;
begin
  if not private.is_leogo_super_admin()
     and not exists(
       select 1 from public.admin_users a
       where a.user_id=v_uid
         and a.status='active'
         and a.role='admin'
     ) then
    raise exception 'Admin approval access required';
  end if;

  if p_action not in ('approved','rejected') then
    raise exception 'Action must be approved or rejected';
  end if;
  if p_action='rejected' and nullif(btrim(coalesce(p_admin_notes,'')),'') is null then
    raise exception 'Add an Admin note before rejecting this update';
  end if;

  select * into v_queue
  from public.customer_care_update_approvals
  where id=p_approval_id
  for update;

  if not found then raise exception 'Pending Customer Care update not found'; end if;
  if v_queue.approval_status<>'submitted' then
    raise exception 'This Customer Care update has already been reviewed';
  end if;

  select * into v_thread
  from public.customer_care_threads
  where id=v_queue.thread_id
  for update;

  if p_action='approved' then
    if v_queue.update_type='message' then
      insert into public.customer_care_messages(thread_id,sender_id,sender_role,body)
      values(v_queue.thread_id,v_queue.proposed_by,'staff',v_queue.proposed_body)
      returning id into v_message_id;

      update public.customer_care_threads
      set status='open',
          last_message_at=now(),
          last_message_preview=left(v_queue.proposed_body,180),
          updated_at=now()
      where id=v_queue.thread_id;

      insert into public.customer_notifications(
        user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
      )
      values(
        v_thread.customer_id,'support','New Customer Care message',
        'LEOGO Customer Care sent you a new approved message.',
        'customer_care_message',v_message_id,'customer_care_message','chat',
        jsonb_build_object('thread_id',v_queue.thread_id,'message_id',v_message_id)
      );
    else
      update public.customer_care_threads
      set status=v_queue.proposed_status,
          updated_at=now()
      where id=v_queue.thread_id;

      insert into public.customer_notifications(
        user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
      )
      values(
        v_thread.customer_id,'support','Customer Care chat updated',
        case when v_queue.proposed_status='closed'
          then 'LEOGO Customer Care marked your conversation as resolved/closed.'
          else 'LEOGO Customer Care reopened your support conversation.'
        end,
        'customer_care_thread',v_queue.thread_id,
        'customer_care_status_'||v_queue.proposed_status,'chat',
        jsonb_build_object('thread_id',v_queue.thread_id,'status',v_queue.proposed_status)
      )
      on conflict(user_id,source_type,source_id,event_key)
      where source_id is not null
      do update set
        title=excluded.title,
        message=excluded.message,
        metadata=excluded.metadata,
        read_at=null,
        created_at=now();
    end if;
  end if;

  update public.customer_care_update_approvals
  set approval_status=p_action,
      admin_notes=nullif(btrim(coalesce(p_admin_notes,'')),''),
      reviewed_by=v_uid,
      reviewed_at=now(),
      updated_at=now()
  where id=p_approval_id;

  perform private.write_admin_audit(
    'support.chat.update.'||p_action,
    'customer_care_update_approval',
    p_approval_id::text,
    to_jsonb(v_queue),
    jsonb_build_object(
      'approval_status',p_action,
      'admin_notes',nullif(btrim(coalesce(p_admin_notes,'')),''),
      'message_id',v_message_id
    ),
    jsonb_build_object('thread_id',v_queue.thread_id,'update_type',v_queue.update_type)
  );

  return jsonb_build_object(
    'ok',true,
    'approval_id',p_approval_id,
    'approval_status',p_action,
    'message_id',v_message_id
  );
end
$function$;

revoke execute on function public.admin_list_support_update_approvals() from public,anon;
revoke execute on function public.admin_review_support_update(uuid,text,text) from public,anon;
grant execute on function public.admin_list_support_update_approvals() to authenticated;
grant execute on function public.admin_review_support_update(uuid,text,text) to authenticated;
