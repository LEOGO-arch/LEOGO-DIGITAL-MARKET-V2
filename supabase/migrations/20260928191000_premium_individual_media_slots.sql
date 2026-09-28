-- Premium Partner individual media-slot replacement.
-- Existing media slots are overwritten in place by the client, so replacing a photo does not create a retained old file.
-- Empty gallery slots use this RPC to attach the newly uploaded media path.

create or replace function public.premium_partner_replace_media(
  p_slot text,
  p_media_path text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_slot text:=lower(btrim(coalesce(p_slot,'')));
  v_old_path text;
  v_sort smallint;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  if not exists(
    select 1 from public.premium_profiles p
    where p.user_id=v_uid and p.application_status='approved'
  ) then
    raise exception 'An approved Premium Profile is required';
  end if;

  if char_length(btrim(coalesce(p_media_path,'')))<3
     or p_media_path not like v_uid::text||'/%' then
    raise exception 'Invalid Premium media path';
  end if;

  if v_slot='profile' then
    select profile_picture_path into v_old_path
    from public.premium_profiles
    where user_id=v_uid
    for update;

    update public.premium_profiles
    set profile_picture_path=btrim(p_media_path),
        updated_at=now()
    where user_id=v_uid;

  elsif v_slot in ('gallery_1','gallery_2','gallery_3') then
    v_sort:=substring(v_slot from 'gallery_([123])')::smallint;

    select media_path into v_old_path
    from public.premium_profile_gallery
    where user_id=v_uid and sort_order=v_sort
    for update;

    insert into public.premium_profile_gallery(user_id,media_path,sort_order)
    values(v_uid,btrim(p_media_path),v_sort)
    on conflict(user_id,sort_order) do update
      set media_path=excluded.media_path;

  else
    raise exception 'Invalid Premium media slot';
  end if;

  if nullif(v_old_path,'') is not null
     and v_old_path is distinct from btrim(p_media_path) then
    insert into public.premium_media_cleanup_queue(user_id,media_path)
    values(v_uid,v_old_path)
    on conflict(user_id,media_path) do nothing;
  end if;

  return jsonb_build_object(
    'ok',true,
    'slot',v_slot,
    'old_path',v_old_path,
    'profile',public.premium_partner_get_own_profile()
  );
end;
$$;

revoke all on function public.premium_partner_replace_media(text,text) from public,anon;
grant execute on function public.premium_partner_replace_media(text,text) to authenticated;

drop policy if exists premium_profile_media_update_own on storage.objects;
create policy premium_profile_media_update_own
on storage.objects
for update to authenticated
using (
  bucket_id='premium-profile-media'
  and owner_id=(select auth.uid())::text
  and (storage.foldername(name))[1]=(select auth.uid())::text
)
with check (
  bucket_id='premium-profile-media'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);
