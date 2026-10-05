-- Prevent unrelated Premium storage reads from failing on restricted chat tables.
-- Storage policies must not reference premium_chat_messages directly because authenticated
-- users intentionally have no direct table privileges on private Premium chat messages.

create or replace function private.current_user_can_upload_premium_chat_media(
  p_object_name text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select
    auth.uid() is not null
    and (storage.foldername(p_object_name))[1]=auth.uid()::text
    and exists(
      select 1
      from public.premium_meetup_requests r
      where r.id::text=(storage.foldername(p_object_name))[2]
        and auth.uid() in (r.customer_id,r.profile_user_id)
        and r.status in ('submitted','accepted')
    );
$$;

create or replace function private.current_user_can_read_premium_chat_media(
  p_object_name text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.premium_chat_messages m
    join public.premium_meetup_requests r on r.id=m.request_id
    where m.photo_path=p_object_name
      and auth.uid() in (r.customer_id,r.profile_user_id)
  );
$$;

create or replace function private.premium_chat_media_is_referenced(
  p_object_name text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.premium_chat_messages m
    where m.photo_path=p_object_name
  );
$$;

revoke all on function private.current_user_can_upload_premium_chat_media(text) from public,anon;
revoke all on function private.current_user_can_read_premium_chat_media(text) from public,anon;
revoke all on function private.premium_chat_media_is_referenced(text) from public,anon;

grant execute on function private.current_user_can_upload_premium_chat_media(text) to authenticated;
grant execute on function private.current_user_can_read_premium_chat_media(text) to authenticated;
grant execute on function private.premium_chat_media_is_referenced(text) to authenticated;

drop policy if exists premium_chat_media_participant_insert on storage.objects;
create policy premium_chat_media_participant_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id='premium-chat-media'
  and private.current_user_can_upload_premium_chat_media(name)
);

drop policy if exists premium_chat_media_participant_read on storage.objects;
create policy premium_chat_media_participant_read
on storage.objects for select
to authenticated
using (
  bucket_id='premium-chat-media'
  and private.current_user_can_read_premium_chat_media(name)
);

drop policy if exists premium_chat_media_sender_cleanup on storage.objects;
create policy premium_chat_media_sender_cleanup
on storage.objects for delete
to authenticated
using (
  bucket_id='premium-chat-media'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and not private.premium_chat_media_is_referenced(name)
);
