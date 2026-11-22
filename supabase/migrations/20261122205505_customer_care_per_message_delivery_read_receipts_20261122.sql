-- Track delivery and read state per individual Customer Care chat message.
alter table public.customer_care_messages
  add column if not exists delivered_at timestamptz not null default now(),
  add column if not exists read_at timestamptz;

update public.customer_care_messages m
set delivered_at=coalesce(m.delivered_at,m.created_at,now())
where m.delivered_at is null;

update public.customer_care_messages m
set read_at=t.staff_last_read_at
from public.customer_care_threads t
where t.id=m.thread_id
  and m.sender_role='customer'
  and m.read_at is null
  and t.staff_last_read_at is not null
  and m.created_at<=t.staff_last_read_at;

update public.customer_care_messages m
set read_at=t.customer_last_read_at
from public.customer_care_threads t
where t.id=m.thread_id
  and m.sender_role='staff'
  and m.read_at is null
  and t.customer_last_read_at is not null
  and m.created_at<=t.customer_last_read_at;

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
  v_opened_at timestamptz:=now();
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

  update public.customer_care_messages m
  set delivered_at=coalesce(m.delivered_at,v_opened_at),
      read_at=coalesce(m.read_at,v_opened_at)
  where m.thread_id=p_thread_id and m.sender_role='customer'
    and m.id in (
      select x.id from public.customer_care_messages x
      where x.thread_id=p_thread_id
      order by x.created_at desc limit 300
    );

  if v_thread.assigned_staff_id=v_uid then
    update public.customer_care_threads
    set staff_last_read_at=v_opened_at
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

create or replace function public.customer_mark_support_chat_thread_read(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_read_at timestamptz:=now();
begin
  if v_uid is null then raise exception 'Login required'; end if;

  update public.customer_care_threads
  set customer_last_read_at=v_read_at
  where id=p_thread_id and customer_id=v_uid;

  if not found then raise exception 'Support conversation not found'; end if;

  update public.customer_care_messages m
  set delivered_at=coalesce(m.delivered_at,v_read_at),
      read_at=coalesce(m.read_at,v_read_at)
  where m.thread_id=p_thread_id and m.sender_role='staff'
    and m.id in (
      select x.id from public.customer_care_messages x
      where x.thread_id=p_thread_id
      order by x.created_at desc limit 300
    );
end
$function$;

create or replace function public.customer_list_support_message_receipts(p_thread_id uuid)
returns table(message_id uuid,delivered_at timestamptz,read_at timestamptz)
language plpgsql
security definer
set search_path=''
as $function$
declare v_uid uuid:=(select auth.uid());
begin
  if v_uid is null then raise exception 'Login required'; end if;
  if not exists(
    select 1 from public.customer_care_threads t
    where t.id=p_thread_id and t.customer_id=v_uid
  ) then
    raise exception 'Support conversation not found';
  end if;

  return query
  select m.id,m.delivered_at,m.read_at
  from public.customer_care_messages m
  where m.thread_id=p_thread_id and m.sender_role='customer'
  order by m.created_at asc;
end
$function$;

revoke all on function public.staff_list_support_messages(uuid) from public,anon;
grant execute on function public.staff_list_support_messages(uuid) to authenticated;
revoke all on function public.customer_mark_support_chat_thread_read(uuid) from public,anon;
grant execute on function public.customer_mark_support_chat_thread_read(uuid) to authenticated;
revoke all on function public.customer_list_support_message_receipts(uuid) from public,anon;
grant execute on function public.customer_list_support_message_receipts(uuid) to authenticated;
