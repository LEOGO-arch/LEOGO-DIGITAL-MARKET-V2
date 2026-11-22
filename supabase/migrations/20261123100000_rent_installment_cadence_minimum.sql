-- Ensure requested rent instalments cover at least the monthly rent when
-- normalized to the selected cadence: 31 days, 4 weeks, or 1 month.
-- Leave older applications untouched while enforcing this for new/changed data.
alter table public.rent_installment_applications
  drop constraint if exists rent_preferred_minimum_within_rent;

alter table public.rent_installment_applications
  add constraint rent_preferred_minimum_matches_cadence
  check (
    preferred_minimum_installment is null
    or preferred_minimum_installment >= case preferred_installment_cadence
      when 'daily' then ceil(monthly_rent / 31)
      when 'weekly' then ceil(monthly_rent / 4)
      when 'monthly' then monthly_rent
      else 0
    end
  ) not valid;

comment on constraint rent_preferred_minimum_matches_cadence
  on public.rent_installment_applications
  is 'Customer preferred installment minimum must be at least monthly rent divided by 31 days, 4 weeks, or 1 month according to cadence.';
