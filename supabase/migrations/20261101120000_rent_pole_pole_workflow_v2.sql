-- Manual reconciliation workflow. No M-Pesa/bank charge or payout is initiated by this schema.
alter table public.rent_installment_applications
  add column if not exists landlord_name text,
  add column if not exists landlord_verified_by uuid references auth.users(id),
  add column if not exists verified_account_snapshot text,
  add column if not exists customer_accepted_at timestamptz,
  add column if not exists plan_starts_on date;

create table public.rent_change_requests (
 id uuid primary key default gen_random_uuid(),
 application_id uuid not null references public.rent_installment_applications(id),
 customer_id uuid not null references auth.users(id),
 proposed_county text, proposed_sub_county text, proposed_estate text,
 proposed_map_pin text, proposed_landlord_name text, proposed_landlord_account text,
 reason text not null check (length(trim(reason)) between 5 and 1000),
 status text not null default 'pending' check (status in ('pending','applied','rejected')),
 reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 constraint rent_change_has_value check (num_nonnulls(proposed_county,proposed_sub_county,proposed_estate,proposed_map_pin,proposed_landlord_name,proposed_landlord_account)>0),
 constraint rent_change_review_pair check ((reviewed_by is null)=(reviewed_at is null)),
 constraint rent_change_lengths check (length(coalesce(proposed_county,''))<=100 and length(coalesce(proposed_sub_county,''))<=100
 and length(coalesce(proposed_estate,''))<=150 and length(coalesce(proposed_map_pin,''))<=400
 and length(coalesce(proposed_landlord_name,''))<=150 and length(coalesce(proposed_landlord_account,''))<=180)
);
create unique index rent_one_pending_change on public.rent_change_requests(application_id) where status='pending';

create table public.rent_payment_schedule (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.rent_installment_applications(id),
 sequence_no int not null check (sequence_no between 0 and 60),
 category text not null check (category in ('rent','deposit')),
 due_on date not null, amount numeric(14,2) not null check (amount>0),
 created_at timestamptz not null default now(),
 unique(application_id,category,sequence_no)
);
create table public.rent_payment_claims (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.rent_installment_applications(id),
 schedule_id uuid not null references public.rent_payment_schedule(id),
 customer_id uuid not null references auth.users(id),
 provider text not null check (length(trim(provider)) between 2 and 80),
 transaction_reference text not null check (length(trim(transaction_reference)) between 5 and 120),
 amount numeric(14,2) not null check (amount>0),
 paid_on date not null,
 status text not null default 'submitted' check (status in ('submitted','verified','rejected')),
 verified_by uuid references auth.users(id), verified_at timestamptz,
 created_at timestamptz not null default now(),
 constraint rent_claim_review_pair check ((verified_by is null)=(verified_at is null))
);
create unique index rent_verified_reference_unique on public.rent_payment_claims(lower(provider),upper(transaction_reference)) where status='verified';
create index rent_claim_schedule_idx on public.rent_payment_claims(schedule_id,status);

create table public.rent_landlord_settlements (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.rent_installment_applications(id),
 amount numeric(14,2) not null check (amount>0),
 destination_snapshot text not null check (length(trim(destination_snapshot))>4),
 external_payout_reference text not null check (length(trim(external_payout_reference)) between 5 and 120),
 settled_on date not null, recorded_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(external_payout_reference)
);

alter table public.rent_change_requests enable row level security;
alter table public.rent_payment_schedule enable row level security;
alter table public.rent_payment_claims enable row level security;
alter table public.rent_landlord_settlements enable row level security;
create policy rent_change_customer_select on public.rent_change_requests for select to authenticated using (customer_id=(select auth.uid()));
create policy rent_change_admin_select on public.rent_change_requests for select to authenticated using (private.is_leogo_admin('approvals.read'));
create policy rent_change_customer_insert on public.rent_change_requests for insert to authenticated
 with check (customer_id=(select auth.uid()) and status='pending' and reviewed_by is null and reviewed_at is null
  and exists(select 1 from public.rent_installment_applications a where a.id=application_id and a.customer_id=(select auth.uid()) and a.status not in ('rejected','closed')));
