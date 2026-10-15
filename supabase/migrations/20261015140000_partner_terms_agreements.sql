create table if not exists public.leogo_partner_terms (
 partner_type text not null check(partner_type in ('seller','service_provider','transport','pickup_station','accommodation','cyber','premium')),
 version integer not null check(version>0),terms_text text not null check(length(btrim(terms_text)) between 40 and 30000),
 effective_at timestamptz not null default now(),updated_by uuid,created_at timestamptz not null default now(),
 primary key(partner_type,version)
);
create table if not exists public.leogo_partner_terms_acceptances(
 partner_type text not null,version integer not null,user_id uuid not null references auth.users(id),
 accepted_at timestamptz not null default now(),
 primary key(partner_type,version,user_id),
 foreign key(partner_type,version) references public.leogo_partner_terms(partner_type,version)
);
alter table public.leogo_partner_terms enable row level security;
alter table public.leogo_partner_terms_acceptances enable row level security;
revoke all on public.leogo_partner_terms,public.leogo_partner_terms_acceptances from public,anon,authenticated;
insert into public.leogo_partner_terms(partner_type,version,terms_text)
values('seller',1,'SELLER RESPONSIBILITIES
1. Qualified sellers must provide accurate business details and all applicable permits and licences relating to the products they sell.
2. Sellers must keep product prices accurate and up to date. Sellers are responsible for pricing errors and underpricing displayed on the LEOGO customer website, subject to applicable law and case review.
3. Sellers must ensure that inventory quantities shown in LEOGO match physical stock availability.
4. Dispatching incorrect, counterfeit, unlawful or misrepresented products is prohibited. Sellers are responsible for substantiated breaches and resulting disputes as permitted by law.
5. Sellers must promptly acknowledge and dispatch orders after receiving them.
6. Sellers authorize LEOGO to deduct agreed commissions and applicable disclosed fees from sales or settlements in accordance with the seller agreement.
7. Sellers must renew any applicable subscription plan before expiry to avoid interruption or deactivation of product listings.
8. Sellers must cooperate with Aftersales, returns and refund resolutions when responsibility is established on their side under the applicable policy.
9. Sellers must correctly pack and prepare each order, mark it ready for rider collection in the system, and arrange handover without unnecessary delay.

LEOGO RESPONSIBILITIES
1. LEOGO will market the platform and take reasonable steps to maintain system availability and support.
2. LEOGO will coordinate timely delivery after sellers mark orders ready and hand parcels over, subject to courier operations and circumstances outside LEOGO''s control.
3. LEOGO will aim to remit eligible, verified customer payments within 48 hours of the applicable settlement trigger, subject to payment verification, holds, disputes, payment-provider delays and applicable law.

COMPLIANCE
Violations may result in investigation, suspension, termination of partner access, recovery of substantiated losses, or legal action where warranted by law and the applicable agreement.')
on conflict do nothing;
create or replace function public.leogo_get_partner_terms(p_partner_type text)
returns jsonb language sql stable security definer set search_path='' as $fn$
select (select jsonb_build_object('partner_type',t.partner_type,'version',t.version,'terms_text',t.terms_text,'effective_at',t.effective_at,
 'accepted',exists(select 1 from public.leogo_partner_terms_acceptances a
 where a.partner_type=t.partner_type and a.version=t.version and a.user_id=auth.uid()))
 from public.leogo_partner_terms t where t.partner_type=p_partner_type order by t.version desc limit 1)
where auth.uid() is not null;
$fn$;
create or replace function public.leogo_accept_partner_terms(p_partner_type text,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $fn$
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 if p_partner_type='seller' and not exists(select 1 from public.seller_accounts where user_id=auth.uid()) then raise exception 'Seller account required';end if;
 if not exists(select 1 from public.leogo_partner_terms where partner_type=p_partner_type and version=p_version
 and version=(select max(version) from public.leogo_partner_terms where partner_type=p_partner_type)) then raise exception 'Terms updated; refresh before accepting';end if;
 insert into public.leogo_partner_terms_acceptances(partner_type,version,user_id)
 values(p_partner_type,p_version,auth.uid()) on conflict do nothing;
 return jsonb_build_object('ok',true,'version',p_version);
end;$fn$;
create or replace function public.leogo_admin_publish_partner_terms(p_partner_type text,p_terms text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_version integer;
begin
 if not private.is_leogo_admin('settings.manage') then raise exception 'Settings management permission required';end if;
 if p_partner_type not in ('seller','service_provider','transport','pickup_station','accommodation','cyber','premium')
 or length(btrim(coalesce(p_terms,''))) not between 40 and 30000 then raise exception 'Choose a valid partner type and provide terms (40–30000 characters)';end if;
 perform pg_advisory_xact_lock(hashtext('leogo_partner_terms:'||p_partner_type));
 select coalesce(max(version),0)+1 into v_version from public.leogo_partner_terms where partner_type=p_partner_type;
 insert into public.leogo_partner_terms(partner_type,version,terms_text,updated_by)
 values(p_partner_type,v_version,btrim(p_terms),auth.uid());
 return jsonb_build_object('ok',true,'version',v_version);
end;$fn$;
revoke all on function public.leogo_get_partner_terms(text),public.leogo_accept_partner_terms(text,integer),public.leogo_admin_publish_partner_terms(text,text) from public,anon;
grant execute on function public.leogo_get_partner_terms(text),public.leogo_accept_partner_terms(text,integer),public.leogo_admin_publish_partner_terms(text,text) to authenticated;