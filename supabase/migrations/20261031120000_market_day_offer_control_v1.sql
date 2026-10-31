-- LEOGO Market Day control plane. Deliberately does not alter the locked
-- marketplace checkout function; checkout pricing needs separate staged tests.
create table if not exists public.market_day_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 3 and 120),
  description text not null default '',
  starts_on date not null,
  ends_on date not null,
  start_time time not null default '06:00',
  end_time time not null default '23:59',
  weekdays integer[] not null default array[3]::integer[],
  county text,
  status text not null default 'draft' check (status in ('draft','published','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (start_time < end_time),
  check (coalesce(array_length(weekdays,1),0) between 1 and 7),
  check (weekdays <@ array[0,1,2,3,4,5,6]::integer[])
);

create table if not exists public.market_day_offers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.market_day_events(id) on delete cascade,
  product_id uuid not null references public.seller_products(id) on delete cascade,
  seller_id uuid not null references auth.users(id),
  kind text not null check (kind in ('reduced_price','bulk_discount')),
  offer_price_kes numeric(12,2),
  bulk_tiers jsonb not null default '[]'::jsonb,
  quantity_limit numeric(12,2) not null check (quantity_limit > 0),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected','withdrawn')),
  admin_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(event_id,product_id),
  check ((kind='reduced_price' and offer_price_kes > 0 and bulk_tiers='[]'::jsonb)
    or (kind='bulk_discount' and offer_price_kes is null and jsonb_typeof(bulk_tiers)='array'))
);

