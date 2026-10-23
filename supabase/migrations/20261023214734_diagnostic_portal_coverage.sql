-- Aggregate browser activity only; no account, IP, location or message content.
create table if not exists private.system_portal_heartbeats (
 portal text primary key check (portal in ('admin','customer','partner','staff','pickup')),
 version text not null,
 last_seen timestamptz not null default now()
);
alter table private.system_portal_heartbeats enable row level security;
revoke all on private.system_portal_heartbeats from public, anon, authenticated;
create or replace function public.record_system_portal_heartbeat(p_portal text,p_version text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_portal is null or p_portal not in ('admin','customer','partner','staff','pickup') then return; end if;
 insert into private.system_portal_heartbeats as h(portal,version,last_seen)
 values(p_portal,left(regexp_replace(coalesce(p_version,'unknown'),'[^a-zA-Z0-9._-]','','g'),64),now())
 on conflict(portal) do update set version=excluded.version,last_seen=excluded.last_seen
 where h.last_seen<now()-interval '4 minutes';
end; $$;
revoke all on function public.record_system_portal_heartbeat(text,text) from public;
grant execute on function public.record_system_portal_heartbeat(text,text) to anon,authenticated;

-- Explicitly separate structural integrity from a successful end-to-end journey.
create or replace function public.admin_get_diagnostic_coverage()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r record; samples bigint; affected bigint; checks jsonb:='[]'::jsonb; portals jsonb;
begin
 if auth.uid() is null or not private.is_leogo_super_admin() then raise exception 'Super Admin access required'; end if;
 select jsonb_agg(jsonb_build_object('portal',p.portal,'version',h.version,'last_seen',h.last_seen) order by p.portal)
 into portals from (values ('admin'),('customer'),('partner'),('staff'),('pickup')) p(portal)
 left join private.system_portal_heartbeats h on h.portal=p.portal;
 for r in select * from (values
 ('Group orders','select count(*),count(*) filter(where c.id is null or p.quantity<=0 or p.amount_kes<0) from public.group_order_participations p left join public.group_order_campaigns c on c.id=p.campaign_id'),
 ('Assisted shopping','select count(*),count(*) filter(where r.marketplace_order_id is not null and o.id is null) from public.assisted_shopping_requests r left join public.marketplace_orders o on o.id=r.marketplace_order_id'),
 ('Lipa Pole Pole','select count(*),count(*) filter(where a.id is null or p.customer_id is distinct from a.customer_id or p.amount_kes<=0) from public.lipa_pole_pole_payments p left join public.lipa_pole_pole_accounts a on a.id=p.account_id'),
 ('Aftersales','select count(*),count(*) filter(where c.id is null) from public.aftersales_exchange_shipments s left join public.marketplace_aftersales_cases c on c.id=s.case_id'),
 ('Health and medicine','select count(*),count(*) filter(where a.user_id is null or p.price_kes<0) from public.health_medicine_products p left join public.health_medicine_accounts a on a.user_id=p.provider_id'),
 ('Property listings','select count(*),count(*) filter(where u.id is null or p.monthly_rent_kes<0 or p.sale_price_kes<0) from public.vacant_house_listings p left join auth.users u on u.id=p.submitter_user_id'),
 ('Customer care chat','select count(*),count(*) filter(where t.id is null) from public.customer_care_messages m left join public.customer_care_threads t on t.id=m.thread_id'),
 ('Partner terms','select count(*),count(*) filter(where t.partner_type is null) from public.leogo_partner_terms_acceptances a left join public.leogo_partner_terms t on t.partner_type=a.partner_type and t.version=a.version')
 ) as q(title,sql_text) loop
 begin
  execute r.sql_text into samples,affected;
  checks:=checks||jsonb_build_array(jsonb_build_object('title',r.title,'status',case when affected>0 then 'warning' when samples=0 then 'not_tested' else 'integrity_passed' end,'sample_count',samples,'affected_count',affected,'note','Stored relationship/amount checks only. Authentication, UI, notifications and completion require staging end-to-end testing.'));
 exception when undefined_table or undefined_column then
  checks:=checks||jsonb_build_array(jsonb_build_object('title',r.title,'status','not_available','note','Schema unavailable; this module has not been verified.'));
 end;
 end loop;
 return jsonb_build_object('generated_at',now(),'portals',portals,'checks',checks);
end; $$;
revoke all on function public.admin_get_diagnostic_coverage() from public,anon;
grant execute on function public.admin_get_diagnostic_coverage() to authenticated;
