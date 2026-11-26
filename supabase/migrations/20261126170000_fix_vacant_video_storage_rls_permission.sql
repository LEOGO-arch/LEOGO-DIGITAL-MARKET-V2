-- Prevent private-document signing from evaluating property-table subqueries
-- under ordinary API roles. Keep property-video access rules in narrowly
-- scoped SECURITY DEFINER helpers; do not grant direct table reads.

create or replace function private.vacant_video_can_read(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    (
      (select auth.uid()) is not null
      and (select auth.uid())::text = split_part(coalesce(p_object_name, ''), '/', 1)
    )
    or exists (
      select 1
      from public.vacant_house_listings as listing
      where listing.video_path = p_object_name
        and listing.approval_status = 'approved'
        and listing.availability_status = 'vacant'
    )
    or private.is_leogo_admin('approvals.read');
$function$;

create or replace function private.vacant_video_can_delete(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    (select auth.uid()) is not null
    and (select auth.uid())::text = split_part(coalesce(p_object_name, ''), '/', 1)
    and not exists (
      select 1
      from public.vacant_house_listings as listing
      where listing.video_path = p_object_name
    );
$function$;

revoke all on function private.vacant_video_can_read(text) from public;
grant execute on function private.vacant_video_can_read(text) to anon, authenticated;

revoke all on function private.vacant_video_can_delete(text) from public;
grant execute on function private.vacant_video_can_delete(text) to authenticated;

drop policy if exists vacant_video_read_authorized on storage.objects;
create policy vacant_video_read_authorized
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'vacant-house-videos'
  and private.vacant_video_can_read(name)
);

drop policy if exists vacant_video_delete_owner on storage.objects;
create policy vacant_video_delete_owner
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'vacant-house-videos'
  and private.vacant_video_can_delete(name)
);
