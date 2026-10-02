-- Secure Storage helper for Assisted Shopping attachments.
-- Avoid direct RLS-table reads inside the storage.objects policy.

create or replace function private.can_access_assisted_shopping_file(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists(
    select 1
    from public.assisted_shopping_files f
    where f.storage_path=p_storage_path
      and private.can_access_assisted_shopping_request(f.request_id)
  );
$function$;

revoke execute on function private.can_access_assisted_shopping_file(text)
  from public,anon;
grant execute on function private.can_access_assisted_shopping_file(text)
  to authenticated;

drop policy if exists assisted_shopping_files_read_authorized on storage.objects;
create policy assisted_shopping_files_read_authorized
on storage.objects for select to authenticated
using(
  bucket_id='assisted-shopping-files'
  and (
    split_part(name,'/',1)=(select auth.uid())::text
    or private.can_access_assisted_shopping_file(name)
  )
);
