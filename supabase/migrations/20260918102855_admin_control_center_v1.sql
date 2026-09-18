-- LEOGO Admin Control Center V1
-- Separate administration foundation for the locked Customer Front.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 120),
  role text not null default 'admin'
    check (role in ('super_admin','admin','finance','operations','support','reviewer','read_only')),
  status text not null default 'active'
    check (status in ('active','suspended')),
  permissions text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

create index if not exists admin_users_role_status_idx
  on public.admin_users (status, role);
create index if not exists admin_users_created_by_idx
  on public.admin_users (created_by);

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;
grant select on table public.admin_users to authenticated;
grant all on table public.admin_users to service_role;

create or replace function private.is_leogo_admin(p_permission text default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users a
    where a.user_id = (select auth.uid())
      and a.status = 'active'
      and (
        p_permission is null
        or a.role in ('super_admin','admin')
        or p_permission = any(a.permissions)
      )
  );
$$;

revoke execute on function private.is_leogo_admin(text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_leogo_admin(text) to authenticated;

drop policy if exists "Admin users read own access" on public.admin_users;
create policy "Admin users read own access"
  on public.admin_users for select to authenticated
  using ((select auth.uid()) = user_id or private.is_leogo_admin('admin_users.read'));

create table if not exists public.business_settings (
  id smallint primary key default 1 check (id = 1),
  business_name text not null default 'LEOGO DIGITAL MARKET',
  primary_email text,
  secondary_email text,
  primary_phone text,
  alternative_phone text,
  whatsapp_number text,
  physical_address text,
  county text,
  sub_county text,
  town text,
  business_description text,
  customer_support_contact text,
  working_hours text,
  facebook_name text,
  facebook_url text,
  tiktok_name text,
  tiktok_url text,
  instagram_name text,
  instagram_url text,
  registration_number text,
  tax_number text,
  logo_url text,
  currency_code text not null default 'KES',
  currency_symbol text not null default 'KSh',
  timezone text not null default 'Africa/Nairobi',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists business_settings_updated_by_idx
  on public.business_settings (updated_by);

alter table public.business_settings enable row level security;
revoke all on table public.business_settings from anon, authenticated;
grant select on table public.business_settings to authenticated;
grant all on table public.business_settings to service_role;

drop policy if exists "Admins read business settings" on public.business_settings;
create policy "Admins read business settings"
  on public.business_settings for select to authenticated
  using (private.is_leogo_admin('settings.read'));

insert into public.business_settings (
  id, business_name, primary_email, secondary_email, primary_phone,
  whatsapp_number, physical_address, county, sub_county, town,
  business_description, customer_support_contact, working_hours,
  facebook_name, tiktok_name
) values (
  1, 'LEOGO DIGITAL MARKET', 'leogodigitalmarket@gmail.com',
  'leogodigitalmarket2@gmail.com', '0700192545', '+254700192545',
  'Opposite Ena Coach booking office, Door No A7', 'Siaya',
  'Alego Usonga', 'Siaya Town',
  'A trusted digital marketplace connecting customers to products, services, accommodation and Transport & Parcel Delivery.',
  '0700192545', 'To be configured by Admin',
  'Leogo Digital Market', 'Leogo Digital Market'
) on conflict (id) do nothing;

create table if not exists public.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 120),
  account_type text not null check (account_type in ('mpesa_till','mpesa_paybill','bank','other')),
  business_name text,
  account_name text,
  till_number text check (till_number is null or till_number ~ '^[0-9]{5,12}$'),
  paybill_number text check (paybill_number is null or paybill_number ~ '^[0-9]{5,12}$'),
  account_number text,
  bank_name text,
  branch text,
  purpose_description text,
  instructions text,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (
    (account_type = 'mpesa_till' and till_number is not null)
    or (account_type = 'mpesa_paybill' and paybill_number is not null)
    or (account_type = 'bank' and bank_name is not null and account_name is not null and account_number is not null)
    or (account_type = 'other' and (account_number is not null or instructions is not null))
  )
);

create index if not exists payment_accounts_status_type_idx
  on public.payment_accounts (status, account_type);
create index if not exists payment_accounts_created_by_idx
  on public.payment_accounts (created_by);
create index if not exists payment_accounts_updated_by_idx
  on public.payment_accounts (updated_by);

alter table public.payment_accounts enable row level security;
revoke all on table public.payment_accounts from anon, authenticated;
grant select on table public.payment_accounts to authenticated;
grant all on table public.payment_accounts to service_role;

