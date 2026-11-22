-- Allow customers to start another private support thread without deleting history.
alter table public.customer_care_threads
  drop constraint if exists customer_care_threads_customer_id_key;

create index if not exists customer_care_threads_customer_recent_idx
  on public.customer_care_threads(customer_id,created_at desc);

create or replace function public.customer_start_support_chat()
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
begin
  if v_uid is null then raise exception 'Login required'; end if;

  insert into public.customer_care_threads(customer_id,status)
  values(v_uid,'waiting')
  returning * into v_thread;

  perform private.try_assign_customer_care_thread(v_thread.id);
  select * into v_thread from public.customer_care_threads where id=v_thread.id;
  select a.display_name into v_agent_name from public.admin_users a where a.user_id=v_thread.assigned_staff_id;
  select cp.full_name into v_customer_name from public.customer_profiles cp where cp.user_id=v_uid;

  return jsonb_build_object(
    'exists',true,'thread_id',v_thread.id,'status',v_thread.status,
    'assigned_staff_id',v_thread.assigned_staff_id,'assigned_staff_name',v_agent_name,
    'customer_name',coalesce(v_customer_name,'Customer'),'last_message_at',v_thread.last_message_at,
    'unread_count',0,'created_at',v_thread.created_at
  );
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

  select * into v_thread
  from public.customer_care_threads
  where customer_id=v_uid
  order by created_at desc,id desc
  limit 1;
  if not found then return jsonb_build_object('exists',false); end if;

  if v_thread.assigned_staff_id is null
     or not exists(
       select 1 from public.admin_users a
       where a.user_id=v_thread.assigned_staff_id and a.status='active'
         and (a.role in ('super_admin','admin','support') or 'support.chat'=any(a.permissions))
     ) then
    perform private.try_assign_customer_care_thread(v_thread.id);
    select * into v_thread from public.customer_care_threads where id=v_thread.id;
  end if;

  select a.display_name into v_agent_name from public.admin_users a where a.user_id=v_thread.assigned_staff_id;
  select cp.full_name into v_customer_name from public.customer_profiles cp where cp.user_id=v_uid;
  select count(*)::integer into v_unread
  from public.customer_care_messages m
  where m.thread_id=v_thread.id and m.sender_role='staff'
    and (v_thread.customer_last_read_at is null or m.created_at>v_thread.customer_last_read_at);

  return jsonb_build_object(
    'exists',true,'thread_id',v_thread.id,'status',v_thread.status,
    'assigned_staff_id',v_thread.assigned_staff_id,'assigned_staff_name',v_agent_name,
    'customer_name',coalesce(v_customer_name,'Customer'),'last_message_at',v_thread.last_message_at,
    'unread_count',coalesce(v_unread,0),'created_at',v_thread.created_at
  );
end
$function$;

create or replace function public.customer_get_support_chat_thread(p_thread_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_thread public.customer_care_threads%rowtype;
  v_agent_name text;
  v_unread integer;
begin
  if v_uid is null then raise exception 'Login required'; end if;
  select * into v_thread from public.customer_care_threads
  where id=p_thread_id and customer_id=v_uid;
  if not found then raise exception 'Support conversation not found'; end if;
  select a.display_name into v_agent_name from public.admin_users a where a.user_id=v_thread.assigned_staff_id;
  select count(*)::integer into v_unread from public.customer_care_messages m
  where m.thread_id=v_thread.id and m.sender_role='staff'
    and (v_thread.customer_last_read_at is null or m.created_at>v_thread.customer_last_read_at);
  return jsonb_build_object(
    'exists',true,'thread_id',v_thread.id,'status',v_thread.status,
    'assigned_staff_id',v_thread.assigned_staff_id,'assigned_staff_name',v_agent_name,
    'last_message_at',v_thread.last_message_at,'unread_count',coalesce(v_unread,0),
    'created_at',v_thread.created_at
  );
end
$function$;

create or replace function public.customer_list_support_chat_threads()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_threads jsonb;
begin
  if v_uid is null then raise exception 'Login required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'thread_id',t.id,'status',t.status,'assigned_staff_name',a.display_name,
    'created_at',t.created_at,'last_message_at',t.last_message_at,
    'last_message_preview',t.last_message_preview
  ) order by t.created_at desc,t.id desc),'[]'::jsonb)
  into v_threads
  from public.customer_care_threads t
  left join public.admin_users a on a.user_id=t.assigned_staff_id
  where t.customer_id=v_uid;
  return v_threads;
end
$function$;

create or replace function public.customer_list_support_messages_for_thread(p_thread_id uuid)
returns table(message_id uuid,sender_role text,body text,created_at timestamptz)
language plpgsql
security definer
set search_path=''
as $function$
declare v_uid uuid:=(select auth.uid());
begin
  if v_uid is null then raise exception 'Login required'; end if;
  if not exists(select 1 from public.customer_care_threads t where t.id=p_thread_id and t.customer_id=v_uid) then
    raise exception 'Support conversation not found';
  end if;
  return query
  select m.id,m.sender_role,m.body,m.created_at
  from (
    select x.* from public.customer_care_messages x
    where x.thread_id=p_thread_id order by x.created_at desc limit 300
  ) m order by m.created_at asc;