-- Platform-funded promotion; never silently decreases seller settlement.
create table if not exists public.leogo_free_delivery_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 3 and 120),
  min_items_subtotal_kes numeric(12,2) not null check (min_items_subtotal_kes > 0),
  county text not null,
  sub_county text,
  estate text,
  delivery_zone text not null check (delivery_zone in ('cbd','estate','outside')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  max_funded_delivery_kes numeric(12,2) not null check (max_funded_delivery_kes >= 0),
  budget_kes numeric(12,2) not null check (budget_kes >= 0),
  status text not null default 'draft' check (status in ('draft','active','paused','ended')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (length(btrim(county)) > 0)
);

alter table public.market_day_events enable row level security;
alter table public.market_day_offers enable row level security;
alter table public.leogo_free_delivery_campaigns enable row level security;

revoke all on public.market_day_events,public.market_day_offers,public.leogo_free_delivery_campaigns from public,anon,authenticated;

-- Public discovery exposes only approved, currently available promotions.
create or replace function public.public_list_market_day_offers()
returns table(event_id uuid,event_title text,product_id uuid,offer_kind text,offer_price_kes numeric,bulk_tiers jsonb,ends_on date)
language sql stable security invoker set search_path = '' as $$
  select e.id,e.title,o.product_id,o.kind,o.offer_price_kes,o.bulk_tiers,e.ends_on
  from public.market_day_events e
  join public.market_day_offers o on o.event_id=e.id
  join public.seller_products p on p.id=o.product_id
  where e.status='published' and o.approval_status='approved'
    and p.product_approval_status='approved' and p.listing_status='active'
    and (now() at time zone 'Africa/Nairobi')::date between e.starts_on and e.ends_on
    and extract(dow from now() at time zone 'Africa/Nairobi')::integer=any(e.weekdays)
    and (now() at time zone 'Africa/Nairobi')::time between e.start_time and e.end_time;
$$;

-- Expose only the campaign eligibility, never the private budget.
create or replace function public.public_free_delivery_eligibility(
  p_items_subtotal_kes numeric,p_county text,p_sub_county text,p_estate text,p_delivery_zone text)
returns table(campaign_id uuid,title text,max_funded_delivery_kes numeric)
language sql stable security definer set search_path = '' as $$
  select c.id,c.title,c.max_funded_delivery_kes
  from public.leogo_free_delivery_campaigns c
  where c.status='active' and now() between c.starts_at and c.ends_at
    and c.budget_kes >= c.max_funded_delivery_kes and c.max_funded_delivery_kes > 0
    and p_items_subtotal_kes >= c.min_items_subtotal_kes
    and lower(btrim(p_county))=lower(btrim(c.county))
    and (c.sub_county is null or lower(btrim(p_sub_county))=lower(btrim(c.sub_county)))
    and (c.estate is null or lower(btrim(p_estate))=lower(btrim(c.estate)))
    and c.delivery_zone=p_delivery_zone
  order by c.max_funded_delivery_kes desc limit 1;
$$;

-- Keep discovery locked behind reviewed functions, and direct table access private.
-- The invoker listing requires narrowly-scoped public SELECT policies.
grant select on public.market_day_events, public.market_day_offers to anon,authenticated;
create policy market_day_public_events on public.market_day_events for select to anon,authenticated
using (status='published');
create policy market_day_public_offers on public.market_day_offers for select to anon,authenticated
using (approval_status='approved' and exists (
  select 1 from public.market_day_events e where e.id=event_id and e.status='published'));

revoke all on function public.public_list_market_day_offers() from public;
grant execute on function public.public_list_market_day_offers() to anon,authenticated;
revoke all on function public.public_free_delivery_eligibility(numeric,text,text,text,text) from public;
grant execute on function public.public_free_delivery_eligibility(numeric,text,text,text,text) to anon,authenticated;

-- Seller submission checks product ownership; no seller can self-approve.
create or replace function public.seller_submit_market_day_offer(
  p_event_id uuid,p_product_id uuid,p_kind text,p_offer_price_kes numeric,p_bulk_tiers jsonb,p_quantity_limit numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_id uuid; v_price numeric;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists (select 1 from public.market_day_events e where e.id=p_event_id and e.status='published'
    and e.ends_on >= (now() at time zone 'Africa/Nairobi')::date)
    then raise exception 'Market Day is unavailable'; end if;
  select p.price_kes into v_price from public.seller_products p
    where p.id=p_product_id and p.seller_id=v_uid and p.product_approval_status='approved';
  if not found then raise exception 'Approved seller product required'; end if;
  if p_quantity_limit is null or p_quantity_limit <= 0 then raise exception 'Promotional stock must be positive'; end if;
  if p_kind='reduced_price' then
    if p_offer_price_kes is null or p_offer_price_kes<=0 or p_offer_price_kes>=v_price then
      raise exception 'Market Day price must be positive and below normal price'; end if;
  elsif p_kind='bulk_discount' then
    if jsonb_typeof(p_bulk_tiers)<>'array' or jsonb_array_length(p_bulk_tiers)=0 or jsonb_array_length(p_bulk_tiers)>8 then
      raise exception 'Provide between 1 and 8 bulk tiers'; end if;
    if exists (select 1 from jsonb_array_elements(p_bulk_tiers) tier
      where (tier->>'min_qty') is null or (tier->>'unit_price_kes') is null
         or (tier->>'min_qty')::numeric < 2 or (tier->>'unit_price_kes')::numeric <= 0
         or (tier->>'unit_price_kes')::numeric >= v_price) then
      raise exception 'Bulk tiers require quantity at least 2 and a lower unit price'; end if;
  else raise exception 'Unsupported offer type'; end if;
  insert into public.market_day_offers(event_id,product_id,seller_id,kind,offer_price_kes,bulk_tiers,quantity_limit)
    values(p_event_id,p_product_id,v_uid,p_kind,
      case when p_kind='reduced_price' then p_offer_price_kes end,
      case when p_kind='bulk_discount' then p_bulk_tiers else '[]'::jsonb end,p_quantity_limit)
  on conflict(event_id,product_id) do update set
    kind=excluded.kind,offer_price_kes=excluded.offer_price_kes,bulk_tiers=excluded.bulk_tiers,
    quantity_limit=excluded.quantity_limit,approval_status='pending',admin_notes=null,reviewed_at=null
  where public.market_day_offers.seller_id=v_uid
  returning id into v_id;
  if v_id is null then raise exception 'Offer belongs to another seller'; end if;
  return v_id;
end $$;

create or replace function public.admin_review_market_day_offer(p_offer_id uuid,p_approve boolean,p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_leogo_admin('settings.manage') then raise exception 'Admin permission required'; end if;
  update public.market_day_offers set approval_status=case when p_approve then 'approved' else 'rejected' end,
    admin_notes=nullif(btrim(p_notes),''),reviewed_at=now()
  where id=p_offer_id and approval_status='pending';
  if not found then raise exception 'Pending offer not found'; end if;
end $$;

create or replace function public.admin_save_market_day(
  p_id uuid,p_title text,p_starts_on date,p_ends_on date,p_start_time time,p_end_time time,
  p_weekdays integer[],p_county text,p_status text,p_description text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.is_leogo_admin('settings.manage') then raise exception 'Admin permission required'; end if;
  if p_status not in ('draft','published','paused','archived') then raise exception 'Invalid Market Day status'; end if;
  if p_starts_on>p_ends_on or p_start_time>=p_end_time or coalesce(array_length(p_weekdays,1),0) not between 1 and 7
     or not (p_weekdays <@ array[0,1,2,3,4,5,6]::integer[]) then raise exception 'Invalid schedule'; end if;
  if p_id is null then
    insert into public.market_day_events(title,description,starts_on,ends_on,start_time,end_time,weekdays,county,status)
    values(p_title,coalesce(p_description,''),p_starts_on,p_ends_on,p_start_time,p_end_time,p_weekdays,
      nullif(btrim(p_county),''),p_status) returning id into v_id;
  else
    update public.market_day_events set title=p_title,description=coalesce(p_description,''),starts_on=p_starts_on,
      ends_on=p_ends_on,start_time=p_start_time,end_time=p_end_time,weekdays=p_weekdays,
      county=nullif(btrim(p_county),''),status=p_status,updated_at=now()
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'Market Day not found'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.admin_save_free_delivery_campaign(
  p_id uuid,p_title text,p_min_subtotal numeric,p_county text,p_sub_county text,p_estate text,
  p_zone text,p_starts_at timestamptz,p_ends_at timestamptz,p_max_fee numeric,p_budget numeric,p_status text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.is_leogo_admin('settings.manage') then raise exception 'Admin permission required'; end if;
  if p_status not in ('draft','active','paused','ended') then raise exception 'Invalid campaign status'; end if;
  if p_starts_at>=p_ends_at or p_min_subtotal<=0 or p_max_fee<0 or p_budget<0
     or p_zone not in ('cbd','estate','outside') then raise exception 'Invalid delivery offer'; end if;
  if p_id is null then
    insert into public.leogo_free_delivery_campaigns(title,min_items_subtotal_kes,county,sub_county,estate,delivery_zone,
      starts_at,ends_at,max_funded_delivery_kes,budget_kes,status)
    values(p_title,p_min_subtotal,p_county,nullif(btrim(p_sub_county),''),nullif(btrim(p_estate),''),p_zone,
      p_starts_at,p_ends_at,p_max_fee,p_budget,p_status) returning id into v_id;
  else
    update public.leogo_free_delivery_campaigns set title=p_title,min_items_subtotal_kes=p_min_subtotal,
      county=p_county,sub_county=nullif(btrim(p_sub_county),''),estate=nullif(btrim(p_estate),''),
      delivery_zone=p_zone,starts_at=p_starts_at,ends_at=p_ends_at,max_funded_delivery_kes=p_max_fee,
      budget_kes=p_budget,status=p_status where id=p_id returning id into v_id;
    if v_id is null then raise exception 'Delivery campaign not found'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.admin_market_day_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_leogo_admin('settings.manage') then raise exception 'Admin permission required'; end if;
  return jsonb_build_object(
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.starts_on desc) from public.market_day_events e),'[]'::jsonb),
    'offers',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc) from public.market_day_offers o),'[]'::jsonb),
    'free_delivery',coalesce((select jsonb_agg(to_jsonb(c) order by c.starts_at desc) from public.leogo_free_delivery_campaigns c),'[]'::jsonb)
  );
