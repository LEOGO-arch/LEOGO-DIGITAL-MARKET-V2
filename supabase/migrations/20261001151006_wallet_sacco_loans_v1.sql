
-- LEOGO DIGITAL MARKET V2
-- Wallet & SACCO Loans V1
-- Additive to the existing Wallet/SACCO application stub. Does not modify marketplace orders.

create table if not exists public.wallet_loan_settings (
  id smallint primary key default 1 check (id=1),
  applications_enabled boolean not null default false,
  minimum_total_saved_kes numeric(14,2) not null default 500 check (minimum_total_saved_kes>=0),
  minimum_saving_days integer not null default 7 check (minimum_saving_days between 0 and 3650),
  max_loan_amount_kes numeric(14,2) not null default 10000 check (max_loan_amount_kes>0),
  loan_to_savings_ratio numeric(8,4) not null default 1 check (loan_to_savings_ratio>0 and loan_to_savings_ratio<=20),
  interest_percent numeric(8,4) not null default 5 check (interest_percent>=0 and interest_percent<=100),
  processing_fee_percent numeric(8,4) not null default 0 check (processing_fee_percent>=0 and processing_fee_percent<=100),
  default_term_days integer not null default 30 check (default_term_days between 1 and 3650),
  grace_days integer not null default 3 check (grace_days between 0 and 365),
  overdue_penalty_percent numeric(8,4) not null default 0 check (overdue_penalty_percent>=0 and overdue_penalty_percent<=100),
  allow_partial_repayment boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.wallet_loan_settings(id) values(1) on conflict(id) do nothing;
alter table public.wallet_loan_settings enable row level security;
revoke all on public.wallet_loan_settings from anon,authenticated;

alter table public.wallet_loan_applications
  add column if not exists requested_term_days integer,
  add column if not exists eligibility_snapshot_eligible boolean,
  add column if not exists max_eligible_amount_kes numeric(14,2),
  add column if not exists interest_percent_snapshot numeric(8,4),
  add column if not exists processing_fee_percent_snapshot numeric(8,4),
  add column if not exists grace_days_snapshot integer,
  add column if not exists approved_amount_kes numeric(14,2),
  add column if not exists approved_term_days integer,
  add column if not exists approved_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='wallet_loan_applications_requested_term_days_check'
      and conrelid='public.wallet_loan_applications'::regclass
  ) then
    alter table public.wallet_loan_applications
      add constraint wallet_loan_applications_requested_term_days_check
      check (requested_term_days is null or requested_term_days between 1 and 3650);
  end if;
end $$;

