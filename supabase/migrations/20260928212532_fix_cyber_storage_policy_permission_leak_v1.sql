create or replace function private.can_read_cyber_order_storage(p_storage_path text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or nullif(btrim(coalesce(p_storage_path,'')),'') is null then
    return false;
  end if;

  if split_part(p_storage_path,'/',1)=v_uid::text then
    return true;
  end if;

  if private.is_leogo_admin('approvals.read') then
    return true;
  end if;

  return exists(
    select 1
    from public.cyber_order_files f
    join public.cyber_orders o on o.id=f.order_id
    where f.storage_path=p_storage_path
      and o.provider_id=v_uid
  );
end
$$;

revoke all on function private.can_read_cyber_order_storage(text) from public, anon;
grant execute on function private.can_read_cyber_order_storage(text) to authenticated;

drop policy if exists cyber_order_files_read_authorized on storage.objects;
create policy cyber_order_files_read_authorized
on storage.objects
for select
to authenticated
using (
  bucket_id='cyber-order-files'
  and private.can_read_cyber_order_storage(name)
);
