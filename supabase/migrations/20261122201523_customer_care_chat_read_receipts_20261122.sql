-- Let each customer see whether Customer Care has read the latest message in each private conversation.
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
    'thread_id',t.id,
    'status',t.status,
    'assigned_staff_name',a.display_name,
    'created_at',t.created_at,
    'last_message_at',t.last_message_at,
    'last_message_preview',t.last_message_preview,
    'staff_last_read_at',t.staff_last_read_at,
    'last_customer_message_at',customer_message.last_customer_message_at
  ) order by t.created_at desc,t.id desc),'[]'::jsonb)
  into v_threads
  from public.customer_care_threads t
  left join public.admin_users a on a.user_id=t.assigned_staff_id
  left join lateral (
    select max(m.created_at) as last_customer_message_at
    from public.customer_care_messages m
    where m.thread_id=t.id and m.sender_role='customer'
  ) customer_message on true
  where t.customer_id=v_uid;

  return v_threads;
end
$function$;

revoke all on function public.customer_list_support_chat_threads() from public,anon;
grant execute on function public.customer_list_support_chat_threads() to authenticated;