create table if not exists public.wallet_loans (
  id uuid primary key default gen_random_uuid(),
  loan_reference text not null unique,
  application_id uuid not null unique references public.wallet_loan_applications(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  principal_kes numeric(14,2) not null check (principal_kes>0),
  interest_percent numeric(8,4) not null check (interest_percent>=0 and interest_percent<=100),
  interest_kes numeric(14,2) not null check (interest_kes>=0),
  processing_fee_percent numeric(8,4) not null check (processing_fee_percent>=0 and processing_fee_percent<=100),
  processing_fee_kes numeric(14,2) not null check (processing_fee_kes>=0),
  overdue_penalty_percent numeric(8,4) not null check (overdue_penalty_percent>=0 and overdue_penalty_percent<=100),
  overdue_penalty_kes numeric(14,2) not null default 0 check (overdue_penalty_kes>=0),
  overdue_penalty_applied_at timestamptz,
  total_due_kes numeric(14,2) not null check (total_due_kes>=principal_kes),
  amount_repaid_kes numeric(14,2) not null default 0 check (amount_repaid_kes>=0),
  outstanding_kes numeric(14,2) not null check (outstanding_kes>=0),
  term_days integer not null check (term_days between 1 and 3650),
  approved_at timestamptz not null,
  disbursed_at timestamptz not null default now(),
  due_date date not null,
  grace_until date not null,
  status text not null default 'active' check (status in ('active','overdue','paid','cancelled')),
  paid_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (grace_until>=due_date),
  check (amount_repaid_kes<=total_due_kes),
  check (outstanding_kes=greatest(0,total_due_kes-amount_repaid_kes))
);
create index if not exists wallet_loans_user_status_idx on public.wallet_loans(user_id,status,created_at desc);
create index if not exists wallet_loans_due_idx on public.wallet_loans(status,due_date);
create unique index if not exists wallet_one_active_loan_idx on public.wallet_loans(user_id)
  where status in ('active','overdue');
alter table public.wallet_loans enable row level security;
revoke all on public.wallet_loans from anon,authenticated;

create table if not exists public.wallet_loan_repayment_requests (
  id uuid primary key default gen_random_uuid(),
  repayment_reference text not null unique,
  loan_id uuid not null references public.wallet_loans(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  amount_kes numeric(14,2) not null check (amount_kes>0),
  payment_reference text not null check (char_length(btrim(payment_reference)) between 6 and 120),
  payment_status text not null default 'pending' check (payment_status in ('pending','verified','rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wallet_loan_repayments_loan_idx on public.wallet_loan_repayment_requests(loan_id,submitted_at desc);
create index if not exists wallet_loan_repayments_user_idx on public.wallet_loan_repayment_requests(user_id,submitted_at desc);
create unique index if not exists wallet_loan_repayment_reference_open_idx
  on public.wallet_loan_repayment_requests(lower(btrim(payment_reference)))
  where payment_status in ('pending','verified');
alter table public.wallet_loan_repayment_requests enable row level security;
revoke all on public.wallet_loan_repayment_requests from anon,authenticated;

alter table public.wallet_ledger_entries
  add column if not exists loan_id uuid references public.wallet_loans(id) on delete restrict;
create index if not exists wallet_ledger_entries_loan_id_idx on public.wallet_ledger_entries(loan_id)
  where loan_id is not null;

create or replace function private.wallet_loan_eligibility(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  s public.wallet_loan_settings%rowtype;
  v_balance numeric(14,2):=0;
  v_total_saved numeric(14,2):=0;
  v_saving_days integer:=0;
  v_max numeric(14,2):=0;
  v_wallet_active boolean:=false;
  v_has_active_loan boolean:=false;
  v_has_open_application boolean:=false;
  v_eligible boolean:=false;
begin
  select * into s from public.wallet_loan_settings where id=1;

  select exists(
    select 1 from public.wallet_accounts
    where user_id=p_user_id and account_status='active'
  ) into v_wallet_active;

  select
    coalesce(sum(case when direction='credit' then amount_kes else -amount_kes end),0),
    coalesce(sum(case when direction='credit' and entry_type in ('normal_saving','challenge_saving') then amount_kes else 0 end),0),
    count(distinct (created_at at time zone 'Africa/Nairobi')::date)
      filter (where direction='credit' and entry_type in ('normal_saving','challenge_saving'))
  into v_balance,v_total_saved,v_saving_days
  from public.wallet_ledger_entries
  where user_id=p_user_id;

  select exists(select 1 from public.wallet_loans where user_id=p_user_id and status in ('active','overdue'))
    into v_has_active_loan;
  select exists(select 1 from public.wallet_loan_applications where user_id=p_user_id and application_status in ('pending','under_review'))
    into v_has_open_application;

  v_max:=least(
    coalesce(s.max_loan_amount_kes,0),
    round(greatest(0,v_total_saved)*coalesce(s.loan_to_savings_ratio,0),2)
  );

  v_eligible:=
    coalesce(s.applications_enabled,false)
    and v_wallet_active
    and v_total_saved>=s.minimum_total_saved_kes
    and v_saving_days>=s.minimum_saving_days
    and v_max>0
    and not v_has_active_loan
    and not v_has_open_application;

  return jsonb_build_object(
    'eligible',v_eligible,
    'applications_enabled',coalesce(s.applications_enabled,false),
    'wallet_active',v_wallet_active,
    'wallet_balance_kes',greatest(0,v_balance),
    'total_saved_kes',greatest(0,v_total_saved),
    'saving_days',v_saving_days,
    'minimum_total_saved_kes',s.minimum_total_saved_kes,
    'minimum_saving_days',s.minimum_saving_days,
    'max_eligible_amount_kes',greatest(0,v_max),
    'max_loan_amount_kes',s.max_loan_amount_kes,
    'loan_to_savings_ratio',s.loan_to_savings_ratio,
    'interest_percent',s.interest_percent,
    'processing_fee_percent',s.processing_fee_percent,
    'default_term_days',s.default_term_days,
    'grace_days',s.grace_days,
    'overdue_penalty_percent',s.overdue_penalty_percent,
    'allow_partial_repayment',s.allow_partial_repayment,
    'has_active_loan',v_has_active_loan,
    'has_open_application',v_has_open_application
  );
end
$function$;

create or replace function private.refresh_wallet_loan_statuses()
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row record;
  v_count integer:=0;
  v_penalty numeric(14,2);
begin
  for v_row in
    select l.*,s.overdue_penalty_percent as setting_penalty
    from public.wallet_loans l
    cross join public.wallet_loan_settings s
    where s.id=1
      and l.status='active'
      and l.outstanding_kes>0
      and (now() at time zone 'Africa/Nairobi')::date > l.grace_until
    for update of l skip locked
  loop
    v_penalty:=case
      when v_row.overdue_penalty_applied_at is null
      then round(v_row.principal_kes*v_row.overdue_penalty_percent/100,2)
      else 0
    end;

    update public.wallet_loans
    set status='overdue',
        overdue_penalty_kes=overdue_penalty_kes+v_penalty,
        overdue_penalty_applied_at=case when v_penalty>0 then now() else overdue_penalty_applied_at end,
        total_due_kes=total_due_kes+v_penalty,
        outstanding_kes=outstanding_kes+v_penalty,
        updated_at=now()
    where id=v_row.id;

    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    )
    values(
      v_row.user_id,'wallet_loan','Loan repayment overdue',
      'Loan '||v_row.loan_reference||' is overdue. Open Wallet & SACCO to review the outstanding amount.',
      'wallet_loan',v_row.id,'wallet_loan_overdue_'||v_row.id::text,'wallet',
      jsonb_build_object('loan_reference',v_row.loan_reference)
    )
    on conflict do nothing;
    v_count:=v_count+1;
  end loop;
  return v_count;
end
$function$;

create or replace function public.get_my_wallet_loan_overview()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_eligibility jsonb;
  v_apps jsonb;
  v_loans jsonb;
  v_repayments jsonb;
  v_destination jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  perform private.refresh_wallet_loan_statuses();
  v_eligibility:=private.wallet_loan_eligibility(v_uid);

  select coalesce(jsonb_agg(to_jsonb(a) order by a.submitted_at desc),'[]'::jsonb)
    into v_apps
  from public.wallet_loan_applications a
  where a.user_id=v_uid;

  select coalesce(jsonb_agg(
    to_jsonb(l)
      || jsonb_build_object(
        'repayment_progress_percent',
        case when l.total_due_kes<=0 then 100 else round((l.amount_repaid_kes/l.total_due_kes)*100,1) end
      )
    order by l.created_at desc
  ),'[]'::jsonb)
  into v_loans
  from public.wallet_loans l
  where l.user_id=v_uid;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.submitted_at desc),'[]'::jsonb)
    into v_repayments
  from public.wallet_loan_repayment_requests r
  where r.user_id=v_uid;

  select jsonb_build_object(
    'display_name',p.display_name,'account_type',p.account_type,'business_name',p.business_name,
    'account_name',p.account_name,'till_number',p.till_number,'paybill_number',p.paybill_number,
    'account_number',p.account_number,'bank_name',p.bank_name,'branch',p.branch,'instructions',p.instructions
  )
  into v_destination
  from public.payment_account_assignments a
  join public.payment_accounts p on p.id=a.account_id
  where a.function_code='loan_repayment' and p.status='active'
  limit 1;

  return jsonb_build_object(
    'eligibility',v_eligibility,
    'applications',v_apps,
    'loans',v_loans,
    'repayments',v_repayments,
    'repayment_destination',v_destination
  );
end
$function$;

create or replace function public.submit_wallet_loan_application_v2(
  p_requested_amount_kes numeric,
  p_purpose text,
  p_consent_accepted boolean,
  p_requested_term_days integer default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  e jsonb;
  s public.wallet_loan_settings%rowtype;
  v_id uuid;
  v_term integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_consent_accepted is distinct from true then raise exception 'Consent is required'; end if;
  if char_length(btrim(coalesce(p_purpose,''))) not between 10 and 1000 then
    raise exception 'Explain the loan purpose using at least 10 characters';
  end if;

  perform private.ensure_wallet_account(v_uid);
  select * into s from public.wallet_loan_settings where id=1;
  e:=private.wallet_loan_eligibility(v_uid);

  if not coalesce((e->>'applications_enabled')::boolean,false) then
    raise exception 'Loan applications are not open yet. LEOGO Admin must first enable the loan terms.';
  end if;
  if coalesce((e->>'has_active_loan')::boolean,false) then
    raise exception 'Complete your current loan before applying for another';
  end if;
  if coalesce((e->>'has_open_application')::boolean,false) then
    raise exception 'You already have a loan application awaiting review';
  end if;
  if not coalesce((e->>'eligible')::boolean,false) then
    raise exception 'Your verified saving history does not yet meet the current loan eligibility rules';
  end if;
  if p_requested_amount_kes is null or p_requested_amount_kes<=0
     or p_requested_amount_kes>(e->>'max_eligible_amount_kes')::numeric then
    raise exception 'You can currently request up to KSh %',(e->>'max_eligible_amount_kes');
  end if;

  v_term:=coalesce(p_requested_term_days,s.default_term_days);
  if v_term<1 or v_term>3650 then raise exception 'Choose a valid repayment period'; end if;

  insert into public.wallet_loan_applications(
    user_id,requested_amount_kes,purpose,consent_accepted,
    confirmed_balance_at_application,total_saved_at_application,confirmed_saving_days_at_application,
    requested_term_days,eligibility_snapshot_eligible,max_eligible_amount_kes,
    interest_percent_snapshot,processing_fee_percent_snapshot,grace_days_snapshot
  ) values(
    v_uid,round(p_requested_amount_kes,2),btrim(p_purpose),true,
    (e->>'wallet_balance_kes')::numeric,(e->>'total_saved_kes')::numeric,(e->>'saving_days')::integer,
    v_term,true,(e->>'max_eligible_amount_kes')::numeric,
    s.interest_percent,s.processing_fee_percent,s.grace_days
  )
  returning id into v_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_uid,'wallet_loan','Loan application submitted',
    'Your loan application has been sent to LEOGO Admin for review. Submission is not an approval.',
    'wallet_loan_application',v_id,'wallet_loan_application_submitted_'||v_id::text,'wallet',
    jsonb_build_object('requested_amount_kes',round(p_requested_amount_kes,2),'requested_term_days',v_term)
  );

  return jsonb_build_object('ok',true,'application_id',v_id,'status','pending');
exception when unique_violation then
  raise exception 'You already have a loan application awaiting review';
end
$function$;

create or replace function public.submit_wallet_loan_application(
  p_requested_amount_kes bigint,
  p_purpose text,
  p_consent_accepted boolean
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare v jsonb;
begin
  v:=public.submit_wallet_loan_application_v2(
    p_requested_amount_kes::numeric,p_purpose,p_consent_accepted,null
  );
  return (v->>'application_id')::uuid;
end
$function$;

create or replace function public.review_wallet_loan_application(
  p_application_id uuid,
  p_status text,
  p_partner_notes text default null,
  p_reviewed_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  a public.wallet_loan_applications%rowtype;
  s public.wallet_loan_settings%rowtype;
  v_principal numeric(14,2);
  v_interest numeric(14,2);
  v_fee numeric(14,2);
  v_total numeric(14,2);
  v_term integer;
  v_loan_id uuid;
  v_ref text;
begin
  if not private.is_leogo_admin('approvals.manage') then
    raise exception 'Approval permission required';
  end if;
  if p_status not in ('under_review','approved','rejected') then
    raise exception 'Select a valid loan review status';
  end if;

  select * into a
  from public.wallet_loan_applications
  where id=p_application_id
  for update;
  if not found or a.application_status not in ('pending','under_review') then
    raise exception 'Open loan application not found';
  end if;

  if p_status='under_review' then
    update public.wallet_loan_applications
    set application_status='under_review',reviewed_at=now(),reviewed_by=auth.uid(),
        partner_notes=nullif(btrim(coalesce(p_partner_notes,'')),'')
    where id=a.id;

  elsif p_status='rejected' then
    if char_length(btrim(coalesce(p_partner_notes,'')))<3 then
      raise exception 'Add a clear rejection reason';
    end if;
    update public.wallet_loan_applications
    set application_status='rejected',reviewed_at=now(),reviewed_by=auth.uid(),
        partner_notes=btrim(p_partner_notes)
    where id=a.id;

  else
    if exists(select 1 from public.wallet_loans where user_id=a.user_id and status in ('active','overdue')) then
      raise exception 'Customer already has an active loan';
    end if;
    if a.eligibility_snapshot_eligible is distinct from true then
      raise exception 'This application does not contain a valid eligibility snapshot';
    end if;
    if a.requested_amount_kes>a.max_eligible_amount_kes then
      raise exception 'Requested amount exceeds the eligibility snapshot';
    end if;

    select * into s from public.wallet_loan_settings where id=1;
    v_principal:=round(a.requested_amount_kes::numeric,2);
    v_term:=coalesce(a.requested_term_days,s.default_term_days);
    v_interest:=round(v_principal*coalesce(a.interest_percent_snapshot,s.interest_percent)/100,2);
    v_fee:=round(v_principal*coalesce(a.processing_fee_percent_snapshot,s.processing_fee_percent)/100,2);
    v_total:=v_principal+v_interest+v_fee;
    v_ref:='LOAN-'||to_char(now() at time zone 'Africa/Nairobi','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

    insert into public.wallet_loans(
      loan_reference,application_id,user_id,principal_kes,interest_percent,interest_kes,
      processing_fee_percent,processing_fee_kes,overdue_penalty_percent,total_due_kes,
      amount_repaid_kes,outstanding_kes,term_days,approved_at,disbursed_at,due_date,grace_until,
      status,approved_by
    ) values(
      v_ref,a.id,a.user_id,v_principal,
      coalesce(a.interest_percent_snapshot,s.interest_percent),v_interest,
      coalesce(a.processing_fee_percent_snapshot,s.processing_fee_percent),v_fee,
      s.overdue_penalty_percent,v_total,0,v_total,v_term,now(),now(),
      (now() at time zone 'Africa/Nairobi')::date+v_term,
      (now() at time zone 'Africa/Nairobi')::date+v_term+coalesce(a.grace_days_snapshot,s.grace_days),
      'active',auth.uid()
    )
    returning id into v_loan_id;

    insert into public.wallet_ledger_entries(
      user_id,entry_type,direction,amount_kes,loan_id,external_reference,description
    ) values(
      a.user_id,'loan_disbursement','credit',v_principal,v_loan_id,v_ref,
      'LEOGO Wallet loan disbursement'
    );

    update public.wallet_loan_applications
    set application_status='approved',reviewed_at=now(),reviewed_by=auth.uid(),
        partner_notes=nullif(btrim(coalesce(p_partner_notes,'')),''),
        approved_amount_kes=v_principal,approved_term_days=v_term,approved_at=now()
    where id=a.id;

    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    ) values(
      a.user_id,'wallet_loan','Loan approved and credited',
      'Loan '||v_ref||' has been approved and KSh '||to_char(v_principal,'FM999G999G990D00')||
      ' was credited to your LEOGO Wallet. Review the repayment schedule in Wallet & SACCO.',
      'wallet_loan',v_loan_id,'wallet_loan_approved_'||v_loan_id::text,'wallet',
      jsonb_build_object('loan_reference',v_ref,'principal_kes',v_principal,'total_due_kes',v_total,'term_days',v_term)
    );
  end if;

  if p_status in ('under_review','rejected') then
    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    ) values(
      a.user_id,'wallet_loan',
      case when p_status='under_review' then 'Loan application under review' else 'Loan application not approved' end,
      case when p_status='under_review'
        then 'LEOGO Admin is reviewing your loan application.'
        else 'LEOGO Admin did not approve this loan application.'||
          case when nullif(btrim(coalesce(p_partner_notes,'')),'') is null then '' else ' Reason: '||btrim(p_partner_notes) end
      end,
      'wallet_loan_application',a.id,'wallet_loan_application_'||p_status||'_'||a.id::text,'wallet',
      jsonb_build_object('status',p_status)
    ) on conflict do nothing;
  end if;

  return p_application_id;
end
$function$;

create or replace function public.submit_wallet_loan_repayment(
  p_loan_id uuid,
  p_amount_kes numeric,
  p_payment_reference text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  l public.wallet_loans%rowtype;
  s public.wallet_loan_settings%rowtype;
  v_id uuid;
  v_ref text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  perform private.refresh_wallet_loan_statuses();

  select * into l from public.wallet_loans
  where id=p_loan_id and user_id=v_uid for update;
  if not found then raise exception 'Loan not found'; end if;
  if l.status not in ('active','overdue') or l.outstanding_kes<=0 then
    raise exception 'This loan does not have an outstanding balance';
  end if;

  select * into s from public.wallet_loan_settings where id=1;
  if p_amount_kes is null or p_amount_kes<=0 or p_amount_kes>l.outstanding_kes then
    raise exception 'Enter a repayment amount up to KSh %',l.outstanding_kes;
  end if;
  if not s.allow_partial_repayment and p_amount_kes<l.outstanding_kes then
    raise exception 'Partial repayment is not enabled for loans';
  end if;
  if char_length(btrim(coalesce(p_payment_reference,''))) not between 6 and 120 then
    raise exception 'Enter a valid repayment transaction reference';
  end if;
  if not exists(
    select 1 from public.payment_account_assignments a
    join public.payment_accounts p on p.id=a.account_id
    where a.function_code='loan_repayment' and p.status='active'
  ) then
    raise exception 'Loan repayment payment destination is being configured';
  end if;

  v_ref:='LRP-'||to_char(now() at time zone 'Africa/Nairobi','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.wallet_loan_repayment_requests(
    repayment_reference,loan_id,user_id,amount_kes,payment_reference
  ) values(
    v_ref,l.id,v_uid,round(p_amount_kes,2),upper(btrim(p_payment_reference))
  ) returning id into v_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_uid,'wallet_loan','Loan repayment submitted',
    'Your repayment for '||l.loan_reference||' is waiting for Admin verification.',
    'wallet_loan_repayment',v_id,'wallet_loan_repayment_submitted_'||v_id::text,'wallet',
    jsonb_build_object('loan_id',l.id,'amount_kes',round(p_amount_kes,2))
  );

  return jsonb_build_object('ok',true,'repayment_id',v_id,'repayment_reference',v_ref,'status','pending');
exception when unique_violation then
  raise exception 'This repayment transaction reference has already been submitted';
end
$function$;

create or replace function public.admin_get_wallet_loan_settings()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not private.is_leogo_admin('dashboard.read') then raise exception 'Admin access required'; end if;
  return (select to_jsonb(s) from public.wallet_loan_settings s where id=1);
end
$function$;

create or replace function public.admin_save_wallet_loan_settings(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_enabled boolean;
  v_min_saved numeric;
  v_days integer;
  v_max numeric;
  v_ratio numeric;
  v_interest numeric;
  v_fee numeric;
  v_term integer;
  v_grace integer;
  v_penalty numeric;
  v_partial boolean;
begin
  if not private.is_leogo_admin('fees.manage') then raise exception 'Fee settings permission required'; end if;
  select to_jsonb(s) into v_before from public.wallet_loan_settings s where id=1 for update;

  v_enabled:=coalesce((p_settings->>'applications_enabled')::boolean,false);
  v_min_saved:=coalesce((p_settings->>'minimum_total_saved_kes')::numeric,0);
  v_days:=coalesce((p_settings->>'minimum_saving_days')::integer,0);
  v_max:=coalesce((p_settings->>'max_loan_amount_kes')::numeric,0);
  v_ratio:=coalesce((p_settings->>'loan_to_savings_ratio')::numeric,0);
  v_interest:=coalesce((p_settings->>'interest_percent')::numeric,0);
  v_fee:=coalesce((p_settings->>'processing_fee_percent')::numeric,0);
  v_term:=coalesce((p_settings->>'default_term_days')::integer,0);
  v_grace:=coalesce((p_settings->>'grace_days')::integer,0);
  v_penalty:=coalesce((p_settings->>'overdue_penalty_percent')::numeric,0);
  v_partial:=coalesce((p_settings->>'allow_partial_repayment')::boolean,true);

  if v_min_saved<0 or v_days<0 or v_max<=0 or v_ratio<=0 or v_ratio>20
     or v_interest<0 or v_interest>100 or v_fee<0 or v_fee>100
     or v_term<1 or v_term>3650 or v_grace<0 or v_grace>365
     or v_penalty<0 or v_penalty>100 then
    raise exception 'Enter valid loan settings';
  end if;

  update public.wallet_loan_settings
  set applications_enabled=v_enabled,
      minimum_total_saved_kes=round(v_min_saved,2),
      minimum_saving_days=v_days,
      max_loan_amount_kes=round(v_max,2),
      loan_to_savings_ratio=v_ratio,
      interest_percent=v_interest,
      processing_fee_percent=v_fee,
      default_term_days=v_term,
      grace_days=v_grace,
      overdue_penalty_percent=v_penalty,
      allow_partial_repayment=v_partial,
      updated_by=auth.uid(),updated_at=now()
  where id=1;

  select to_jsonb(s) into v_after from public.wallet_loan_settings s where id=1;
  perform private.write_admin_audit('wallet_loans.settings.updated','wallet_loan_settings','1',v_before,v_after,'{}'::jsonb);
  return v_after;
end
$function$;

create or replace function public.admin_list_wallet_loans()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if not private.is_leogo_admin('dashboard.read') then raise exception 'Admin access required'; end if;
  perform private.refresh_wallet_loan_statuses();
  select coalesce(jsonb_agg(
    to_jsonb(l)||jsonb_build_object(
      'customer_name',coalesce(c.full_name,u.email::text,'Customer'),
      'customer_phone',c.phone,
      'application',to_jsonb(a)
    )
    order by l.created_at desc
  ),'[]'::jsonb)
  into v_result
  from public.wallet_loans l
  join public.wallet_loan_applications a on a.id=l.application_id
  left join public.customer_profiles c on c.user_id=l.user_id
  left join auth.users u on u.id=l.user_id;
  return v_result;
end
$function$;

create or replace function public.admin_list_wallet_loan_repayments()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if not private.is_leogo_admin('dashboard.read') then raise exception 'Admin access required'; end if;
  select coalesce(jsonb_agg(
    to_jsonb(r)||jsonb_build_object(
      'loan_reference',l.loan_reference,
      'loan_outstanding_kes',l.outstanding_kes,
      'customer_name',coalesce(c.full_name,u.email::text,'Customer'),
      'customer_phone',c.phone
    )
    order by r.submitted_at desc
  ),'[]'::jsonb)
  into v_result
  from public.wallet_loan_repayment_requests r
  join public.wallet_loans l on l.id=r.loan_id
  left join public.customer_profiles c on c.user_id=r.user_id
  left join auth.users u on u.id=r.user_id;
  return v_result;
end
$function$;

create or replace function public.admin_review_wallet_loan_repayment(
  p_repayment_id uuid,
  p_decision text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  r public.wallet_loan_repayment_requests%rowtype;
  l public.wallet_loans%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_new_repaid numeric(14,2);
  v_new_outstanding numeric(14,2);
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('verify','reject') then raise exception 'Choose verify or reject'; end if;
  if p_decision='reject' and char_length(btrim(coalesce(p_notes,'')))<3 then
    raise exception 'Add a rejection reason';
  end if;

  select * into r from public.wallet_loan_repayment_requests where id=p_repayment_id for update;
  if not found or r.payment_status<>'pending' then raise exception 'Pending repayment not found'; end if;
  select * into l from public.wallet_loans where id=r.loan_id for update;
  if not found then raise exception 'Loan not found'; end if;
  v_before:=to_jsonb(r);

  if p_decision='reject' then
    update public.wallet_loan_repayment_requests
    set payment_status='rejected',reviewed_at=now(),reviewed_by=auth.uid(),
        admin_notes=btrim(p_notes),updated_at=now()
    where id=r.id;
  else
    if r.amount_kes>l.outstanding_kes then
      raise exception 'Repayment exceeds the current outstanding balance';
    end if;
    v_new_repaid:=round(l.amount_repaid_kes+r.amount_kes,2);
    v_new_outstanding:=greatest(0,round(l.total_due_kes-v_new_repaid,2));

    update public.wallet_loan_repayment_requests
    set payment_status='verified',reviewed_at=now(),reviewed_by=auth.uid(),
        admin_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now()
    where id=r.id;

    update public.wallet_loans
    set amount_repaid_kes=v_new_repaid,
        outstanding_kes=v_new_outstanding,
        status=case when v_new_outstanding<=0 then 'paid' else status end,
        paid_at=case when v_new_outstanding<=0 then now() else paid_at end,
        updated_at=now()
    where id=l.id;
  end if;

  select to_jsonb(x) into v_after from public.wallet_loan_repayment_requests x where id=r.id;
  perform private.write_admin_audit(
    'wallet_loan.repayment.'||p_decision,'wallet_loan_repayment',r.id::text,v_before,v_after,
    jsonb_build_object('loan_id',r.loan_id,'notes',nullif(btrim(coalesce(p_notes,'')),''))
  );

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    r.user_id,'wallet_loan',
    case when p_decision='verify' then 'Loan repayment verified' else 'Loan repayment rejected' end,
    case when p_decision='verify'
      then 'Your repayment of KSh '||to_char(r.amount_kes,'FM999G999G990D00')||' has been applied to loan '||l.loan_reference||'.'
      else 'Your loan repayment was rejected.'||
        case when nullif(btrim(coalesce(p_notes,'')),'') is null then '' else ' Reason: '||btrim(p_notes) end
    end,
    'wallet_loan_repayment',r.id,'wallet_loan_repayment_'||p_decision||'_'||r.id::text,'wallet',
    jsonb_build_object('loan_id',r.loan_id,'amount_kes',r.amount_kes)
  );

  return jsonb_build_object('ok',true,'decision',p_decision,'repayment_id',r.id);
end
$function$;

create or replace function public.admin_wallet_loan_summary()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not private.is_leogo_admin('dashboard.read') then raise exception 'Admin access required'; end if;
  perform private.refresh_wallet_loan_statuses();
  return jsonb_build_object(
    'pending_applications',(select count(*) from public.wallet_loan_applications where application_status in ('pending','under_review')),
    'active_loans',(select count(*) from public.wallet_loans where status='active'),
    'overdue_loans',(select count(*) from public.wallet_loans where status='overdue'),
    'paid_loans',(select count(*) from public.wallet_loans where status='paid'),
    'principal_disbursed_kes',(select coalesce(sum(principal_kes),0) from public.wallet_loans),
    'outstanding_kes',(select coalesce(sum(outstanding_kes),0) from public.wallet_loans where status in ('active','overdue')),
    'pending_repayments',(select count(*) from public.wallet_loan_repayment_requests where payment_status='pending'),
    'verified_repayments_kes',(select coalesce(sum(amount_kes),0) from public.wallet_loan_repayment_requests where payment_status='verified')
  );
end
$function$;

revoke execute on function private.wallet_loan_eligibility(uuid) from public,anon,authenticated;
revoke execute on function private.refresh_wallet_loan_statuses() from public,anon,authenticated;

revoke execute on function public.get_my_wallet_loan_overview() from public,anon;
grant execute on function public.get_my_wallet_loan_overview() to authenticated;

revoke execute on function public.submit_wallet_loan_application_v2(numeric,text,boolean,integer) from public,anon;
grant execute on function public.submit_wallet_loan_application_v2(numeric,text,boolean,integer) to authenticated;

revoke execute on function public.submit_wallet_loan_application(bigint,text,boolean) from public,anon;
grant execute on function public.submit_wallet_loan_application(bigint,text,boolean) to authenticated;

revoke execute on function public.review_wallet_loan_application(uuid,text,text,uuid) from public,anon;
grant execute on function public.review_wallet_loan_application(uuid,text,text,uuid) to authenticated;

revoke execute on function public.submit_wallet_loan_repayment(uuid,numeric,text) from public,anon;
grant execute on function public.submit_wallet_loan_repayment(uuid,numeric,text) to authenticated;

revoke execute on function public.admin_get_wallet_loan_settings() from public,anon;
grant execute on function public.admin_get_wallet_loan_settings() to authenticated;

revoke execute on function public.admin_save_wallet_loan_settings(jsonb) from public,anon;
grant execute on function public.admin_save_wallet_loan_settings(jsonb) to authenticated;

revoke execute on function public.admin_list_wallet_loans() from public,anon;
grant execute on function public.admin_list_wallet_loans() to authenticated;

revoke execute on function public.admin_list_wallet_loan_repayments() from public,anon;
grant execute on function public.admin_list_wallet_loan_repayments() to authenticated;

revoke execute on function public.admin_review_wallet_loan_repayment(uuid,text,text) from public,anon;
grant execute on function public.admin_review_wallet_loan_repayment(uuid,text,text) to authenticated;

revoke execute on function public.admin_wallet_loan_summary() from public,anon;
grant execute on function public.admin_wallet_loan_summary() to authenticated;
