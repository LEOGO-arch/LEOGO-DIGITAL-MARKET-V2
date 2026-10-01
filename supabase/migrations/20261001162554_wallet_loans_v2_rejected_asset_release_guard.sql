
create or replace function private.validate_wallet_loan_asset_collateral()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_asset_unique integer;
  v_received_unique integer;
  v_inspection_unique integer;
begin
  select count(distinct x) into v_asset_unique from unnest(coalesce(new.asset_photo_paths,'{}'::text[])) x;
  if v_asset_unique < 4 or cardinality(coalesce(new.asset_photo_paths,'{}'::text[])) > 8 then
    raise exception 'Asset collateral requires 4 to 8 unique submitted photos';
  end if;

  select count(distinct x) into v_received_unique from unnest(coalesce(new.received_photo_paths,'{}'::text[])) x;
  select count(distinct x) into v_inspection_unique from unnest(coalesce(new.inspection_photo_paths,'{}'::text[])) x;

  if new.custody_status in ('received','stored','return_required','release_ready','released','recovery_review','sale_authorized','sold')
     and v_received_unique < 1 then
    raise exception 'Asset receiving evidence is required before this custody stage';
  end if;

  if (
       new.custody_status in ('stored','release_ready','recovery_review','sale_authorized','sold')
       or (new.custody_status='released' and new.inspected_at is not null)
     )
     and v_inspection_unique < 2 then
    raise exception 'At least two unique inspection photos are required before secure storage';
  end if;

  if new.custody_status='released' and nullif(btrim(coalesce(new.release_photo_path,'')),'') is null then
    raise exception 'Release evidence photo is required';
  end if;

  return new;
end
$function$;

revoke execute on function private.validate_wallet_loan_asset_collateral() from public,anon,authenticated;
