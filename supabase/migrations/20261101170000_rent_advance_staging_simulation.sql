-- STAGING ONLY. No credit is issued and no money moves through these objects.
-- A simulation is immutable and cannot represent a real payout or legal debt.
create table public.rent_advance_simulations (
 id uuid primary key default gen_random_uuid(),
 application_id uuid not null unique references public.rent_installment_applications(id),
 customer_id uuid not null references auth.users(id),
 simulated_advance numeric(14,2) not null check (simulated_advance > 0),
 eligibility_note text not null check (length(trim(eligibility_note)) between 15 and 1000),
 status text not null default 'simulation_only' check (status = 'simulation_only'),
 simulated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index rent_advance_simulations_customer_idx on public.rent_advance_simulations(customer_id,created_at desc);
alter table public.rent_advance_simulations enable row level security;
create policy rent_advance_customer_read on public.rent_advance_simulations for select to authenticated
 using (customer_id=(select auth.uid()));
create policy rent_advance_admin_read on public.rent_advance_simulations for select to authenticated
 using (private.is_leogo_admin('approvals.read'));
grant select on public.rent_advance_simulations to authenticated;

-- The only insertion path enforces eligibility and does not transfer funds.
create function public.rent_admin_simulate_advance(p_application uuid,p_amount numeric,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.rent_installment_applications%rowtype; v_id uuid; v_count integer;
begin
 if auth.uid() is null or not private.is_leogo_admin('approvals.manage') then
   raise exception 'Approval permission required';
 end if;
 select * into a from public.rent_installment_applications where id=p_application for update;
 if not found or a.status <> 'active' or a.landlord_verified_at is null
   or a.verified_account_snapshot is null or a.customer_accepted_at is null then
   raise exception 'An active accepted plan and verified landlord are required';
 end if;
 if exists(select 1 from public.rent_change_requests where application_id=a.id and status='pending') then
   raise exception 'Resolve landlord or location changes before simulation';
 end if;
 select count(*) into v_count from public.rent_payment_claims
   where application_id=a.id and status='verified';
 if v_count < 2 then raise exception 'At least two independently verified past instalments are required'; end if;
 if p_amount is null or p_amount<=0 or p_amount>a.monthly_rent then
   raise exception 'Staging simulated advance must be no greater than one month rent';
 end if;
 if length(trim(coalesce(p_note,''))) not between 15 and 1000 then
   raise exception 'Record a 15-1000 character eligibility assessment';
 end if;
 insert into public.rent_advance_simulations(application_id,customer_id,simulated_advance,eligibility_note,simulated_by)
 values(a.id,a.customer_id,p_amount,trim(p_note),auth.uid()) returning id into v_id;
 return v_id;
end; $$;
revoke all on function public.rent_admin_simulate_advance(uuid,numeric,text) from public,anon;
grant execute on function public.rent_admin_simulate_advance(uuid,numeric,text) to authenticated;

comment on table public.rent_advance_simulations is 'STAGING ONLY: simulated rent-advance balances; never evidence of a real disbursement or debt.';
