
-- Harden Loans V2: submissions only through validated RPC and prevent deletion of referenced evidence.

drop policy if exists "Customers submit own loan applications" on public.wallet_loan_applications;
revoke insert,update,delete on public.wallet_loan_applications from authenticated;

create or replace function private.loan_private_document_is_referenced(p_path text)
returns boolean
language sql
stable security definer
set search_path=''
as $function$
  select exists(
    select 1 from public.wallet_loan_applications a
    where p_path in (a.identity_front_path,a.identity_back_path,a.applicant_passport_photo_path)
    union all
    select 1 from public.wallet_loan_asset_collateral c
    where c.ownership_proof_path=p_path
  );
$function$;

create or replace function private.loan_asset_media_is_referenced(p_path text)
returns boolean
language sql
stable security definer
set search_path=''
as $function$
  select exists(
    select 1 from public.wallet_loan_asset_collateral c
    where p_path=any(c.asset_photo_paths)
       or p_path=any(c.received_photo_paths)
       or p_path=any(c.inspection_photo_paths)
       or c.release_photo_path=p_path
  );
$function$;

revoke execute on function private.loan_private_document_is_referenced(text) from public,anon,authenticated;
revoke execute on function private.loan_asset_media_is_referenced(text) from public,anon,authenticated;

drop policy if exists "Loan customer deletes own private documents" on storage.objects;
create policy "Loan customer deletes unreferenced private documents" on storage.objects
for delete to authenticated
using(
  bucket_id='loan-private-documents'
  and (storage.foldername(name))[1]=auth.uid()::text
  and not private.loan_private_document_is_referenced(name)
);

drop policy if exists "Loan users delete own asset media" on storage.objects;
create policy "Loan users delete unreferenced asset media" on storage.objects
for delete to authenticated
using(
  bucket_id='loan-asset-media'
  and (storage.foldername(name))[1]=auth.uid()::text
  and not private.loan_asset_media_is_referenced(name)
);