end $$;

create or replace function public.seller_market_day_overview()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.starts_on) from public.market_day_events e
      where e.status='published' and e.ends_on >= (now() at time zone 'Africa/Nairobi')::date),'[]'::jsonb),
    'offers',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc) from public.market_day_offers o
      where o.seller_id=(select auth.uid())),'[]'::jsonb)
  ) where (select auth.uid()) is not null;
$$;

revoke all on function public.seller_submit_market_day_offer(uuid,uuid,text,numeric,jsonb,numeric) from public;
grant execute on function public.seller_submit_market_day_offer(uuid,uuid,text,numeric,jsonb,numeric) to authenticated;
revoke all on function public.admin_review_market_day_offer(uuid,boolean,text) from public;
grant execute on function public.admin_review_market_day_offer(uuid,boolean,text) to authenticated;
revoke all on function public.admin_save_market_day(uuid,text,date,date,time,time,integer[],text,text,text) from public;
grant execute on function public.admin_save_market_day(uuid,text,date,date,time,time,integer[],text,text,text) to authenticated;
revoke all on function public.admin_save_free_delivery_campaign(uuid,text,numeric,text,text,text,text,timestamptz,timestamptz,numeric,numeric,text) from public;
grant execute on function public.admin_save_free_delivery_campaign(uuid,text,numeric,text,text,text,text,timestamptz,timestamptz,numeric,numeric,text) to authenticated;
revoke all on function public.admin_market_day_overview() from public;
grant execute on function public.admin_market_day_overview() to authenticated;
revoke all on function public.seller_market_day_overview() from public;
grant execute on function public.seller_market_day_overview() to authenticated;
