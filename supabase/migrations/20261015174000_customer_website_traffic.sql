-- Customer storefront aggregate traffic. No names, phone numbers, IPs or device fingerprints.
create table if not exists public.customer_site_daily_visitors (
  visit_date date not null,
  visitor_token uuid not null,
  views integer not null default 1 check (views between 1 and 100000),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (visit_date, visitor_token)
);
alter table public.customer_site_daily_visitors enable row level security;
revoke all on public.customer_site_daily_visitors from anon, authenticated;
create or replace function public.record_customer_site_visit(p_visitor_token uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_visitor_token is null then return; end if;
  insert into public.customer_site_daily_visitors (visit_date,visitor_token)
  values ((now() at time zone 'Africa/Nairobi')::date,p_visitor_token)
  on conflict (visit_date,visitor_token) do update
  set views=least(public.customer_site_daily_visitors.views+1,100000),last_seen_at=now();
end; $$;
revoke all on function public.record_customer_site_visit(uuid) from public;
grant execute on function public.record_customer_site_visit(uuid) to anon,authenticated;
create or replace function public.admin_customer_site_traffic(p_from date,p_to date)
returns table(visit_date date,unique_browsers bigint,site_loads bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_leogo_admin('reports.export') then raise exception 'Reports access required'; end if;
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then
    raise exception 'Choose a valid range of up to 366 days';
  end if;
  return query
  select v.visit_date,count(*)::bigint,sum(v.views)::bigint
  from public.customer_site_daily_visitors v
  where v.visit_date between p_from and p_to
  group by v.visit_date order by v.visit_date desc;
end; $$;
revoke all on function public.admin_customer_site_traffic(date,date) from public;
grant execute on function public.admin_customer_site_traffic(date,date) to authenticated;
comment on table public.customer_site_daily_visitors is 'First-party anonymous browser-token traffic totals; not exact people counts. Delete aged rows according to LEOGO retention policy.';