create policy rent_schedule_customer_select on public.rent_payment_schedule for select to authenticated
 using (exists(select 1 from public.rent_installment_applications a where a.id=application_id and a.customer_id=(select auth.uid())));
create policy rent_schedule_admin_select on public.rent_payment_schedule for select to authenticated using (private.is_leogo_admin('approvals.read'));
create policy rent_claim_customer_select on public.rent_payment_claims for select to authenticated using (customer_id=(select auth.uid()));
create policy rent_claim_admin_select on public.rent_payment_claims for select to authenticated using (private.is_leogo_admin('approvals.read'));
create policy rent_claim_customer_insert on public.rent_payment_claims for insert to authenticated
 with check (customer_id=(select auth.uid()) and status='submitted' and verified_by is null and verified_at is null
  and exists(select 1 from public.rent_payment_schedule s join public.rent_installment_applications a on a.id=s.application_id
    where s.id=schedule_id and a.id=application_id and a.customer_id=(select auth.uid()) and a.status='active'));
create policy rent_settlement_customer_select on public.rent_landlord_settlements for select to authenticated
 using (exists(select 1 from public.rent_installment_applications a where a.id=application_id and a.customer_id=(select auth.uid())));
create policy rent_settlement_admin_select on public.rent_landlord_settlements for select to authenticated using (private.is_leogo_admin('settlements.manage'));
grant select,insert on public.rent_change_requests to authenticated;
grant select on public.rent_payment_schedule to authenticated;
grant select,insert on public.rent_payment_claims to authenticated;
grant select on public.rent_landlord_settlements to authenticated;

-- A customer can accept only the exact approved schedule. Edits invalidate acceptance and verification.
create or replace function private.rent_customer_update_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if private.is_leogo_admin('approvals.manage') then return new; end if;
 if current_setting('app.rent_terms_accept',true)='yes' and old.customer_id=auth.uid() and old.status='verified'
   and (to_jsonb(new)-'customer_accepted_at'-'updated_at')=(to_jsonb(old)-'customer_accepted_at'-'updated_at')
 then return new; end if;
 if old.customer_id<>auth.uid() or old.status not in ('submitted','needs_information')
   or (to_jsonb(new)-'portrait_path'-'updated_at') is distinct from (to_jsonb(old)-'portrait_path'-'updated_at')
   or old.portrait_path is not null or new.portrait_path is null
   or new.portrait_path !~ ('^'||old.customer_id::text||'/'||old.id::text||'\.(jpg|png|webp)$')
 then raise exception 'Only initial identity photograph may be updated'; end if;
 new.updated_at=now();return new;
end; $$;
create or replace function public.rent_accept_terms(p_application uuid) returns void
 language plpgsql security definer set search_path='' as $$
begin
 perform set_config('app.rent_terms_accept','yes',true);
 update public.rent_installment_applications a set customer_accepted_at=now(),updated_at=now()
 where a.id=p_application and a.customer_id=auth.uid() and a.status='verified' and a.approved_at is not null
   and a.landlord_verified_at is not null and not exists
    (select 1 from public.rent_change_requests r where r.application_id=a.id and r.status='pending')
   and exists(select 1 from public.rent_payment_schedule s where s.application_id=a.id);
 if not found then raise exception 'Approved terms unavailable or changes pending'; end if;
end; $$;
revoke all on function public.rent_accept_terms(uuid) from public,anon;
grant execute on function public.rent_accept_terms(uuid) to authenticated;

