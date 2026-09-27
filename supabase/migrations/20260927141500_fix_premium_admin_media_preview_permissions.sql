-- Fix Premium Admin media preview permission errors.
-- Storage RLS now uses SECURITY DEFINER helpers rather than querying restricted consent tables directly.

create or replace function private.current_user_has_premium_access_consent()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.premium_access_consents c
    where c.user_id=auth.uid()
      and c.age_confirmed=true
      and c.responsibility_confirmed=true
  );
$$;

revoke all on function private.current_user_has_premium_access_consent() from public,anon;
grant execute on function private.current_user_has_premium_access_consent() to authenticated;

create or replace function private.current_user_can_read_premium_profile_media(
  p_object_name text,
  p_owner_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select
    p_owner_id=auth.uid()::text
    or private.is_leogo_admin('premium.read')
    or private.is_leogo_admin('data.read')
    or (
      private.current_user_has_premium_access_consent()
      and exists(
        select 1
        from public.premium_profiles p
        where p.application_status='approved'
          and p.is_available=true
          and p.profile_picture_path=p_object_name
      )
    )
    or (
      private.current_user_has_active_premium_membership()
      and exists(
        select 1
        from public.premium_profile_gallery g
        join public.premium_profiles p on p.user_id=g.user_id
        where p.application_status='approved'
          and p.is_available=true
          and g.media_path=p_object_name
      )
    )
    or exists(
      select 1
      from public.premium_meetup_requests r
      join public.premium_customers c on c.user_id=r.customer_id
      where r.profile_user_id=auth.uid()
        and c.profile_picture_path=p_object_name
    );
$$;

revoke all on function private.current_user_can_read_premium_profile_media(text,text) from public,anon;
grant execute on function private.current_user_can_read_premium_profile_media(text,text) to authenticated;

drop policy if exists premium_profile_media_select_scoped on storage.objects;
create policy premium_profile_media_select_scoped
on storage.objects
for select to authenticated
using (
  bucket_id='premium-profile-media'
  and private.current_user_can_read_premium_profile_media(name,owner_id)
);

drop policy if exists premium_storage_select_active_admin on storage.objects;
create policy premium_storage_select_active_admin
on storage.objects
for select to authenticated
using (
  bucket_id=any(array['premium-profile-media'::text,'premium-verification'::text])
  and (
    private.is_leogo_admin('premium.read')
    or private.is_leogo_admin('data.read')
  )
);