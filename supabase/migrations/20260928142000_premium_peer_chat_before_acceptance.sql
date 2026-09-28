-- Premium Profile <-> Premium Customer private chat.
-- Chat opens as soon as an active Premium Customer has submitted a meetup request.
-- Acceptance is NOT required for in-app messaging; acceptance still controls contact release.

alter table public.premium_meetup_requests
  add column if not exists customer_last_read_at timestamptz,
  add column if not exists profile_last_read_at timestamptz,
  add column if not exists last_message_at timestamptz,
  add column if not exists last_message_preview text;

create table if not exists public.premium_chat_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.premium_meetup_requests(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer','profile')),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists premium_chat_messages_request_created_idx
  on public.premium_chat_messages(request_id,created_at);

alter table public.premium_chat_messages enable row level security;
revoke all on table public.premium_chat_messages from public,anon,authenticated;

create or replace function public.premium_open_chat(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_request public.premium_meetup_requests%rowtype;
  v_role text;
  v_other_name text;
  v_other_photo text;
  v_unread integer:=0;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  select * into v_request
  from public.premium_meetup_requests
  where id=p_request_id;

  if not found then raise exception 'Premium meetup request not found'; end if;

  if v_request.customer_id=v_uid then
    v_role:='customer';
    if not private.premium_has_active_membership(v_uid) then
      raise exception 'An active Premium subscription is required to use Premium chat';
    end if;

    select p.display_name,p.profile_picture_path
    into v_other_name,v_other_photo
    from public.premium_profiles p
    where p.user_id=v_request.profile_user_id;

    select count(*)::integer into v_unread
    from public.premium_chat_messages m
    where m.request_id=v_request.id
      and m.sender_role='profile'
      and (v_request.customer_last_read_at is null or m.created_at>v_request.customer_last_read_at);

  elsif v_request.profile_user_id=v_uid then
    v_role:='profile';
    if not exists(
      select 1 from public.premium_profiles p
      where p.user_id=v_uid and p.application_status='approved'
    ) then
      raise exception 'Approved Premium Profile required';
    end if;

    select concat_ws(' · ','Premium Customer',nullif(c.sex,''),case when c.age is null then null else c.age::text||' years' end),
           c.profile_picture_path
    into v_other_name,v_other_photo
    from public.premium_customers c
    where c.user_id=v_request.customer_id;

    select count(*)::integer into v_unread
    from public.premium_chat_messages m
    where m.request_id=v_request.id
      and m.sender_role='customer'
      and (v_request.profile_last_read_at is null or m.created_at>v_request.profile_last_read_at);
  else
    raise exception 'You are not a participant in this Premium chat';
  end if;

  return jsonb_build_object(
    'request_id',v_request.id,
    'request_status',v_request.status,
    'viewer_role',v_role,
    'other_name',coalesce(v_other_name,'Premium User'),
    'other_photo_path',v_other_photo,
    'chat_enabled',v_request.status in ('submitted','accepted'),
    'contact_released',v_request.status='accepted',
    'unread_count',coalesce(v_unread,0),
    'last_message_at',v_request.last_message_at
  );
end;
$$;

revoke all on function public.premium_open_chat(uuid) from public,anon;
grant execute on function public.premium_open_chat(uuid) to authenticated;

create or replace function public.premium_list_chat_messages(p_request_id uuid)
returns table(message_id uuid,sender_role text,body text,created_at timestamptz)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_request public.premium_meetup_requests%rowtype;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  select * into v_request
  from public.premium_meetup_requests
  where id=p_request_id;

  if not found then raise exception 'Premium meetup request not found'; end if;
  if v_uid not in (v_request.customer_id,v_request.profile_user_id) then
    raise exception 'You are not a participant in this Premium chat';
  end if;

  if v_uid=v_request.customer_id
     and not private.premium_has_active_membership(v_uid) then
    raise exception 'An active Premium subscription is required to use Premium chat';
  end if;

  return query
  select m.id,m.sender_role,m.body,m.created_at
  from (
    select x.*
    from public.premium_chat_messages x
    where x.request_id=p_request_id
    order by x.created_at desc
    limit 300
  ) m
  order by m.created_at asc;
end;
$$;

revoke all on function public.premium_list_chat_messages(uuid) from public,anon;
grant execute on function public.premium_list_chat_messages(uuid) to authenticated;

create or replace function public.premium_send_chat_message(p_request_id uuid,p_body text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_request public.premium_meetup_requests%rowtype;
  v_body text:=btrim(coalesce(p_body,''));
  v_role text;
  v_message_id uuid;
  v_profile_name text;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if char_length(v_body)<1 then raise exception 'Write a message first'; end if;
  if char_length(v_body)>2000 then raise exception 'Message must be 2000 characters or fewer'; end if;

  select * into v_request
  from public.premium_meetup_requests
  where id=p_request_id
  for update;

  if not found then raise exception 'Premium meetup request not found'; end if;
  if v_request.status not in ('submitted','accepted') then
    raise exception 'This Premium chat is closed because the meetup request is no longer active';
  end if;

  if v_request.customer_id=v_uid then
    v_role:='customer';
    if not private.premium_has_active_membership(v_uid) then
      raise exception 'An active Premium subscription is required to use Premium chat';
    end if;
  elsif v_request.profile_user_id=v_uid then
    v_role:='profile';
    if not exists(
      select 1 from public.premium_profiles p
      where p.user_id=v_uid and p.application_status='approved'
    ) then
      raise exception 'Approved Premium Profile required';
    end if;
  else
    raise exception 'You are not a participant in this Premium chat';
  end if;

  insert into public.premium_chat_messages(request_id,sender_id,sender_role,body)
  values(v_request.id,v_uid,v_role,v_body)
  returning id into v_message_id;

  update public.premium_meetup_requests
  set last_message_at=now(),
      last_message_preview=left(v_body,180),
      customer_last_read_at=case when v_role='customer' then now() else customer_last_read_at end,
      profile_last_read_at=case when v_role='profile' then now() else profile_last_read_at end,
      updated_at=now()
  where id=v_request.id;

  if v_role='customer' then
    perform private.notify_partner(
      v_request.profile_user_id,'premium','premium_chat_message',
      'New Premium chat message','You have a new private message from a Premium Customer.',
      'premium_meetup_request',v_request.id,'premium-requests',
      jsonb_build_object('request_id',v_request.id,'chat',true)
    );
  else
    select p.display_name into v_profile_name
    from public.premium_profiles p
    where p.user_id=v_request.profile_user_id;

    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    ) values(
      v_request.customer_id,'premium','New Premium chat message',
      coalesce(v_profile_name,'Premium Profile')||' sent you a private message.',
      'premium_meetup_request',v_request.id,'premium_chat_message','premiumaccess',
      jsonb_build_object('request_id',v_request.id,'profile_user_id',v_request.profile_user_id,'chat',true)
    );
  end if;

  return jsonb_build_object('ok',true,'message_id',v_message_id,'request_id',v_request.id,'sender_role',v_role);
end;
$$;

revoke all on function public.premium_send_chat_message(uuid,text) from public,anon;
grant execute on function public.premium_send_chat_message(uuid,text) to authenticated;

create or replace function public.premium_mark_chat_read(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_request public.premium_meetup_requests%rowtype;
begin
  if v_uid is null then return; end if;

  select * into v_request
  from public.premium_meetup_requests
  where id=p_request_id;

  if not found then return; end if;

  if v_request.customer_id=v_uid then
    update public.premium_meetup_requests set customer_last_read_at=now() where id=p_request_id;
  elsif v_request.profile_user_id=v_uid then
    update public.premium_meetup_requests set profile_last_read_at=now() where id=p_request_id;
  end if;
end;
$$;

revoke all on function public.premium_mark_chat_read(uuid) from public,anon;
grant execute on function public.premium_mark_chat_read(uuid) to authenticated;
