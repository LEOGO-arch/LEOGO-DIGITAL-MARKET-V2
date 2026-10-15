-- Accept the latest published agreement before a partner application is submitted.
-- Acceptance is linked to the authenticated user, not a pre-existing partner row.
create or replace function public.leogo_accept_partner_terms(p_partner_type text,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $fn$
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if p_partner_type not in ('seller','service_provider','transport','pickup_station','accommodation','cyber','premium') then
   raise exception 'Unsupported partner category';
 end if;
 if not exists (
   select 1 from public.leogo_partner_terms t
   where t.partner_type=p_partner_type and t.version=p_version
     and t.effective_at <= now()
     and t.version=(select max(version) from public.leogo_partner_terms where partner_type=p_partner_type and effective_at<=now())
 ) then raise exception 'Terms have changed or are not yet effective; please refresh'; end if;
 insert into public.leogo_partner_terms_acceptances(partner_type,version,user_id)
 values(p_partner_type,p_version,auth.uid()) on conflict do nothing;
 return jsonb_build_object('ok',true,'version',p_version);
end;$fn$;
revoke all on function public.leogo_accept_partner_terms(text,integer) from public,anon;
grant execute on function public.leogo_accept_partner_terms(text,integer) to authenticated;

-- Prevent an upcoming version from appearing as already effective.
create or replace function public.leogo_get_partner_terms(p_partner_type text)
returns jsonb language sql stable security definer set search_path='' as $fn$
 select (select jsonb_build_object('partner_type',t.partner_type,'version',t.version,'terms_text',t.terms_text,'effective_at',t.effective_at,
  'accepted',exists(select 1 from public.leogo_partner_terms_acceptances a
     where a.partner_type=t.partner_type and a.version=t.version and a.user_id=auth.uid()))
 from public.leogo_partner_terms t
 where t.partner_type=p_partner_type and t.effective_at<=now()
 order by t.version desc limit 1)
 where auth.uid() is not null;
$fn$;
revoke all on function public.leogo_get_partner_terms(text) from public,anon;
grant execute on function public.leogo_get_partner_terms(text) to authenticated;
