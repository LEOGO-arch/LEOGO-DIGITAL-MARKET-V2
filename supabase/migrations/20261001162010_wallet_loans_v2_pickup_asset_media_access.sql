
create or replace function private.pickup_partner_can_read_loan_asset_media(p_path text)
returns boolean
language sql
stable security definer
set search_path=''
as $function$
  select exists(
    select 1
    from public.wallet_loan_asset_collateral c
    where c.pickup_station_id=private.pickup_partner_station_id()
      and (
        p_path=any(c.asset_photo_paths)
        or p_path=any(c.received_photo_paths)
        or p_path=any(c.inspection_photo_paths)
        or c.release_photo_path=p_path
      )
  );
$function$;

revoke execute on function private.pickup_partner_can_read_loan_asset_media(text) from public,anon,authenticated;

drop policy if exists "Assigned pickup station reads loan asset media" on storage.objects;
create policy "Assigned pickup station reads loan asset media" on storage.objects
for select to authenticated
using(
  bucket_id='loan-asset-media'
  and private.pickup_partner_can_read_loan_asset_media(name)
);
