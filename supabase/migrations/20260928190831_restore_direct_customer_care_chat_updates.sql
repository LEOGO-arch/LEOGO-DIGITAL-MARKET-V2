
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

drop function if exists public.admin_review_support_update(uuid,text,text);
drop function if exists public.admin_list_support_update_approvals();
drop table if exists public.customer_care_update_approvals;

grant execute on function public.staff_send_support_message(uuid,text) to authenticated;
grant execute on function public.staff_set_support_thread_status(uuid,text) to authenticated;
