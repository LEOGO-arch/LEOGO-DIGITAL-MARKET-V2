-- Accommodation room review source for room catalogue ratings.
-- Public customers can only read Admin-approved reviews.
-- Review submission/moderation workflow will be connected to completed accommodation stays.

create table if not exists public.accommodation_unit_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.accommodation_bookings(id) on delete cascade,
  unit_id uuid not null references public.accommodation_units(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  moderation_status text not null default 'submitted'
    check (moderation_status in ('submitted','approved','rejected')),
  admin_notes text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id)
);

alter table public.accommodation_unit_reviews enable row level security;

drop policy if exists "Public reads approved accommodation room reviews"
  on public.accommodation_unit_reviews;
create policy "Public reads approved accommodation room reviews"
on public.accommodation_unit_reviews
for select
to anon, authenticated
using (moderation_status='approved');

drop policy if exists "Customers read own accommodation room reviews"
  on public.accommodation_unit_reviews;
create policy "Customers read own accommodation room reviews"
on public.accommodation_unit_reviews
for select
to authenticated
using (customer_id=(select auth.uid()));

drop policy if exists "Admins read accommodation room reviews"
  on public.accommodation_unit_reviews;
create policy "Admins read accommodation room reviews"
on public.accommodation_unit_reviews
for select
to authenticated
using (private.is_leogo_admin('approvals.read'));

grant select on public.accommodation_unit_reviews to anon, authenticated;