drop policy if exists "Admins read payment accounts" on public.payment_accounts;
create policy "Admins read payment accounts"
  on public.payment_accounts for select to authenticated
  using (private.is_leogo_admin('payments.read'));

create table if not exists public.payment_account_assignments (
  function_code text primary key check (function_code in (
    'wallet_sacco_deposits','savings_challenge','loan_repayment',
    'marketplace_orders','lipa_pole_pole','premium_payments',
    'accommodation_payments','service_payments','transport_payments','other_revenue'
  )),
  account_id uuid not null references public.payment_accounts(id) on delete restrict,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_assignments_account_id_idx
  on public.payment_account_assignments (account_id);
create index if not exists payment_assignments_assigned_by_idx
  on public.payment_account_assignments (assigned_by);

alter table public.payment_account_assignments enable row level security;
revoke all on table public.payment_account_assignments from anon, authenticated;
grant select on table public.payment_account_assignments to authenticated;
grant all on table public.payment_account_assignments to service_role;

drop policy if exists "Admins read payment assignments" on public.payment_account_assignments;
create policy "Admins read payment assignments"
  on public.payment_account_assignments for select to authenticated
  using (private.is_leogo_admin('payments.read'));

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_actor_idx
  on public.admin_audit_log (actor_id, created_at desc);
create index if not exists admin_audit_log_entity_idx
  on public.admin_audit_log (entity_type, entity_id, created_at desc);

alter table public.admin_audit_log enable row level security;
revoke all on table public.admin_audit_log from anon, authenticated;
grant select on table public.admin_audit_log to authenticated;
grant all on table public.admin_audit_log to service_role;

drop policy if exists "Admins read audit log" on public.admin_audit_log;
create policy "Admins read audit log"
  on public.admin_audit_log for select to authenticated
  using (private.is_leogo_admin('audit.read'));

create or replace function private.write_admin_audit(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_before jsonb default null,
  p_after jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.admin_audit_log (
    actor_id, actor_email, action, entity_type, entity_id,
    before_data, after_data, metadata
  ) values (
    (select auth.uid()),
    (select email from auth.users where id = (select auth.uid())),
    p_action, p_entity_type, p_entity_id, p_before, p_after,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke execute on function private.write_admin_audit(text,text,text,jsonb,jsonb,jsonb)
  from public, anon, authenticated;

-- Bootstrap the project owner as Super Admin without hard-coding a generated UUID.
insert into public.admin_users (user_id, display_name, role, status)
select u.id, coalesce(nullif(u.raw_user_meta_data->>'full_name',''), 'LEOGO Super Admin'), 'super_admin', 'active'
from auth.users u
where lower(u.email) = lower('leogodigitalmarket2@gmail.com')
on conflict (user_id) do update set
  display_name = excluded.display_name,
  role = 'super_admin',
  status = 'active',
  updated_at = now();

insert into public.admin_audit_log (actor_id, actor_email, action, entity_type, entity_id, after_data, metadata)
select u.id, u.email, 'admin.bootstrap', 'admin_user', u.id::text,
       jsonb_build_object('role','super_admin','status','active'),
       jsonb_build_object('source','Admin Control Center V1 migration')
from auth.users u
where lower(u.email) = lower('leogodigitalmarket2@gmail.com')
  and not exists (
    select 1 from public.admin_audit_log l
    where l.action='admin.bootstrap' and l.entity_id=u.id::text
  );

-- Admin read access to existing customer modules. RLS remains enabled.
grant select on table
  public.customer_profiles,
  public.premium_plans,
  public.premium_profiles,
  public.premium_profile_details,
  public.premium_identity_details,
  public.premium_customers,
  public.premium_customer_private_details,
  public.premium_membership_payments,
  public.premium_memberships,
  public.wallet_accounts,
  public.wallet_challenges,
  public.wallet_deposit_requests,
  public.wallet_ledger_entries,
  public.wallet_loan_applications,
  public.wallet_withdrawal_requests,
  public.wallet_settings,
  public.wallet_shopping_rewards,
  public.wallet_statement_downloads,
  public.accommodation_hosts,
  public.accommodation_properties,
  public.accommodation_units,
  public.accommodation_bookings,
  public.pickup_stations
to authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'customer_profiles','premium_plans','premium_profiles','premium_profile_details',
    'premium_identity_details','premium_customers','premium_customer_private_details',
    'premium_membership_payments','premium_memberships','wallet_accounts','wallet_challenges',
    'wallet_deposit_requests','wallet_ledger_entries','wallet_loan_applications',
    'wallet_withdrawal_requests','wallet_settings','wallet_shopping_rewards',
    'wallet_statement_downloads','accommodation_hosts','accommodation_properties',
    'accommodation_units','accommodation_bookings','pickup_stations'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'LEOGO admins read all', v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.is_leogo_admin(''data.read''))',
      'LEOGO admins read all', v_table
    );
  end loop;
end $$;

create or replace function public.admin_dashboard_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_leogo_admin('dashboard.read') then
    raise exception 'Admin access required';
  end if;
  return jsonb_build_object(
    'customers', (select count(*) from public.customer_profiles),
    'pending_approvals', (
      (select count(*) from public.premium_customers where application_status in ('submitted','under_review')) +
      (select count(*) from public.premium_profiles where application_status in ('submitted','under_review')) +
      (select count(*) from public.premium_membership_payments where payment_status='pending') +
      (select count(*) from public.wallet_deposit_requests where request_status='pending') +
      (select count(*) from public.wallet_loan_applications where application_status in ('pending','under_review')) +
      (select count(*) from public.wallet_withdrawal_requests where request_status in ('pending_call','approved_processing')) +
      (select count(*) from public.accommodation_hosts where verification_status in ('pending','under_review')) +
      (select count(*) from public.accommodation_properties where approval_status in ('submitted','under_review'))
    ),
    'wallet_pending', (select count(*) from public.wallet_deposit_requests where request_status='pending'),
    'premium_pending', (
      (select count(*) from public.premium_customers where application_status in ('submitted','under_review')) +
      (select count(*) from public.premium_profiles where application_status in ('submitted','under_review')) +
      (select count(*) from public.premium_membership_payments where payment_status='pending')
    ),
    'pickup_stations', (select count(*) from public.pickup_stations where is_active),
    'active_payment_accounts', (select count(*) from public.payment_accounts where status='active'),
    'generated_at', now()
  );
end;
$$;

create or replace function public.admin_list_customers()
returns table (
  user_id uuid,
  email text,
  full_name text,
  phone text,
  county text,
  sub_county text,
  estate text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_leogo_admin('customers.read') then
    raise exception 'Admin access required';
  end if;
  return query
  select u.id, u.email::text, p.full_name, p.phone, p.county, p.sub_county,
         p.estate, u.created_at, u.last_sign_in_at
  from auth.users u
  left join public.customer_profiles p on p.user_id=u.id
  order by u.created_at desc;
end;
$$;

create or replace function public.admin_list_approval_queue()
returns table (
  kind text,
  record_id uuid,
  applicant_id uuid,
  applicant_name text,
  applicant_email text,
  title text,
  subtitle text,
  amount_kes numeric,
  status text,
  submitted_at timestamptz,
  payload jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_leogo_admin('approvals.read') then
    raise exception 'Admin access required';
  end if;
  return query
  select 'premium_customer'::text, c.user_id, c.user_id,
         coalesce(d.real_name, u.email::text, 'Premium Customer'), u.email::text,
         'Premium Customer Application'::text,
         concat_ws(' · ', c.sex, c.age::text || ' years', c.location),
         null::numeric, c.application_status, coalesce(c.submitted_at,c.created_at),
         to_jsonb(c) || coalesce(to_jsonb(d),'{}'::jsonb)
  from public.premium_customers c
  left join public.premium_customer_private_details d on d.user_id=c.user_id
  left join auth.users u on u.id=c.user_id
  where c.application_status in ('submitted','under_review')
  union all
  select 'premium_profile', p.user_id, p.user_id,
         coalesce(i.real_name,p.display_name,u.email::text,'Premium Profile'), u.email::text,
         'Verified Premium Profile'::text,
         concat_ws(' · ',p.display_name,p.gender,p.general_location),
         null::numeric,p.application_status,coalesce(p.submitted_at,p.created_at),
         to_jsonb(p) || coalesce(to_jsonb(i),'{}'::jsonb)
  from public.premium_profiles p
  left join public.premium_identity_details i on i.user_id=p.user_id
  left join auth.users u on u.id=p.user_id
  where p.application_status in ('submitted','under_review')
  union all
  select 'premium_payment', pay.id, pay.user_id,
         coalesce(cp.full_name,u.email::text,'Premium Customer'),u.email::text,
         pay.plan_name,
         'Premium membership payment · ' || pay.payment_reference,
         pay.amount_kes::numeric,pay.payment_status,pay.submitted_at,to_jsonb(pay)
  from public.premium_membership_payments pay
  left join public.customer_profiles cp on cp.user_id=pay.user_id
  left join auth.users u on u.id=pay.user_id
  where pay.payment_status='pending'
  union all
  select 'wallet_deposit',d.id,d.user_id,
         coalesce(cp.full_name,u.email::text,'Wallet Customer'),u.email::text,
         case when d.deposit_kind='daily_challenge' then 'Daily Saving Challenge' else 'Wallet Saving Deposit' end,
         'Payment reference · ' || d.payment_reference,
         d.requested_amount_kes::numeric,d.request_status,d.submitted_at,to_jsonb(d)
  from public.wallet_deposit_requests d
  left join public.customer_profiles cp on cp.user_id=d.user_id
  left join auth.users u on u.id=d.user_id
  where d.request_status='pending'
  union all
  select 'wallet_loan',l.id,l.user_id,
         coalesce(cp.full_name,u.email::text,'Loan Applicant'),u.email::text,
         'Wallet Loan Application'::text,l.purpose,
         l.requested_amount_kes::numeric,l.application_status,l.submitted_at,to_jsonb(l)
  from public.wallet_loan_applications l
  left join public.customer_profiles cp on cp.user_id=l.user_id
  left join auth.users u on u.id=l.user_id
  where l.application_status in ('pending','under_review')
  union all
  select 'wallet_withdrawal',w.id,w.user_id,
         coalesce(cp.full_name,u.email::text,'Wallet Customer'),u.email::text,
         'Wallet Withdrawal Request'::text,
         concat_ws(' · ',w.settlement_method,w.account_name,w.account_number),
         w.requested_amount_kes,w.request_status,w.submitted_at,to_jsonb(w)
  from public.wallet_withdrawal_requests w
  left join public.customer_profiles cp on cp.user_id=w.user_id
  left join auth.users u on u.id=w.user_id
  where w.request_status in ('pending_call','approved_processing')
  union all
  select 'accommodation_host',h.id,h.user_id,
         h.business_name,u.email::text,'Accommodation Host Application'::text,
         concat_ws(' · ',h.contact_phone,h.contact_email),null::numeric,
         h.verification_status,h.created_at,to_jsonb(h)
  from public.accommodation_hosts h
  left join auth.users u on u.id=h.user_id
  where h.verification_status in ('pending','under_review')
  union all
  select 'accommodation_property',p.id,h.user_id,
         h.business_name,u.email::text,p.property_name,
         concat_ws(' · ',p.property_type,p.town,p.county),null::numeric,
         p.approval_status,p.created_at,to_jsonb(p)
  from public.accommodation_properties p
  join public.accommodation_hosts h on h.id=p.host_id
  left join auth.users u on u.id=h.user_id
  where p.approval_status in ('submitted','under_review')
  order by submitted_at desc;
end;
$$;

create or replace function public.admin_review_approval(
  p_kind text,
  p_record_id uuid,
  p_decision text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_action text;
begin
  if not private.is_leogo_admin('approvals.manage') then
    raise exception 'Approval permission required';
  end if;
  if p_decision not in ('approve','reject','under_review','contacted') then
    raise exception 'Unsupported approval decision';
  end if;
  if p_decision='reject' and char_length(btrim(coalesce(p_notes,''))) < 3 then
    raise exception 'A rejection reason is required';
  end if;

  case p_kind
    when 'premium_customer' then
      select to_jsonb(t) into v_before from public.premium_customers t where user_id=p_record_id for update;
      if v_before is null then raise exception 'Premium customer application not found'; end if;
      update public.premium_customers set
        application_status=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'under_review' end,
        approved_at=case when p_decision='approve' then now() else null end,
        updated_at=now()
      where user_id=p_record_id and application_status in ('submitted','under_review');
      if not found then raise exception 'Application has already been reviewed'; end if;
      select to_jsonb(t) into v_after from public.premium_customers t where user_id=p_record_id;
    when 'premium_profile' then
      select to_jsonb(t) into v_before from public.premium_profiles t where user_id=p_record_id for update;
      if v_before is null then raise exception 'Premium profile application not found'; end if;
      update public.premium_profiles set
        application_status=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'under_review' end,
        approved_at=case when p_decision='approve' then now() else null end,
        updated_at=now()
      where user_id=p_record_id and application_status in ('submitted','under_review');
      if not found then raise exception 'Application has already been reviewed'; end if;
      select to_jsonb(t) into v_after from public.premium_profiles t where user_id=p_record_id;
    when 'premium_payment' then
      select to_jsonb(t) into v_before from public.premium_membership_payments t where id=p_record_id for update;
      if v_before is null then raise exception 'Premium payment not found'; end if;
      if p_decision not in ('approve','reject') then raise exception 'Choose approve or reject'; end if;
      update public.premium_membership_payments set
        payment_status=case when p_decision='approve' then 'confirmed' else 'rejected' end,
        reviewed_at=now(),reviewed_by=(select auth.uid()),admin_notes=nullif(btrim(p_notes),'')
      where id=p_record_id and payment_status='pending';
      if not found then raise exception 'Payment has already been reviewed'; end if;
      select to_jsonb(t) into v_after from public.premium_membership_payments t where id=p_record_id;
    when 'wallet_deposit' then
      select to_jsonb(t) into v_before from public.wallet_deposit_requests t where id=p_record_id;
      if p_decision not in ('approve','reject') then raise exception 'Choose approve or reject'; end if;
      perform public.review_wallet_deposit(p_record_id,p_decision='approve',p_notes,(select auth.uid()));
      select to_jsonb(t) into v_after from public.wallet_deposit_requests t where id=p_record_id;
    when 'wallet_loan' then
      select to_jsonb(t) into v_before from public.wallet_loan_applications t where id=p_record_id;
      perform public.review_wallet_loan_application(
        p_record_id,
        case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'under_review' end,
        p_notes,(select auth.uid())
      );
      select to_jsonb(t) into v_after from public.wallet_loan_applications t where id=p_record_id;
    when 'wallet_withdrawal' then
      select to_jsonb(t) into v_before from public.wallet_withdrawal_requests t where id=p_record_id;
      if p_decision='contacted' then
        perform public.admin_mark_wallet_withdrawal_contacted(p_record_id,(select auth.uid()),p_notes);
      elsif p_decision='approve' then
        perform public.admin_approve_wallet_withdrawal(p_record_id,(select auth.uid()),p_notes);
      elsif p_decision='reject' then
        perform public.admin_reject_wallet_withdrawal(p_record_id,(select auth.uid()),p_notes);
      else
        raise exception 'Choose contacted, approve or reject';
      end if;
      select to_jsonb(t) into v_after from public.wallet_withdrawal_requests t where id=p_record_id;
    when 'accommodation_host' then
      select to_jsonb(t) into v_before from public.accommodation_hosts t where id=p_record_id for update;
      update public.accommodation_hosts set
        verification_status=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'under_review' end,
        updated_at=now()
      where id=p_record_id and verification_status in ('pending','under_review');
      if not found then raise exception 'Host application has already been reviewed'; end if;
      select to_jsonb(t) into v_after from public.accommodation_hosts t where id=p_record_id;
    when 'accommodation_property' then
      select to_jsonb(t) into v_before from public.accommodation_properties t where id=p_record_id for update;
      update public.accommodation_properties set
        approval_status=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'under_review' end,
        is_published=case when p_decision='approve' then true else false end,
        approved_at=case when p_decision='approve' then now() else null end,
        updated_at=now()
      where id=p_record_id and approval_status in ('submitted','under_review');
      if not found then raise exception 'Property has already been reviewed'; end if;
      select to_jsonb(t) into v_after from public.accommodation_properties t where id=p_record_id;
    else
      raise exception 'Unsupported approval type';
  end case;

  v_action := 'approval.' || p_kind || '.' || p_decision;
  perform private.write_admin_audit(v_action,p_kind,p_record_id::text,v_before,v_after,
    jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),'')));
  return jsonb_build_object('ok',true,'kind',p_kind,'record_id',p_record_id,'decision',p_decision);
end;
$$;

create or replace function public.admin_update_business_settings(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not private.is_leogo_admin('settings.manage') then raise exception 'Settings permission required'; end if;
  if char_length(btrim(coalesce(p_settings->>'business_name',''))) < 2 then raise exception 'Business name is required'; end if;
  select to_jsonb(t) into v_before from public.business_settings t where id=1 for update;
  update public.business_settings set
    business_name=btrim(p_settings->>'business_name'),
    primary_email=nullif(btrim(p_settings->>'primary_email'),''),
    secondary_email=nullif(btrim(p_settings->>'secondary_email'),''),
    primary_phone=nullif(btrim(p_settings->>'primary_phone'),''),
    alternative_phone=nullif(btrim(p_settings->>'alternative_phone'),''),
    whatsapp_number=nullif(btrim(p_settings->>'whatsapp_number'),''),
    physical_address=nullif(btrim(p_settings->>'physical_address'),''),
    county=nullif(btrim(p_settings->>'county'),''),
    sub_county=nullif(btrim(p_settings->>'sub_county'),''),
    town=nullif(btrim(p_settings->>'town'),''),
    business_description=nullif(btrim(p_settings->>'business_description'),''),
    customer_support_contact=nullif(btrim(p_settings->>'customer_support_contact'),''),
    working_hours=nullif(btrim(p_settings->>'working_hours'),''),
    facebook_name=nullif(btrim(p_settings->>'facebook_name'),''),
    facebook_url=nullif(btrim(p_settings->>'facebook_url'),''),
    tiktok_name=nullif(btrim(p_settings->>'tiktok_name'),''),
    tiktok_url=nullif(btrim(p_settings->>'tiktok_url'),''),
    instagram_name=nullif(btrim(p_settings->>'instagram_name'),''),
    instagram_url=nullif(btrim(p_settings->>'instagram_url'),''),
    registration_number=nullif(btrim(p_settings->>'registration_number'),''),
    tax_number=nullif(btrim(p_settings->>'tax_number'),''),
    logo_url=nullif(btrim(p_settings->>'logo_url'),''),
    currency_code=coalesce(nullif(btrim(p_settings->>'currency_code'),''),'KES'),
    currency_symbol=coalesce(nullif(btrim(p_settings->>'currency_symbol'),''),'KSh'),
    timezone=coalesce(nullif(btrim(p_settings->>'timezone'),''),'Africa/Nairobi'),
    updated_by=(select auth.uid()),updated_at=now()
  where id=1;
  select to_jsonb(t) into v_after from public.business_settings t where id=1;
  perform private.write_admin_audit('settings.business.updated','business_settings','1',v_before,v_after);
  return v_after;
end;
$$;

create or replace function public.admin_save_payment_account(p_account_id uuid, p_account jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_type text := p_account->>'account_type';
  v_before jsonb;
  v_after jsonb;
begin
  if not private.is_leogo_admin('payments.manage') then raise exception 'Payment settings permission required'; end if;
  if char_length(btrim(coalesce(p_account->>'display_name',''))) < 2 then raise exception 'Account name is required'; end if;
  if v_type not in ('mpesa_till','mpesa_paybill','bank','other') then raise exception 'Choose a valid payment type'; end if;
  if p_account_id is null then
    insert into public.payment_accounts (
      display_name,account_type,business_name,account_name,till_number,paybill_number,
      account_number,bank_name,branch,purpose_description,instructions,status,created_by,updated_by
    ) values (
      btrim(p_account->>'display_name'),v_type,nullif(btrim(p_account->>'business_name'),''),
      nullif(btrim(p_account->>'account_name'),''),nullif(btrim(p_account->>'till_number'),''),
      nullif(btrim(p_account->>'paybill_number'),''),nullif(btrim(p_account->>'account_number'),''),
      nullif(btrim(p_account->>'bank_name'),''),nullif(btrim(p_account->>'branch'),''),
      nullif(btrim(p_account->>'purpose_description'),''),nullif(btrim(p_account->>'instructions'),''),
      coalesce(nullif(p_account->>'status',''),'active'),(select auth.uid()),(select auth.uid())
    ) returning id into v_id;
    select to_jsonb(t) into v_after from public.payment_accounts t where id=v_id;
    perform private.write_admin_audit('payment_account.created','payment_account',v_id::text,null,v_after);
  else
    select to_jsonb(t) into v_before from public.payment_accounts t where id=p_account_id for update;
    if v_before is null then raise exception 'Payment account not found'; end if;
    update public.payment_accounts set
      display_name=btrim(p_account->>'display_name'),account_type=v_type,
      business_name=nullif(btrim(p_account->>'business_name'),''),account_name=nullif(btrim(p_account->>'account_name'),''),
      till_number=nullif(btrim(p_account->>'till_number'),''),paybill_number=nullif(btrim(p_account->>'paybill_number'),''),
      account_number=nullif(btrim(p_account->>'account_number'),''),bank_name=nullif(btrim(p_account->>'bank_name'),''),
      branch=nullif(btrim(p_account->>'branch'),''),purpose_description=nullif(btrim(p_account->>'purpose_description'),''),
      instructions=nullif(btrim(p_account->>'instructions'),''),updated_by=(select auth.uid()),updated_at=now()
    where id=p_account_id;
    v_id := p_account_id;
    select to_jsonb(t) into v_after from public.payment_accounts t where id=v_id;
    perform private.write_admin_audit('payment_account.updated','payment_account',v_id::text,v_before,v_after);
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_set_payment_account_status(p_account_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_before jsonb; v_after jsonb;
begin
  if not private.is_leogo_admin('payments.manage') then raise exception 'Payment settings permission required'; end if;
  if p_status not in ('active','inactive','archived') then raise exception 'Invalid payment account status'; end if;
  select to_jsonb(t) into v_before from public.payment_accounts t where id=p_account_id for update;
  if v_before is null then raise exception 'Payment account not found'; end if;
  update public.payment_accounts set status=p_status,updated_by=(select auth.uid()),updated_at=now(),
    archived_at=case when p_status='archived' then now() else null end where id=p_account_id;
  if p_status<>'active' then delete from public.payment_account_assignments where account_id=p_account_id; end if;
  select to_jsonb(t) into v_after from public.payment_accounts t where id=p_account_id;
  perform private.write_admin_audit('payment_account.'||p_status,'payment_account',p_account_id::text,v_before,v_after);
end;
$$;

create or replace function public.admin_assign_payment_account(p_function_code text, p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_before jsonb; v_after jsonb;
begin
  if not private.is_leogo_admin('payments.manage') then raise exception 'Payment settings permission required'; end if;
  if not exists(select 1 from public.payment_accounts where id=p_account_id and status='active') then
    raise exception 'Choose an active payment account';
  end if;
  select to_jsonb(t) into v_before from public.payment_account_assignments t where function_code=p_function_code;
  insert into public.payment_account_assignments(function_code,account_id,assigned_by,assigned_at,updated_at)
  values(p_function_code,p_account_id,(select auth.uid()),now(),now())
  on conflict(function_code) do update set account_id=excluded.account_id,assigned_by=excluded.assigned_by,
    assigned_at=now(),updated_at=now();
  select to_jsonb(t) into v_after from public.payment_account_assignments t where function_code=p_function_code;
  perform private.write_admin_audit('payment_assignment.updated','payment_assignment',p_function_code,v_before,v_after);
end;
$$;

create or replace function public.admin_save_pickup_station(p_station_id uuid, p_station jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_before jsonb; v_after jsonb; v_fee numeric;
begin
  if not private.is_leogo_admin('delivery.manage') then raise exception 'Delivery settings permission required'; end if;
  v_fee := coalesce((p_station->>'service_fee_percent')::numeric,0);
  if v_fee < 0 or v_fee > 100 then raise exception 'Pickup fee must be between 0 and 100 percent'; end if;
  if char_length(btrim(coalesce(p_station->>'station_name',''))) < 2 then raise exception 'Station name is required'; end if;
  if p_station_id is null then
    insert into public.pickup_stations(station_name,county,sub_county,town,address_line,landmark,door_number,
      service_fee_percent,is_active,display_order,updated_by)
    values(btrim(p_station->>'station_name'),btrim(p_station->>'county'),btrim(p_station->>'sub_county'),
      btrim(p_station->>'town'),btrim(p_station->>'address_line'),nullif(btrim(p_station->>'landmark'),''),
      nullif(btrim(p_station->>'door_number'),''),v_fee,coalesce((p_station->>'is_active')::boolean,true),
      coalesce((p_station->>'display_order')::smallint,0),(select auth.uid())) returning id into v_id;
    select to_jsonb(t) into v_after from public.pickup_stations t where id=v_id;
    perform private.write_admin_audit('pickup_station.created','pickup_station',v_id::text,null,v_after);
  else
    select to_jsonb(t) into v_before from public.pickup_stations t where id=p_station_id for update;
    if v_before is null then raise exception 'Pickup station not found'; end if;
    update public.pickup_stations set station_name=btrim(p_station->>'station_name'),county=btrim(p_station->>'county'),
      sub_county=btrim(p_station->>'sub_county'),town=btrim(p_station->>'town'),address_line=btrim(p_station->>'address_line'),
      landmark=nullif(btrim(p_station->>'landmark'),''),door_number=nullif(btrim(p_station->>'door_number'),''),
      service_fee_percent=v_fee,is_active=coalesce((p_station->>'is_active')::boolean,true),
      display_order=coalesce((p_station->>'display_order')::smallint,0),updated_by=(select auth.uid()),updated_at=now()
    where id=p_station_id;
    v_id:=p_station_id;
    select to_jsonb(t) into v_after from public.pickup_stations t where id=v_id;
    perform private.write_admin_audit('pickup_station.updated','pickup_station',v_id::text,v_before,v_after);
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_save_wallet_settings(
  p_maintenance_fee_kes numeric,
  p_reward_minimum_spend_kes numeric,
  p_reward_rate numeric,
  p_statement_fee_per_200_kes numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_before jsonb; v_after jsonb;
begin
  if not private.is_leogo_admin('fees.manage') then raise exception 'Fee settings permission required'; end if;
  if least(p_maintenance_fee_kes,p_reward_minimum_spend_kes,p_reward_rate,p_statement_fee_per_200_kes) < 0 then
    raise exception 'Fees and rates cannot be negative';
  end if;
  if p_reward_rate > 1 then raise exception 'Reward rate must be entered as a decimal, for example 0.001'; end if;
  select to_jsonb(t) into v_before from public.wallet_settings t where id=1 for update;
  update public.wallet_settings set maintenance_fee_kes=p_maintenance_fee_kes,
    reward_minimum_spend_kes=p_reward_minimum_spend_kes,reward_rate=p_reward_rate,
    statement_fee_per_200_kes=p_statement_fee_per_200_kes,
    updated_by=(select auth.uid()),updated_at=now() where id=1;
  select to_jsonb(t) into v_after from public.wallet_settings t where id=1;
  perform private.write_admin_audit('fees.wallet.updated','wallet_settings','1',v_before,v_after);
end;
$$;

create or replace function public.admin_save_premium_plan(
  p_plan_id uuid,
  p_amount_kes integer,
  p_duration_hours integer,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_before jsonb; v_after jsonb;
begin
  if not private.is_leogo_admin('premium.manage') then raise exception 'Premium settings permission required'; end if;
  if p_amount_kes <= 0 or p_duration_hours <= 0 then raise exception 'Plan amount and duration must be above zero'; end if;
  select to_jsonb(t) into v_before from public.premium_plans t where id=p_plan_id for update;
  if v_before is null then raise exception 'Premium plan not found'; end if;
  update public.premium_plans set amount_kes=p_amount_kes,duration_hours=p_duration_hours,
    is_active=p_is_active,updated_at=now() where id=p_plan_id;
  select to_jsonb(t) into v_after from public.premium_plans t where id=p_plan_id;
  perform private.write_admin_audit('premium_plan.updated','premium_plan',p_plan_id::text,v_before,v_after);
end;
$$;

-- Explicitly protect and expose only the intended Admin RPC surface.
revoke execute on function public.admin_dashboard_summary() from public, anon;
revoke execute on function public.admin_list_customers() from public, anon;
revoke execute on function public.admin_list_approval_queue() from public, anon;
revoke execute on function public.admin_review_approval(text,uuid,text,text) from public, anon;
revoke execute on function public.admin_update_business_settings(jsonb) from public, anon;
revoke execute on function public.admin_save_payment_account(uuid,jsonb) from public, anon;
revoke execute on function public.admin_set_payment_account_status(uuid,text) from public, anon;
revoke execute on function public.admin_assign_payment_account(text,uuid) from public, anon;
revoke execute on function public.admin_save_pickup_station(uuid,jsonb) from public, anon;
revoke execute on function public.admin_save_wallet_settings(numeric,numeric,numeric,numeric) from public, anon;
revoke execute on function public.admin_save_premium_plan(uuid,integer,integer,boolean) from public, anon;

grant execute on function public.admin_dashboard_summary() to authenticated;
grant execute on function public.admin_list_customers() to authenticated;
grant execute on function public.admin_list_approval_queue() to authenticated;
grant execute on function public.admin_review_approval(text,uuid,text,text) to authenticated;
grant execute on function public.admin_update_business_settings(jsonb) to authenticated;
grant execute on function public.admin_save_payment_account(uuid,jsonb) to authenticated;
grant execute on function public.admin_set_payment_account_status(uuid,text) to authenticated;
grant execute on function public.admin_assign_payment_account(text,uuid) to authenticated;
grant execute on function public.admin_save_pickup_station(uuid,jsonb) to authenticated;
grant execute on function public.admin_save_wallet_settings(numeric,numeric,numeric,numeric) to authenticated;
grant execute on function public.admin_save_premium_plan(uuid,integer,integer,boolean) to authenticated;

notify pgrst, 'reload schema';
