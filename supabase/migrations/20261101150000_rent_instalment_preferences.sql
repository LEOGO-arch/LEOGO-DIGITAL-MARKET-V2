-- Customer-requested instalment preferences are separate from binding rent billing terms.
-- Existing applications remain valid without preferences; new form requires both fields.
alter table public.rent_installment_applications
 add column if not exists preferred_installment_cadence text,
 add column if not exists preferred_minimum_installment numeric(14,2),
 add column if not exists reminder_opt_in boolean not null default false;

alter table public.rent_installment_applications
 add constraint rent_preferred_cadence_values
 check (preferred_installment_cadence is null or preferred_installment_cadence in ('daily','weekly','monthly')),
 add constraint rent_preferred_minimum_within_rent
 check (preferred_minimum_installment is null or (preferred_minimum_installment > 0 and preferred_minimum_installment <= monthly_rent)),
 add constraint rent_preference_pair
 check ((preferred_installment_cadence is null) = (preferred_minimum_installment is null));

comment on column public.rent_installment_applications.preferred_installment_cadence
 is 'Customer preference only (daily, weekly, monthly); does not replace approved rent billing terms.';
comment on column public.rent_installment_applications.preferred_minimum_installment
 is 'Customer preferred minimum amount per instalment in KSh; not an automatic charge amount.';
comment on column public.rent_installment_applications.reminder_opt_in
 is 'Optional request to receive rent reminders if/when a reminder delivery service is enabled.';