-- All privileged transitions hold the application row lock. Operations are atomic and audited.
create or replace function public.rent_admin_action(p_application uuid,p_action text,p_payload jsonb default '{}'::jsonb)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.rent_installment_applications%rowtype; r public.rent_change_requests%rowtype;
  s public.rent_payment_schedule%rowtype; c public.rent_payment_claims%rowtype;
  v_amount numeric(14,2); v_paid numeric(14,2); v_settled numeric(14,2);
  v_months int; v_n int; v_start date; v_ref text; v_account text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_action='settle' then
   if not private.is_leogo_admin('settlements.manage') then raise exception 'Settlement permission required'; end if;
 elsif p_action='verify_payment' then
   if not private.is_leogo_admin('orders.payment_verify') then raise exception 'Payment verification permission required'; end if;
 elsif not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
 select * into a from public.rent_installment_applications where id=p_application for update;
 if not found then raise exception 'Application not found'; end if;
 if p_action='review' and a.status in ('submitted','needs_information') then
   update public.rent_installment_applications set status='under_review',updated_at=now() where id=a.id;
 elsif p_action='reject' and a.status in ('submitted','under_review','needs_information','verified') then
   update public.rent_installment_applications set status='rejected',updated_at=now() where id=a.id;
 elsif p_action='apply_change' then
   select * into r from public.rent_change_requests where id=(p_payload->>'request_id')::uuid and application_id=a.id and status='pending' for update;
   if not found then raise exception 'Pending change request not found'; end if;
   if a.status in ('rejected','closed') then raise exception 'Application is closed'; end if;
   update public.rent_installment_applications set
    county=coalesce(r.proposed_county,a.county), sub_county=coalesce(r.proposed_sub_county,a.sub_county),
    estate=coalesce(r.proposed_estate,a.estate),map_pin=coalesce(r.proposed_map_pin,a.map_pin),
    landlord_name=coalesce(r.proposed_landlord_name,a.landlord_name),landlord_account=coalesce(r.proposed_landlord_account,a.landlord_account),
    landlord_verified_at=null,landlord_verified_by=null,verified_account_snapshot=null,
    customer_accepted_at=null,status='under_review',approved_at=null,approved_by=null,updated_at=now() where id=a.id;
   update public.rent_change_requests set status='applied',reviewed_by=auth.uid(),reviewed_at=now() where id=r.id;
 elsif p_action='reject_change' then
   update public.rent_change_requests set status='rejected',reviewed_by=auth.uid(),reviewed_at=now()
    where id=(p_payload->>'request_id')::uuid and application_id=a.id and status='pending';
   if not found then raise exception 'Pending change request not found'; end if;
 elsif p_action='verify_landlord' and a.status in ('under_review','verified','suspended') then
   v_account=trim(coalesce(p_payload->>'account',''));
   if length(v_account)<5 or length(trim(coalesce(p_payload->>'landlord_name','')))<2 then raise exception 'Verified landlord name and destination required'; end if;
   update public.rent_installment_applications set landlord_name=trim(p_payload->>'landlord_name'),landlord_account=v_account,
    verified_account_snapshot=v_account,landlord_verified_at=now(),landlord_verified_by=auth.uid(),customer_accepted_at=null,
    status='under_review',updated_at=now() where id=a.id;
 elsif p_action='approve' and a.status='under_review' then
   if a.landlord_verified_at is null or a.verified_account_snapshot is null then raise exception 'Verify landlord first'; end if;
   if exists(select 1 from public.rent_change_requests where application_id=a.id and status='pending') then raise exception 'Resolve customer changes first'; end if;
   v_start=(p_payload->>'starts_on')::date;
   if v_start is null or v_start<current_date then raise exception 'A current or future plan start date is required'; end if;
   v_months=case a.payment_frequency when 'monthly' then 1 when 'quarterly' then 3 when 'four_months' then 4 when 'half_yearly' then 6 else 12 end;
   if not exists(select 1 from public.rent_payment_claims where application_id=a.id) then
    delete from public.rent_payment_schedule where application_id=a.id;
    for v_n in 0..(12/v_months)-1 loop
     insert into public.rent_payment_schedule(application_id,sequence_no,category,due_on,amount)
      values(a.id,v_n+1,'rent',(v_start+(v_n*v_months||' months')::interval)::date,a.monthly_rent*v_months);
    end loop;
    if a.deposit_amount>0 then insert into public.rent_payment_schedule(application_id,sequence_no,category,due_on,amount)
     values(a.id,0,'deposit',v_start,a.deposit_amount); end if;
   else
    -- Preserve billed periods and reconciled money after a landlord/location amendment.
    if v_start<>a.plan_starts_on then raise exception 'Existing payment history fixes original schedule start'; end if;
   end if;
   update public.rent_installment_applications set status='verified',plan_starts_on=v_start,approved_at=now(),approved_by=auth.uid(),customer_accepted_at=null,updated_at=now() where id=a.id;
 elsif p_action='activate' and a.status='verified' then
   if a.customer_accepted_at is null or a.landlord_verified_at is null then raise exception 'Landlord verification and customer acceptance required'; end if;
   if exists(select 1 from public.rent_change_requests where application_id=a.id and status='pending') then raise exception 'Resolve pending changes'; end if;
   update public.rent_installment_applications set status='active',updated_at=now() where id=a.id;
 elsif p_action='verify_payment' and a.status='active' then
   select * into c from public.rent_payment_claims where id=(p_payload->>'claim_id')::uuid and application_id=a.id and status='submitted' for update;
   if not found then raise exception 'Unreviewed claim not found'; end if;
   select * into s from public.rent_payment_schedule where id=c.schedule_id and application_id=a.id;
   if not found then raise exception 'Schedule mismatch'; end if;
   select coalesce(sum(amount),0) into v_paid from public.rent_payment_claims where schedule_id=s.id and status='verified';
   if v_paid+c.amount>s.amount then raise exception 'Claim exceeds outstanding schedule balance'; end if;
   update public.rent_payment_claims set status='verified',verified_by=auth.uid(),verified_at=now() where id=c.id;
 elsif p_action='reject_payment' and a.status='active' then
   if not private.is_leogo_admin('orders.payment_verify') then raise exception 'Payment verification permission required'; end if;
   update public.rent_payment_claims set status='rejected',verified_by=auth.uid(),verified_at=now()
    where id=(p_payload->>'claim_id')::uuid and application_id=a.id and status='submitted';
   if not found then raise exception 'Claim not found'; end if;
 elsif p_action='settle' and a.status='active' then
   if a.landlord_verified_at is null or a.verified_account_snapshot is null then raise exception 'Landlord unverified'; end if;
   if exists(select 1 from public.rent_change_requests where application_id=a.id and status='pending') then raise exception 'Pending change blocks settlement'; end if;
   v_amount=(p_payload->>'amount')::numeric;v_ref=trim(coalesce(p_payload->>'external_reference',''));
   if v_amount is null or v_amount<=0 or length(v_ref)<5 then raise exception 'Valid paid amount and external payout reference required'; end if;
   select coalesce(sum(amount),0) into v_paid from public.rent_payment_claims where application_id=a.id and status='verified';
   select coalesce(sum(amount),0) into v_settled from public.rent_landlord_settlements where application_id=a.id;
   if v_amount>v_paid-v_settled then raise exception 'Insufficient externally verified, unsettled receipts'; end if;
   insert into public.rent_landlord_settlements(application_id,amount,destination_snapshot,external_payout_reference,settled_on,recorded_by)
    values(a.id,v_amount,a.verified_account_snapshot,v_ref,(p_payload->>'settled_on')::date,auth.uid());
 elsif p_action='suspend' and a.status in ('active','verified') then
   update public.rent_installment_applications set status='suspended',updated_at=now() where id=a.id;
 else raise exception 'Invalid action or status transition'; end if;
 return jsonb_build_object('application_id',a.id,'action',p_action,'ok',true);
end; $$;
revoke all on function public.rent_admin_action(uuid,text,jsonb) from public,anon;
grant execute on function public.rent_admin_action(uuid,text,jsonb) to authenticated;