end
$function$;

create or replace function public.customer_send_support_message_to_thread(p_thread_id uuid,p_body text)
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
  select * into v_thread from public.customer_care_threads
  where id=p_thread_id and customer_id=v_uid for update;
  if not found then raise exception 'Support conversation not found'; end if;
  if v_thread.status='closed' then raise exception 'This conversation is closed. Start a new conversation to contact Customer Care.'; end if;

  v_agent=private.try_assign_customer_care_thread(v_thread.id);
  insert into public.customer_care_messages(thread_id,sender_id,sender_role,body)
  values(v_thread.id,v_uid,'customer',v_body) returning id into v_message_id;
  update public.customer_care_threads
  set status=case when coalesce(v_agent,assigned_staff_id) is null then 'waiting' else 'open' end,
      last_message_at=now(),last_message_preview=left(v_body,180),updated_at=now()
  where id=v_thread.id;
  return jsonb_build_object('ok',true,'thread_id',v_thread.id,'message_id',v_message_id,
    'assigned_staff_id',coalesce(v_agent,v_thread.assigned_staff_id));
end
$function$;

create or replace function public.customer_mark_support_chat_thread_read(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare v_uid uuid:=(select auth.uid());
begin
  if v_uid is null then raise exception 'Login required'; end if;
  update public.customer_care_threads set customer_last_read_at=now()
  where id=p_thread_id and customer_id=v_uid;
end
$function$;

create or replace function public.customer_list_support_messages()
returns table(message_id uuid,sender_role text,body text,created_at timestamptz)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_thread_id uuid;
begin
  if v_uid is null then raise exception 'Login required'; end if;
  select t.id into v_thread_id from public.customer_care_threads t
  where t.customer_id=v_uid order by t.created_at desc,t.id desc limit 1;
  if v_thread_id is null then return; end if;
  return query
  select m.message_id,m.sender_role,m.body,m.created_at
  from public.customer_list_support_messages_for_thread(v_thread_id) m;
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
  v_thread_id uuid;
  v_thread public.customer_care_threads%rowtype;
  v_body text:=btrim(coalesce(p_body,''));
begin
  if v_uid is null then raise exception 'Login required'; end if;
  if char_length(v_body)<1 then raise exception 'Write a message first'; end if;
  if char_length(v_body)>2000 then raise exception 'Message must be 2000 characters or fewer'; end if;
  select t.id into v_thread_id from public.customer_care_threads t
  where t.customer_id=v_uid and t.status<>'closed'
  order by t.created_at desc,t.id desc limit 1;
  if v_thread_id is null then
    select (public.customer_start_support_chat()->>'thread_id')::uuid into v_thread_id;
  end if;
  return public.customer_send_support_message_to_thread(v_thread_id,v_body);
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
  v_thread_id uuid;
begin
  if v_uid is null then return; end if;
  select t.id into v_thread_id from public.customer_care_threads t
  where t.customer_id=v_uid order by t.created_at desc,t.id desc limit 1;
  if v_thread_id is not null then perform public.customer_mark_support_chat_thread_read(v_thread_id); end if;
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
  if v_uid is null then return jsonb_build_object('exists',false,'unread_count',0); end if;
  select * into v_thread from public.customer_care_threads t
  where t.customer_id=v_uid order by t.created_at desc,t.id desc limit 1;
  if not found then return jsonb_build_object('exists',false,'unread_count',0); end if;
  select a.display_name into v_agent_name from public.admin_users a where a.user_id=v_thread.assigned_staff_id;
  select count(*)::integer into v_unread from public.customer_care_messages m
  where m.thread_id=v_thread.id and m.sender_role='staff'
    and (v_thread.customer_last_read_at is null or m.created_at>v_thread.customer_last_read_at);
  return jsonb_build_object('exists',true,'thread_id',v_thread.id,'status',v_thread.status,
    'assigned_staff_id',v_thread.assigned_staff_id,'assigned_staff_name',v_agent_name,
    'last_message_at',v_thread.last_message_at,'unread_count',coalesce(v_unread,0));
end
$function$;

revoke all on function public.customer_start_support_chat() from public,anon;
revoke all on function public.customer_get_support_chat_thread(uuid) from public,anon;
revoke all on function public.customer_list_support_chat_threads() from public,anon;
revoke all on function public.customer_list_support_messages_for_thread(uuid) from public,anon;
revoke all on function public.customer_send_support_message_to_thread(uuid,text) from public,anon;
revoke all on function public.customer_mark_support_chat_thread_read(uuid) from public,anon;
grant execute on function public.customer_start_support_chat() to authenticated;
grant execute on function public.customer_get_support_chat_thread(uuid) to authenticated;
grant execute on function public.customer_list_support_chat_threads() to authenticated;
grant execute on function public.customer_list_support_messages_for_thread(uuid) to authenticated;
grant execute on function public.customer_send_support_message_to_thread(uuid,text) to authenticated;
grant execute on function public.customer_mark_support_chat_thread_read(uuid) to authenticated;
