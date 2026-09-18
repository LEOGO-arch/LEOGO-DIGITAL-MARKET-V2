create table if not exists public.pickup_stations (
  id uuid primary key default gen_random_uuid(),
  station_name text not null,
  county text not null,
  sub_county text not null,
  town text not null,
  address_line text not null,
  landmark text,
  door_number text,
  service_fee_percent numeric(6,3) not null default 0
    check (service_fee_percent >= 0 and service_fee_percent <= 100),
  is_active boolean not null default true,
  display_order smallint not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pickup_stations_unique_location
  on public.pickup_stations (
    lower(station_name),
    lower(county),
    lower(sub_county),
    lower(town)
  );

create index if not exists pickup_stations_active_order_idx
  on public.pickup_stations (is_active, display_order, station_name);

alter table public.pickup_stations enable row level security;

revoke all on table public.pickup_stations from anon, authenticated;
grant select on table public.pickup_stations to authenticated;
grant all on table public.pickup_stations to service_role;

drop policy if exists "Authenticated customers can view active pickup stations" on public.pickup_stations;
create policy "Authenticated customers can view active pickup stations"
  on public.pickup_stations
  for select
  to authenticated
  using (is_active = true);

insert into public.pickup_stations (
  station_name,
  county,
  sub_county,
  town,
  address_line,
  landmark,
  door_number,
  service_fee_percent,
  is_active,
  display_order
)
select
  'LEOGO DIGITAL MARKET — Main Shop',
  'Siaya',
  'Alego Usonga',
  'Siaya Town',
  'Opposite Ena Coach booking office',
  'Ena Coach booking office',
  'A7',
  0,
  true,
  1
where not exists (
  select 1
  from public.pickup_stations
  where lower(station_name) = lower('LEOGO DIGITAL MARKET — Main Shop')
    and lower(county) = lower('Siaya')
    and lower(sub_county) = lower('Alego Usonga')
    and lower(town) = lower('Siaya Town')
);
