
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
  where customer_id=v_uid;

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

revoke execute on function public.customer_support_chat_summary() from public,anon;
grant execute on function public.customer_support_chat_summary() to authenticated;
