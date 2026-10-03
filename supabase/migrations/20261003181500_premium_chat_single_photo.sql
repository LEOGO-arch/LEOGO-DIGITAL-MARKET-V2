-- Premium private chat: allow a single private photo attachment per message.
-- Text-only chat remains backward compatible. Photos are private and readable only
-- by the Premium Customer / Premium Profile participating in the meetup request.

alter table public.premium_chat_messages
  add column if not exists photo_path text;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'premium-chat-media',
  'premium-chat-media',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists premium_chat_media_participant_insert on storage.objects;
create policy premium_chat_media_participant_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id='premium-chat-media'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists(
    select 1
    from public.premium_meetup_requests r
    where r.id::text=(storage.foldername(name))[2]
      and (select auth.uid()) in (r.customer_id,r.profile_user_id)
      and r.status in ('submitted','accepted')
  )
);

drop policy if exists premium_chat_media_participant_read on storage.objects;
create policy premium_chat_media_participant_read
on storage.objects for select
to authenticated
using (
  bucket_id='premium-chat-media'
  and exists(
    select 1
    from public.premium_chat_messages m
    join public.premium_meetup_requests r on r.id=m.request_id
    where m.photo_path=name
      and (select auth.uid()) in (r.customer_id,r.profile_user_id)
  )
);

drop policy if exists premium_chat_media_sender_cleanup on storage.objects;
create policy premium_chat_media_sender_cleanup
on storage.objects for delete
to authenticated
using (
  bucket_id='premium-chat-media'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and not exists(
    select 1
    from public.premium_chat_messages m
    where m.photo_path=name
  )
);

drop function if exists public.premium_list_chat_messages(uuid);

create function public.premium_list_chat_messages(p_request_id uuid)
returns table(message_id uuid,sender_role text,body text,photo_path text,created_at timestamptz)
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
  select m.id,m.sender_role,m.body,m.photo_path,m.created_at
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

create or replace function public.premium_send_chat_message(
  p_request_id uuid,
  p_body text,
  p_photo_path text,
  p_photo_mime text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_request public.premium_meetup_requests%rowtype;
  v_body text:=btrim(coalesce(p_body,''));
  v_photo text:=nullif(btrim(coalesce(p_photo_path,'')),'');
  v_mime text:=lower(btrim(coalesce(p_photo_mime,'')));
  v_role text;
  v_message_id uuid;
  v_profile_name text;
  v_preview text;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if v_body='' and v_photo is null then raise exception 'Write a message or choose one photo'; end if;
  if char_length(v_body)>2000 then raise exception 'Message must be 2000 characters or fewer'; end if;
  if v_photo is not null and v_mime not in ('image/jpeg','image/png','image/webp') then
    raise exception 'Choose a JPG, PNG or WEBP photo';
  end if;

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

  if v_photo is not null then
    if (storage.foldername(v_photo))[1]<>v_uid::text
       or (storage.foldername(v_photo))[2]<>v_request.id::text
       or not exists(
         select 1
         from storage.objects so
         where so.bucket_id='premium-chat-media'
           and so.name=v_photo
           and so.owner_id=v_uid::text
       )
    then
      raise exception 'The selected Premium chat photo could not be verified';
    end if;
  end if;

  insert into public.premium_chat_messages(request_id,sender_id,sender_role,body,photo_path)
  values(v_request.id,v_uid,v_role,case when v_body='' then '[Photo]' else v_body end,v_photo)
  returning id into v_message_id;

  v_preview:=case
    when v_photo is not null and v_body='' then '📷 Photo'
    when v_photo is not null then '📷 '||left(v_body,170)
    else left(v_body,180)
  end;

  update public.premium_meetup_requests
  set last_message_at=now(),
      last_message_preview=v_preview,
      customer_last_read_at=case when v_role='customer' then now() else customer_last_read_at end,
      profile_last_read_at=case when v_role='profile' then now() else profile_last_read_at end,
      updated_at=now()
  where id=v_request.id;

  if v_role='customer' then
    perform private.notify_partner(
      v_request.profile_user_id,'premium','premium_chat_message',
      'New Premium chat message',
      case when v_photo is not null then 'A Premium Customer sent you a private photo/message.' else 'You have a new private message from a Premium Customer.' end,
      'premium_meetup_request',v_request.id,'premium-requests',
      jsonb_build_object('request_id',v_request.id,'chat',true,'photo',v_photo is not null)
    );
  else
    select p.display_name into v_profile_name
    from public.premium_profiles p
    where p.user_id=v_request.profile_user_id;

    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    ) values(
      v_request.customer_id,'premium','New Premium chat message',
      coalesce(v_profile_name,'Premium Profile')||
        case when v_photo is not null then ' sent you a private photo/message.' else ' sent you a private message.' end,
      'premium_meetup_request',v_request.id,'premium_chat_message','premiumaccess',
      jsonb_build_object('request_id',v_request.id,'profile_user_id',v_request.profile_user_id,'chat',true,'photo',v_photo is not null)
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'message_id',v_message_id,
    'request_id',v_request.id,
    'sender_role',v_role,
    'photo_attached',v_photo is not null
  );
end;
$$;

revoke all on function public.premium_send_chat_message(uuid,text,text,text) from public,anon;
grant execute on function public.premium_send_chat_message(uuid,text,text,text) to authenticated;

-- Backward-compatible text-only wrapper for older cached clients.
create or replace function public.premium_send_chat_message(p_request_id uuid,p_body text)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select public.premium_send_chat_message(p_request_id,p_body,null,null);
$$;

revoke all on function public.premium_send_chat_message(uuid,text) from public,anon;
grant execute on function public.premium_send_chat_message(uuid,text) to authenticated;
