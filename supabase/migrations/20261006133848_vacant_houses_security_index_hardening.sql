
drop policy if exists vacant_house_settings_deny_direct_api on public.vacant_house_settings;
create policy vacant_house_settings_deny_direct_api
on public.vacant_house_settings for all to anon,authenticated
using(false) with check(false);

drop policy if exists vacant_house_listings_deny_direct_api on public.vacant_house_listings;
create policy vacant_house_listings_deny_direct_api
on public.vacant_house_listings for all to anon,authenticated
using(false) with check(false);

drop policy if exists vacant_house_viewing_requests_deny_direct_api on public.vacant_house_viewing_requests;
create policy vacant_house_viewing_requests_deny_direct_api
on public.vacant_house_viewing_requests for all to anon,authenticated
using(false) with check(false);

create index if not exists vacant_house_settings_updated_by_idx
  on public.vacant_house_settings(updated_by)
  where updated_by is not null;
create index if not exists vacant_house_listings_approved_by_idx
  on public.vacant_house_listings(approved_by)
  where approved_by is not null;
create index if not exists vacant_house_listings_voucher_reward_idx
  on public.vacant_house_listings(voucher_reward_id)
  where voucher_reward_id is not null;
create index if not exists vacant_house_viewing_verified_by_idx
  on public.vacant_house_viewing_requests(verified_by)
  where verified_by is not null;
