-- Allow the assigned seller to view only evidence for their own aftersales cases.
-- SECURITY DEFINER isolates the check from storage.objects RLS evaluation.
create or replace function private.can_seller_read_aftersales_photo(p_path text)
returns boolean language sql stable security definer set search_path='' as $fn$
 select (select auth.uid()) is not null and exists (
   select 1 from public.marketplace_aftersales_cases c
   join public.marketplace_aftersales_negotiations n on n.case_id=c.id
   where c.evidence_path=p_path and n.seller_id=(select auth.uid())
 )
$fn$;
revoke all on function private.can_seller_read_aftersales_photo(text) from public,anon;
grant execute on function private.can_seller_read_aftersales_photo(text) to authenticated;
drop policy if exists "Assigned sellers view customer aftersales evidence" on storage.objects;
create policy "Assigned sellers view customer aftersales evidence"
on storage.objects for select to authenticated
using (bucket_id='marketplace-aftersales-evidence' and private.can_seller_read_aftersales_photo(name));