
-- LEOGO DIGITAL MARKET V2
-- Loans V2: identity verification + savings-history and asset-secured loans.
-- Asset recovery is explicit and audited; there is no automatic disposal/sale.

alter table public.wallet_loan_settings
  add column if not exists asset_applications_enabled boolean not null default false,
  add column if not exists asset_max_loan_amount_kes numeric(14,2) not null default 50000,
  add column if not exists asset_loan_to_value_percent numeric(8,4) not null default 50,
  add column if not exists asset_interest_percent numeric(8,4) not null default 5,
  add column if not exists asset_processing_fee_percent numeric(8,4) not null default 0,
  add column if not exists asset_default_term_days integer not null default 30,
  add column if not exists asset_grace_days integer not null default 3,
  add column if not exists asset_overdue_penalty_percent numeric(8,4) not null default 0,
  add column if not exists asset_recovery_after_overdue_days integer not null default 30;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='wallet_loan_settings_asset_max_check' and conrelid='public.wallet_loan_settings'::regclass) then
    alter table public.wallet_loan_settings add constraint wallet_loan_settings_asset_max_check check(asset_max_loan_amount_kes>0);
  end if;
  if not exists(select 1 from pg_constraint where conname='wallet_loan_settings_asset_ltv_check' and conrelid='public.wallet_loan_settings'::regclass) then
    alter table public.wallet_loan_settings add constraint wallet_loan_settings_asset_ltv_check check(asset_loan_to_value_percent>0 and asset_loan_to_value_percent<=100);
  end if;
  if not exists(select 1 from pg_constraint where conname='wallet_loan_settings_asset_interest_check' and conrelid='public.wallet_loan_settings'::regclass) then
    alter table public.wallet_loan_settings add constraint wallet_loan_settings_asset_interest_check check(asset_interest_percent>=0 and asset_interest_percent<=100);
  end if;
  if not exists(select 1 from pg_constraint where conname='wallet_loan_settings_asset_fee_check' and conrelid='public.wallet_loan_settings'::regclass) then
    alter table public.wallet_loan_settings add constraint wallet_loan_settings_asset_fee_check check(asset_processing_fee_percent>=0 and asset_processing_fee_percent<=100);
  end if;
  if not exists(select 1 from pg_constraint where conname='wallet_loan_settings_asset_term_check' and conrelid='public.wallet_loan_settings'::regclass) then
    alter table public.wallet_loan_settings add constraint wallet_loan_settings_asset_term_check check(asset_default_term_days between 1 and 3650);
  end if;
  if not exists(select 1 from pg_constraint where conname='wallet_loan_settings_asset_grace_check' and conrelid='public.wallet_loan_settings'::regclass) then
    alter table public.wallet_loan_settings add constraint wallet_loan_settings_asset_grace_check check(asset_grace_days between 0 and 365);
  end if;
  if not exists(select 1 from pg_constraint where conname='wallet_loan_settings_asset_penalty_check' and conrelid='public.wallet_loan_settings'::regclass) then
    alter table public.wallet_loan_settings add constraint wallet_loan_settings_asset_penalty_check check(asset_overdue_penalty_percent>=0 and asset_overdue_penalty_percent<=100);
  end if;
  if not exists(select 1 from pg_constraint where conname='wallet_loan_settings_asset_recovery_days_check' and conrelid='public.wallet_loan_settings'::regclass) then
    alter table public.wallet_loan_settings add constraint wallet_loan_settings_asset_recovery_days_check check(asset_recovery_after_overdue_days between 0 and 3650);
  end if;
end $$;

alter table public.wallet_loan_applications
  add column if not exists loan_type text not null default 'savings_history',
  add column if not exists identity_type text,
  add column if not exists identity_number text,
  add column if not exists identity_front_path text,
  add column if not exists identity_back_path text,
  add column if not exists applicant_passport_photo_path text,
  add column if not exists asset_terms_accepted boolean not null default false,
  add column if not exists recovery_after_overdue_days_snapshot integer;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='wallet_loan_applications_loan_type_check' and conrelid='public.wallet_loan_applications'::regclass) then
    alter table public.wallet_loan_applications add constraint wallet_loan_applications_loan_type_check check(loan_type in ('savings_history','asset_secured'));
  end if;
  if not exists(select 1 from pg_constraint where conname='wallet_loan_applications_identity_type_check' and conrelid='public.wallet_loan_applications'::regclass) then
    alter table public.wallet_loan_applications add constraint wallet_loan_applications_identity_type_check check(identity_type is null or identity_type in ('national_id','passport'));
  end if;
end $$;

create table if not exists public.wallet_loan_asset_collateral (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.wallet_loan_applications(id) on delete restrict,
  loan_id uuid unique references public.wallet_loans(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  pickup_station_id uuid not null references public.pickup_stations(id) on delete restrict,
  asset_type text not null,
  asset_name text not null,
  brand text,
  model text,
  serial_number text,
  asset_description text not null,
  declared_value_kes numeric(14,2),
  asset_photo_paths text[] not null default '{}',
  ownership_proof_type text not null,
  ownership_proof_path text not null,
  custody_status text not null default 'awaiting_dropoff',
  station_received_at timestamptz,
  station_received_by uuid references auth.users(id) on delete set null,
  received_photo_paths text[] not null default '{}',
  receiving_notes text,
  inspected_at timestamptz,
  inspected_by uuid references auth.users(id) on delete set null,
  inspection_value_kes numeric(14,2),
  condition_grade text,
  inspection_notes text,
  inspection_photo_paths text[] not null default '{}',
  stored_at timestamptz,
  release_authorized_at timestamptz,
  released_at timestamptz,
  released_by uuid references auth.users(id) on delete set null,
  release_photo_path text,
  release_notes text,
  recovery_review_at timestamptz,
  recovery_authorized_at timestamptz,
  recovery_authorized_by uuid references auth.users(id) on delete set null,
  recovery_notes text,
  sale_recorded_at timestamptz,
  sale_recorded_by uuid references auth.users(id) on delete set null,
  sale_amount_kes numeric(14,2),
  sale_reference text,
  sale_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(cardinality(asset_photo_paths)>=4 and cardinality(asset_photo_paths)<=8),
  check(ownership_proof_type in ('receipt','police_abstract','other')),
  check(custody_status in (
    'awaiting_dropoff','received','stored','return_required','release_ready','released',
    'recovery_review','sale_authorized','sold'
  )),
  check(declared_value_kes is null or declared_value_kes>0),
  check(inspection_value_kes is null or inspection_value_kes>0),
  check(sale_amount_kes is null or sale_amount_kes>=0)
);
create index if not exists wallet_loan_asset_station_status_idx on public.wallet_loan_asset_collateral(pickup_station_id,custody_status,created_at desc);
create index if not exists wallet_loan_asset_user_idx on public.wallet_loan_asset_collateral(user_id,created_at desc);
alter table public.wallet_loan_asset_collateral enable row level security;
revoke all on public.wallet_loan_asset_collateral from anon,authenticated;

create table if not exists public.wallet_loan_asset_events (
  id uuid primary key default gen_random_uuid(),
  collateral_id uuid not null references public.wallet_loan_asset_collateral(id) on delete restrict,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null,
  notes text,
  evidence_paths text[] not null default '{}',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  check(actor_role in ('customer','pickup_station','admin','system'))
);
create index if not exists wallet_loan_asset_events_collateral_idx on public.wallet_loan_asset_events(collateral_id,created_at desc);
alter table public.wallet_loan_asset_events enable row level security;
revoke all on public.wallet_loan_asset_events from anon,authenticated;

alter table public.wallet_loans
  add column if not exists loan_type text not null default 'savings_history',
  add column if not exists collateral_id uuid references public.wallet_loan_asset_collateral(id) on delete restrict,
  add column if not exists recovery_after_overdue_days integer not null default 0;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='wallet_loans_loan_type_check' and conrelid='public.wallet_loans'::regclass) then
    alter table public.wallet_loans add constraint wallet_loans_loan_type_check check(loan_type in ('savings_history','asset_secured'));
  end if;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'loan-private-documents','loan-private-documents',false,8388608,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict(id) do update set
  public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'loan-asset-media','loan-asset-media',false,8388608,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict(id) do update set
  public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Loan customer uploads private documents" on storage.objects;
create policy "Loan customer uploads private documents" on storage.objects
for insert to authenticated
with check(bucket_id='loan-private-documents' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "Loan customer reads own private documents" on storage.objects;
create policy "Loan customer reads own private documents" on storage.objects
for select to authenticated
using(bucket_id='loan-private-documents' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "Loan customer deletes own private documents" on storage.objects;
create policy "Loan customer deletes own private documents" on storage.objects
for delete to authenticated
using(bucket_id='loan-private-documents' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "Loan admin reads private documents" on storage.objects;
create policy "Loan admin reads private documents" on storage.objects
for select to authenticated
using(bucket_id='loan-private-documents' and (private.is_leogo_admin('approvals.read') or private.is_leogo_admin('data.read')));

drop policy if exists "Loan users upload asset media" on storage.objects;
create policy "Loan users upload asset media" on storage.objects
for insert to authenticated
with check(bucket_id='loan-asset-media' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "Loan users read own asset media" on storage.objects;
create policy "Loan users read own asset media" on storage.objects
for select to authenticated
using(bucket_id='loan-asset-media' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "Loan users delete own asset media" on storage.objects;
create policy "Loan users delete own asset media" on storage.objects
for delete to authenticated
using(bucket_id='loan-asset-media' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "Loan admin reads asset media" on storage.objects;
create policy "Loan admin reads asset media" on storage.objects
for select to authenticated
using(bucket_id='loan-asset-media' and (private.is_leogo_admin('approvals.read') or private.is_leogo_admin('data.read') or private.is_leogo_admin('delivery.manage')));

create or replace function private.assert_owned_loan_upload(p_bucket text,p_path text)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(coalesce(p_path,'')),'') is null then raise exception 'Required upload is missing'; end if;
  if split_part(p_path,'/',1)<>v_uid::text then raise exception 'Invalid upload path'; end if;
  if not exists(select 1 from storage.objects where bucket_id=p_bucket and name=p_path) then
    raise exception 'Uploaded file could not be verified';
  end if;
end
$function$;

create or replace function public.customer_list_loan_pickup_stations()
returns table(
  id uuid,station_name text,county text,sub_county text,town text,address_line text,landmark text,
  contact_phone text,operating_hours text
)
language sql
security definer
set search_path=''
as $function$
  select s.id,s.station_name,s.county,s.sub_county,s.town,s.address_line,s.landmark,s.contact_phone,s.operating_hours
  from public.pickup_stations s
  where auth.uid() is not null and s.is_active
  order by s.display_order,s.station_name;
$function$;

create or replace function public.submit_wallet_loan_application_v3(p_application jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  s public.wallet_loan_settings%rowtype;
  e jsonb;
  v_type text:=btrim(coalesce(p_application->>'loan_type',''));
  v_amount numeric:=coalesce((p_application->>'requested_amount_kes')::numeric,0);
  v_purpose text:=btrim(coalesce(p_application->>'purpose',''));
  v_term integer:=nullif(p_application->>'requested_term_days','')::integer;
  v_identity_type text:=btrim(coalesce(p_application->>'identity_type',''));
  v_identity_number text:=upper(btrim(coalesce(p_application->>'identity_number','')));
  v_front text:=btrim(coalesce(p_application->>'identity_front_path',''));
  v_back text:=btrim(coalesce(p_application->>'identity_back_path',''));
  v_passport_photo text:=btrim(coalesce(p_application->>'applicant_passport_photo_path',''));
  v_asset jsonb:=coalesce(p_application->'asset','{}'::jsonb);
  v_photos text[];
  v_proof text;
  v_station uuid;
  v_id uuid;
  v_collateral uuid;
  v_max numeric:=0;
  v_interest numeric:=0;
  v_fee numeric:=0;
  v_grace integer:=0;
  v_recovery integer:=0;
  v_path text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if v_type not in ('savings_history','asset_secured') then raise exception 'Choose a loan type'; end if;
  if coalesce((p_application->>'consent_accepted')::boolean,false) is distinct from true then raise exception 'Loan consent is required'; end if;
  if char_length(v_purpose) not between 10 and 1000 then raise exception 'Explain the loan purpose using at least 10 characters'; end if;
  if v_identity_type not in ('national_id','passport') then raise exception 'Choose National ID or Passport'; end if;
  if v_identity_number !~ '^[A-Z0-9-]{5,30}$' then raise exception 'Enter a valid ID or passport number'; end if;

  perform private.assert_owned_loan_upload('loan-private-documents',v_front);
  perform private.assert_owned_loan_upload('loan-private-documents',v_back);
  perform private.assert_owned_loan_upload('loan-private-documents',v_passport_photo);

  perform private.ensure_wallet_account(v_uid);
  select * into s from public.wallet_loan_settings where id=1;

  if exists(select 1 from public.wallet_loans where user_id=v_uid and status in ('active','overdue')) then
    raise exception 'Complete your current loan before applying for another';
  end if;
  if exists(select 1 from public.wallet_loan_applications where user_id=v_uid and application_status in ('pending','under_review')) then
    raise exception 'You already have a loan application awaiting review';
  end if;

  if v_type='savings_history' then
    e:=private.wallet_loan_eligibility(v_uid);
    if not coalesce(s.applications_enabled,false) then raise exception 'Saving-history loan applications are currently closed'; end if;
    if not coalesce((e->>'eligible')::boolean,false) then
      raise exception 'Your verified saving history does not yet meet the current loan eligibility rules';
    end if;
    v_max:=(e->>'max_eligible_amount_kes')::numeric;
    v_interest:=s.interest_percent;
    v_fee:=s.processing_fee_percent;
    v_grace:=s.grace_days;
    v_recovery:=0;
    v_term:=coalesce(v_term,s.default_term_days);
  else
    if not coalesce(s.asset_applications_enabled,false) then raise exception 'Asset loan applications are currently closed'; end if;
    v_max:=s.asset_max_loan_amount_kes;
    v_interest:=s.asset_interest_percent;
    v_fee:=s.asset_processing_fee_percent;
    v_grace:=s.asset_grace_days;
    v_recovery:=s.asset_recovery_after_overdue_days;
    v_term:=coalesce(v_term,s.asset_default_term_days);

    if coalesce((p_application->>'asset_terms_accepted')::boolean,false) is distinct from true then
      raise exception 'Accept the asset custody and default-recovery terms before submitting';
    end if;
    v_station:=nullif(v_asset->>'pickup_station_id','')::uuid;
    if v_station is null or not exists(select 1 from public.pickup_stations where id=v_station and is_active) then
      raise exception 'Choose an active LEOGO Pickup Station for asset inspection and storage';
    end if;
    if char_length(btrim(coalesce(v_asset->>'asset_type','')))<2 or char_length(btrim(coalesce(v_asset->>'asset_name','')))<2 then
      raise exception 'Enter the asset type and item name';
    end if;
    if char_length(btrim(coalesce(v_asset->>'asset_description','')))<10 then
      raise exception 'Describe the asset and its current condition';
    end if;
    select coalesce(array_agg(value),array[]::text[]) into v_photos
    from jsonb_array_elements_text(coalesce(v_asset->'asset_photo_paths','[]'::jsonb));
    if cardinality(v_photos)<4 or cardinality(v_photos)>8 then raise exception 'Upload at least 4 and at most 8 asset pictures'; end if;
    foreach v_path in array v_photos loop
      perform private.assert_owned_loan_upload('loan-asset-media',v_path);
    end loop;
    v_proof:=btrim(coalesce(v_asset->>'ownership_proof_path',''));
    perform private.assert_owned_loan_upload('loan-private-documents',v_proof);
    if coalesce(v_asset->>'ownership_proof_type','') not in ('receipt','police_abstract','other') then
      raise exception 'Choose a valid proof of ownership type';
    end if;
  end if;

  if v_term<1 or v_term>3650 then raise exception 'Choose a valid repayment period'; end if;
  if v_amount<=0 or v_amount>v_max then raise exception 'Requested amount exceeds the current maximum for this loan type'; end if;

  insert into public.wallet_loan_applications(
    user_id,requested_amount_kes,purpose,consent_accepted,loan_type,
    identity_type,identity_number,identity_front_path,identity_back_path,applicant_passport_photo_path,
    confirmed_balance_at_application,total_saved_at_application,confirmed_saving_days_at_application,
    requested_term_days,eligibility_snapshot_eligible,max_eligible_amount_kes,
    interest_percent_snapshot,processing_fee_percent_snapshot,grace_days_snapshot,
    asset_terms_accepted,recovery_after_overdue_days_snapshot
  ) values(
    v_uid,round(v_amount)::bigint,v_purpose,true,v_type,
    v_identity_type,v_identity_number,v_front,v_back,v_passport_photo,
    coalesce((e->>'wallet_balance_kes')::numeric,0),coalesce((e->>'total_saved_kes')::numeric,0),coalesce((e->>'saving_days')::integer,0),
    v_term,true,v_max,v_interest,v_fee,v_grace,
    v_type='asset_secured',v_recovery
  ) returning id into v_id;

  if v_type='asset_secured' then
    insert into public.wallet_loan_asset_collateral(
      application_id,user_id,pickup_station_id,asset_type,asset_name,brand,model,serial_number,
      asset_description,declared_value_kes,asset_photo_paths,ownership_proof_type,ownership_proof_path
    ) values(
      v_id,v_uid,v_station,btrim(v_asset->>'asset_type'),btrim(v_asset->>'asset_name'),
      nullif(btrim(coalesce(v_asset->>'brand','')),''),nullif(btrim(coalesce(v_asset->>'model','')),''),
      nullif(btrim(coalesce(v_asset->>'serial_number','')),''),
      btrim(v_asset->>'asset_description'),nullif(v_asset->>'declared_value_kes','')::numeric,
      v_photos,v_asset->>'ownership_proof_type',v_proof
    ) returning id into v_collateral;

    insert into public.wallet_loan_asset_events(collateral_id,event_type,actor_user_id,actor_role,notes,metadata)
    values(v_collateral,'application_submitted',v_uid,'customer',
      'Asset loan application submitted. Asset must be physically delivered to the selected Pickup Station for inspection and storage.',
      jsonb_build_object('pickup_station_id',v_station));
  end if;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_uid,'wallet_loan',
    case when v_type='asset_secured' then 'Asset loan application submitted' else 'Loan application submitted' end,
    case when v_type='asset_secured'
      then 'Take the listed asset to your selected LEOGO Pickup Station for inspection and secure storage. Admin approval can only happen after the station records the asset as stored.'
      else 'Your saving-history loan application has been sent to LEOGO Admin for review.'
    end,
    'wallet_loan_application',v_id,'wallet_loan_application_submitted_'||v_id::text,'wallet',
    jsonb_build_object('loan_type',v_type,'requested_amount_kes',round(v_amount),'collateral_id',v_collateral)
  );

  return jsonb_build_object('ok',true,'application_id',v_id,'loan_type',v_type,'collateral_id',v_collateral,'status','pending');
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
begin
  raise exception 'Use the updated loan application form with identity verification documents';
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
begin
  raise exception 'Use the updated loan application form with identity verification documents';
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
  c public.wallet_loan_asset_collateral%rowtype;
  v_principal numeric(14,2);
  v_interest numeric(14,2);
  v_fee numeric(14,2);
  v_total numeric(14,2);
  v_term integer;
  v_loan_id uuid;
  v_ref text;
  v_max numeric(14,2);
  v_penalty numeric(8,4);
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_status not in ('under_review','approved','rejected') then raise exception 'Select a valid loan review status'; end if;

  select * into a from public.wallet_loan_applications where id=p_application_id for update;
  if not found or a.application_status not in ('pending','under_review') then raise exception 'Open loan application not found'; end if;

  if nullif(a.identity_number,'') is null or nullif(a.identity_front_path,'') is null
     or nullif(a.identity_back_path,'') is null or nullif(a.applicant_passport_photo_path,'') is null then
    raise exception 'Identity verification documents are incomplete';
  end if;

  select * into s from public.wallet_loan_settings where id=1;

  if p_status='under_review' then
    update public.wallet_loan_applications set application_status='under_review',reviewed_at=now(),reviewed_by=auth.uid(),
      partner_notes=nullif(btrim(coalesce(p_partner_notes,'')),'') where id=a.id;

  elsif p_status='rejected' then
    if char_length(btrim(coalesce(p_partner_notes,'')))<3 then raise exception 'Add a clear rejection reason'; end if;
    update public.wallet_loan_applications set application_status='rejected',reviewed_at=now(),reviewed_by=auth.uid(),
      partner_notes=btrim(p_partner_notes) where id=a.id;
    if a.loan_type='asset_secured' then
      update public.wallet_loan_asset_collateral
      set custody_status=case when custody_status in ('received','stored') then 'return_required' else custody_status end,
          release_authorized_at=case when custody_status in ('received','stored') then now() else release_authorized_at end,
          updated_at=now()
      where application_id=a.id;
    end if;

  else
    if exists(select 1 from public.wallet_loans where user_id=a.user_id and status in ('active','overdue')) then
      raise exception 'Customer already has an active loan';
    end if;

    if a.loan_type='asset_secured' then
      select * into c from public.wallet_loan_asset_collateral where application_id=a.id for update;
      if not found then raise exception 'Asset collateral record is missing'; end if;
      if c.custody_status<>'stored' or c.inspection_value_kes is null then
        raise exception 'Pickup Station inspection and secure storage must be completed before approving an Asset Loan';
      end if;
      v_max:=least(s.asset_max_loan_amount_kes,round(c.inspection_value_kes*s.asset_loan_to_value_percent/100,2));
      if a.requested_amount_kes>v_max then
        raise exception 'Requested amount exceeds the inspected asset lending value of KSh %',v_max;
      end if;
      v_penalty:=s.asset_overdue_penalty_percent;
    else
      if a.eligibility_snapshot_eligible is distinct from true then raise exception 'This application does not contain a valid eligibility snapshot'; end if;
      if a.requested_amount_kes>a.max_eligible_amount_kes then raise exception 'Requested amount exceeds the eligibility snapshot'; end if;
      v_penalty:=s.overdue_penalty_percent;
    end if;

    v_principal:=round(a.requested_amount_kes::numeric,2);
    v_term:=coalesce(a.requested_term_days,case when a.loan_type='asset_secured' then s.asset_default_term_days else s.default_term_days end);
    v_interest:=round(v_principal*coalesce(a.interest_percent_snapshot,0)/100,2);
    v_fee:=round(v_principal*coalesce(a.processing_fee_percent_snapshot,0)/100,2);
    v_total:=v_principal+v_interest+v_fee;
    v_ref:='LOAN-'||to_char(now() at time zone 'Africa/Nairobi','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

    insert into public.wallet_loans(
      loan_reference,application_id,user_id,principal_kes,interest_percent,interest_kes,
      processing_fee_percent,processing_fee_kes,overdue_penalty_percent,total_due_kes,
      amount_repaid_kes,outstanding_kes,term_days,approved_at,disbursed_at,due_date,grace_until,
      status,approved_by,loan_type,collateral_id,recovery_after_overdue_days
    ) values(
      v_ref,a.id,a.user_id,v_principal,coalesce(a.interest_percent_snapshot,0),v_interest,
      coalesce(a.processing_fee_percent_snapshot,0),v_fee,v_penalty,
      v_total,0,v_total,v_term,now(),now(),
      (now() at time zone 'Africa/Nairobi')::date+v_term,
      (now() at time zone 'Africa/Nairobi')::date+v_term+coalesce(a.grace_days_snapshot,0),
      'active',auth.uid(),a.loan_type,c.id,coalesce(a.recovery_after_overdue_days_snapshot,0)
    ) returning id into v_loan_id;

    if a.loan_type='asset_secured' then
      update public.wallet_loan_asset_collateral set loan_id=v_loan_id,updated_at=now() where id=c.id;
      insert into public.wallet_loan_asset_events(collateral_id,event_type,actor_user_id,actor_role,notes,metadata)
      values(c.id,'loan_approved',auth.uid(),'admin','Asset Loan approved; collateral remains in secure Pickup Station custody.',
        jsonb_build_object('loan_id',v_loan_id,'loan_reference',v_ref));
    end if;

    insert into public.wallet_ledger_entries(
      user_id,entry_type,direction,amount_kes,loan_id,external_reference,description
    ) values(a.user_id,'loan_disbursement','credit',v_principal,v_loan_id,v_ref,'LEOGO Wallet loan disbursement');

    update public.wallet_loan_applications set
      application_status='approved',reviewed_at=now(),reviewed_by=auth.uid(),
      partner_notes=nullif(btrim(coalesce(p_partner_notes,'')),''),
      approved_amount_kes=v_principal,approved_term_days=v_term,approved_at=now()
    where id=a.id;

    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    ) values(
      a.user_id,'wallet_loan','Loan approved and credited',
      'Loan '||v_ref||' has been approved and KSh '||to_char(v_principal,'FM999G999G990D00')||
      ' was credited to your LEOGO Wallet.'||
      case when a.loan_type='asset_secured' then ' Your asset remains securely held at the selected Pickup Station until the loan is fully settled.' else '' end,
      'wallet_loan',v_loan_id,'wallet_loan_approved_'||v_loan_id::text,'wallet',
      jsonb_build_object('loan_reference',v_ref,'loan_type',a.loan_type,'principal_kes',v_principal,'total_due_kes',v_total)
    );
  end if;

  if p_status in ('under_review','rejected') then
    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    ) values(
      a.user_id,'wallet_loan',
      case when p_status='under_review' then 'Loan application under review' else 'Loan application not approved' end,
      case when p_status='under_review' then 'LEOGO Admin is reviewing your loan application.'
        else 'LEOGO Admin did not approve this loan application.'||
          case when nullif(btrim(coalesce(p_partner_notes,'')),'') is null then '' else ' Reason: '||btrim(p_partner_notes) end
      end,
      'wallet_loan_application',a.id,'wallet_loan_application_'||p_status||'_'||a.id::text,'wallet',
      jsonb_build_object('status',p_status,'loan_type',a.loan_type)
    ) on conflict do nothing;
  end if;

  return p_application_id;
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
    select l.*
    from public.wallet_loans l
    where l.status='active' and l.outstanding_kes>0
      and (now() at time zone 'Africa/Nairobi')::date > l.grace_until
    for update of l skip locked
  loop
    v_penalty:=case when v_row.overdue_penalty_applied_at is null
      then round(v_row.principal_kes*v_row.overdue_penalty_percent/100,2) else 0 end;

    update public.wallet_loans
    set status='overdue',overdue_penalty_kes=overdue_penalty_kes+v_penalty,
        overdue_penalty_applied_at=case when v_penalty>0 then now() else overdue_penalty_applied_at end,
        total_due_kes=total_due_kes+v_penalty,outstanding_kes=outstanding_kes+v_penalty,updated_at=now()
    where id=v_row.id;

    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    ) values(
      v_row.user_id,'wallet_loan','Loan repayment overdue',
      'Loan '||v_row.loan_reference||' is overdue. Open Wallet & SACCO to review the outstanding amount.',
      'wallet_loan',v_row.id,'wallet_loan_overdue_'||v_row.id::text,'wallet',
      jsonb_build_object('loan_reference',v_row.loan_reference)
    ) on conflict do nothing;
    v_count:=v_count+1;
  end loop;

  for v_row in
    select l.id,l.user_id,l.loan_reference,l.collateral_id,l.grace_until,l.recovery_after_overdue_days
    from public.wallet_loans l
    join public.wallet_loan_asset_collateral c on c.id=l.collateral_id
    where l.loan_type='asset_secured' and l.status='overdue' and l.outstanding_kes>0
      and c.custody_status='stored'
      and (now() at time zone 'Africa/Nairobi')::date > l.grace_until+l.recovery_after_overdue_days
    for update of l skip locked
  loop
    update public.wallet_loan_asset_collateral
    set custody_status='recovery_review',recovery_review_at=now(),updated_at=now()
    where id=v_row.collateral_id and custody_status='stored';

    insert into public.wallet_loan_asset_events(collateral_id,event_type,actor_role,notes,metadata)
    values(v_row.collateral_id,'recovery_review','system',
      'Configured post-default period reached. Asset requires Admin/legal recovery review before any sale action.',
      jsonb_build_object('loan_id',v_row.id,'loan_reference',v_row.loan_reference));

    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    ) values(
      v_row.user_id,'wallet_loan','Asset loan entered recovery review',
      'Loan '||v_row.loan_reference||' has passed its configured default period. The held asset has entered Admin recovery review. No sale is automatic.',
      'wallet_loan',v_row.id,'wallet_asset_recovery_review_'||v_row.id::text,'wallet',
      jsonb_build_object('loan_reference',v_row.loan_reference)
    ) on conflict do nothing;
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
  v_assets jsonb;
  v_destination jsonb;
  v_settings jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  perform private.refresh_wallet_loan_statuses();
  v_eligibility:=private.wallet_loan_eligibility(v_uid);

  select jsonb_build_object(
    'saving_applications_enabled',applications_enabled,
    'asset_applications_enabled',asset_applications_enabled,
    'asset_max_loan_amount_kes',asset_max_loan_amount_kes,
    'asset_loan_to_value_percent',asset_loan_to_value_percent,
    'asset_interest_percent',asset_interest_percent,
    'asset_processing_fee_percent',asset_processing_fee_percent,
    'asset_default_term_days',asset_default_term_days,
    'asset_grace_days',asset_grace_days,
    'asset_recovery_after_overdue_days',asset_recovery_after_overdue_days
  ) into v_settings from public.wallet_loan_settings where id=1;

  select coalesce(jsonb_agg(
    (to_jsonb(a)-'identity_front_path'-'identity_back_path'-'applicant_passport_photo_path') order by a.submitted_at desc
  ),'[]'::jsonb) into v_apps
  from public.wallet_loan_applications a where a.user_id=v_uid;

  select coalesce(jsonb_agg(
    to_jsonb(l)||jsonb_build_object('repayment_progress_percent',
      case when l.total_due_kes<=0 then 100 else round((l.amount_repaid_kes/l.total_due_kes)*100,1) end)
    order by l.created_at desc
  ),'[]'::jsonb) into v_loans
  from public.wallet_loans l where l.user_id=v_uid;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.submitted_at desc),'[]'::jsonb) into v_repayments
  from public.wallet_loan_repayment_requests r where r.user_id=v_uid;

  select coalesce(jsonb_agg(
    (to_jsonb(c)-'asset_photo_paths'-'ownership_proof_path'-'received_photo_paths'-'inspection_photo_paths'-'release_photo_path')
    ||jsonb_build_object(
      'pickup_station_name',s.station_name,
      'pickup_station_location',concat_ws(', ',s.address_line,s.town,s.sub_county,s.county),
      'pickup_station_phone',s.contact_phone,
      'pickup_station_hours',s.operating_hours
    )
    order by c.created_at desc
  ),'[]'::jsonb) into v_assets
  from public.wallet_loan_asset_collateral c
  join public.pickup_stations s on s.id=c.pickup_station_id
  where c.user_id=v_uid;

  select jsonb_build_object(
    'display_name',p.display_name,'account_type',p.account_type,'business_name',p.business_name,
    'account_name',p.account_name,'till_number',p.till_number,'paybill_number',p.paybill_number,
    'account_number',p.account_number,'bank_name',p.bank_name,'branch',p.branch,'instructions',p.instructions
  ) into v_destination
  from public.payment_account_assignments a join public.payment_accounts p on p.id=a.account_id
  where a.function_code='loan_repayment' and p.status='active' limit 1;

  return jsonb_build_object(
    'eligibility',v_eligibility,'settings',v_settings,'applications',v_apps,'loans',v_loans,
    'repayments',v_repayments,'asset_collateral',v_assets,'repayment_destination',v_destination
  );
end
$function$;

create or replace function public.pickup_partner_list_loan_assets()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_station uuid:=private.pickup_partner_station_id(); v_result jsonb;
begin
  if v_station is null then raise exception 'Active Pickup Station Partner account required'; end if;
  perform private.refresh_wallet_loan_statuses();
  select coalesce(jsonb_agg(
    to_jsonb(c)||jsonb_build_object(
      'customer_name',p.full_name,'customer_phone',p.phone,
      'requested_amount_kes',a.requested_amount_kes,'application_status',a.application_status,
      'loan_reference',l.loan_reference,'loan_status',l.status,'loan_outstanding_kes',l.outstanding_kes
    ) order by c.created_at desc
  ),'[]'::jsonb) into v_result
  from public.wallet_loan_asset_collateral c
  join public.wallet_loan_applications a on a.id=c.application_id
  left join public.wallet_loans l on l.id=c.loan_id
  left join public.customer_profiles p on p.user_id=c.user_id
  where c.pickup_station_id=v_station;
  return v_result;
end
$function$;

create or replace function public.pickup_partner_receive_loan_asset(
  p_collateral_id uuid,p_received_photo_paths text[],p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_uid uuid:=auth.uid(); v_station uuid:=private.pickup_partner_station_id(); c public.wallet_loan_asset_collateral%rowtype; v_path text;
begin
  if v_station is null then raise exception 'Active Pickup Station Partner account required'; end if;
  if cardinality(coalesce(p_received_photo_paths,'{}'))<1 then raise exception 'Take at least one clear receiving photo'; end if;
  foreach v_path in array p_received_photo_paths loop perform private.assert_owned_loan_upload('loan-asset-media',v_path); end loop;
  select * into c from public.wallet_loan_asset_collateral where id=p_collateral_id and pickup_station_id=v_station for update;
  if not found then raise exception 'Assigned asset collateral not found'; end if;
  if c.custody_status<>'awaiting_dropoff' then raise exception 'This asset has already been received or moved to another stage'; end if;
  update public.wallet_loan_asset_collateral set custody_status='received',station_received_at=now(),station_received_by=v_uid,
    received_photo_paths=p_received_photo_paths,receiving_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now()
  where id=c.id;
  insert into public.wallet_loan_asset_events(collateral_id,event_type,actor_user_id,actor_role,notes,evidence_paths)
  values(c.id,'received_at_station',v_uid,'pickup_station',nullif(btrim(coalesce(p_notes,'')),''),p_received_photo_paths);
  return jsonb_build_object('ok',true,'collateral_id',c.id,'custody_status','received');
end
$function$;

create or replace function public.pickup_partner_inspect_loan_asset(
  p_collateral_id uuid,p_inspection_value_kes numeric,p_condition_grade text,
  p_notes text,p_inspection_photo_paths text[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_uid uuid:=auth.uid(); v_station uuid:=private.pickup_partner_station_id(); c public.wallet_loan_asset_collateral%rowtype; v_path text;
begin
  if v_station is null then raise exception 'Active Pickup Station Partner account required'; end if;
  if p_inspection_value_kes is null or p_inspection_value_kes<=0 then raise exception 'Enter the inspected market value'; end if;
  if btrim(coalesce(p_condition_grade,'')) not in ('excellent','good','fair','poor') then raise exception 'Choose a valid condition grade'; end if;
  if char_length(btrim(coalesce(p_notes,'')))<5 then raise exception 'Add an inspection note'; end if;
  if cardinality(coalesce(p_inspection_photo_paths,'{}'))<2 then raise exception 'Take at least two inspection photos'; end if;
  foreach v_path in array p_inspection_photo_paths loop perform private.assert_owned_loan_upload('loan-asset-media',v_path); end loop;
  select * into c from public.wallet_loan_asset_collateral where id=p_collateral_id and pickup_station_id=v_station for update;
  if not found then raise exception 'Assigned asset collateral not found'; end if;
  if c.custody_status<>'received' then raise exception 'Receive the asset before recording inspection'; end if;
  update public.wallet_loan_asset_collateral set custody_status='stored',inspected_at=now(),inspected_by=v_uid,
    inspection_value_kes=round(p_inspection_value_kes,2),condition_grade=btrim(p_condition_grade),
    inspection_notes=btrim(p_notes),inspection_photo_paths=p_inspection_photo_paths,stored_at=now(),updated_at=now()
  where id=c.id;
  insert into public.wallet_loan_asset_events(collateral_id,event_type,actor_user_id,actor_role,notes,evidence_paths,metadata)
  values(c.id,'inspected_and_stored',v_uid,'pickup_station',btrim(p_notes),p_inspection_photo_paths,
    jsonb_build_object('inspection_value_kes',round(p_inspection_value_kes,2),'condition_grade',btrim(p_condition_grade)));
  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(c.user_id,'wallet_loan','Asset received and stored',
    'Your asset has been inspected and placed in secure Pickup Station custody. The loan application can now proceed to Admin review.',
    'wallet_loan_asset',c.id,'wallet_loan_asset_stored_'||c.id::text,'wallet',
    jsonb_build_object('inspection_value_kes',round(p_inspection_value_kes,2)));
  return jsonb_build_object('ok',true,'collateral_id',c.id,'custody_status','stored');
end
$function$;

create or replace function public.pickup_partner_release_loan_asset(
  p_collateral_id uuid,p_release_photo_path text,p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_uid uuid:=auth.uid(); v_station uuid:=private.pickup_partner_station_id(); c public.wallet_loan_asset_collateral%rowtype;
begin
  if v_station is null then raise exception 'Active Pickup Station Partner account required'; end if;
  perform private.assert_owned_loan_upload('loan-asset-media',p_release_photo_path);
  select * into c from public.wallet_loan_asset_collateral where id=p_collateral_id and pickup_station_id=v_station for update;
  if not found then raise exception 'Assigned asset collateral not found'; end if;
  if c.custody_status not in ('release_ready','return_required') then raise exception 'Admin has not authorized release of this asset'; end if;
  update public.wallet_loan_asset_collateral set custody_status='released',released_at=now(),released_by=v_uid,
    release_photo_path=p_release_photo_path,release_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now()
  where id=c.id;
  insert into public.wallet_loan_asset_events(collateral_id,event_type,actor_user_id,actor_role,notes,evidence_paths)
  values(c.id,'released_to_customer',v_uid,'pickup_station',nullif(btrim(coalesce(p_notes,'')),''),array[p_release_photo_path]);
  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(c.user_id,'wallet_loan','Asset released',
    'Your held asset has been released by the Pickup Station.',
    'wallet_loan_asset',c.id,'wallet_loan_asset_released_'||c.id::text,'wallet','{}'::jsonb);
  return jsonb_build_object('ok',true,'collateral_id',c.id,'custody_status','released');
end
$function$;

create or replace function public.admin_authorize_asset_recovery_sale(
  p_collateral_id uuid,p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare c public.wallet_loan_asset_collateral%rowtype; l public.wallet_loans%rowtype; v_before jsonb; v_after jsonb;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if char_length(btrim(coalesce(p_notes,'')))<10 then raise exception 'Record the recovery/legal review basis before authorizing sale'; end if;
  select * into c from public.wallet_loan_asset_collateral where id=p_collateral_id for update;
  if not found or c.custody_status<>'recovery_review' then raise exception 'Asset is not in recovery review'; end if;
  select * into l from public.wallet_loans where id=c.loan_id for update;
  if not found or l.status<>'overdue' or l.outstanding_kes<=0 then raise exception 'The linked loan is not eligible for recovery sale'; end if;
  v_before:=to_jsonb(c);
  update public.wallet_loan_asset_collateral set custody_status='sale_authorized',recovery_authorized_at=now(),
    recovery_authorized_by=auth.uid(),recovery_notes=btrim(p_notes),updated_at=now() where id=c.id;
  select to_jsonb(x) into v_after from public.wallet_loan_asset_collateral x where id=c.id;
  insert into public.wallet_loan_asset_events(collateral_id,event_type,actor_user_id,actor_role,notes,metadata)
  values(c.id,'sale_authorized',auth.uid(),'admin',btrim(p_notes),jsonb_build_object('loan_id',l.id,'outstanding_kes',l.outstanding_kes));
  perform private.write_admin_audit('wallet_loan.asset_sale_authorized','wallet_loan_asset',c.id::text,v_before,v_after,
    jsonb_build_object('loan_id',l.id,'notes',btrim(p_notes)));
  return jsonb_build_object('ok',true,'collateral_id',c.id,'custody_status','sale_authorized');
end
$function$;

create or replace function public.admin_record_asset_sale(
  p_collateral_id uuid,p_sale_amount_kes numeric,p_sale_reference text,p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  c public.wallet_loan_asset_collateral%rowtype;
  l public.wallet_loans%rowtype;
  v_before jsonb;v_after jsonb;
  v_applied numeric(14,2);v_surplus numeric(14,2);v_new_repaid numeric(14,2);v_new_outstanding numeric(14,2);
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_sale_amount_kes is null or p_sale_amount_kes<0 then raise exception 'Enter the actual sale amount'; end if;
  if char_length(btrim(coalesce(p_sale_reference,'')))<3 then raise exception 'Enter a sale / disposal reference'; end if;
  select * into c from public.wallet_loan_asset_collateral where id=p_collateral_id for update;
  if not found or c.custody_status<>'sale_authorized' then raise exception 'Asset sale has not been authorized'; end if;
  select * into l from public.wallet_loans where id=c.loan_id for update;
  if not found or l.outstanding_kes<=0 then raise exception 'Linked loan has no recoverable outstanding balance'; end if;
  v_before:=to_jsonb(c);
  v_applied:=least(round(p_sale_amount_kes,2),l.outstanding_kes);
  v_surplus:=greatest(0,round(p_sale_amount_kes,2)-v_applied);
  v_new_repaid:=least(l.total_due_kes,l.amount_repaid_kes+v_applied);
  v_new_outstanding:=greatest(0,l.total_due_kes-v_new_repaid);

  update public.wallet_loans set amount_repaid_kes=v_new_repaid,outstanding_kes=v_new_outstanding,
    status=case when v_new_outstanding=0 then 'paid' else 'overdue' end,
    paid_at=case when v_new_outstanding=0 then now() else paid_at end,updated_at=now()
  where id=l.id;

  if v_surplus>0 then
    insert into public.wallet_ledger_entries(user_id,entry_type,direction,amount_kes,loan_id,external_reference,description)
    values(l.user_id,'refund','credit',v_surplus,l.id,btrim(p_sale_reference),'Asset recovery sale surplus returned to customer wallet');
  end if;

  update public.wallet_loan_asset_collateral set custody_status='sold',sale_recorded_at=now(),sale_recorded_by=auth.uid(),
    sale_amount_kes=round(p_sale_amount_kes,2),sale_reference=btrim(p_sale_reference),
    sale_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now()
  where id=c.id;
  select to_jsonb(x) into v_after from public.wallet_loan_asset_collateral x where id=c.id;

  insert into public.wallet_loan_asset_events(collateral_id,event_type,actor_user_id,actor_role,notes,metadata)
  values(c.id,'asset_sold',auth.uid(),'admin',nullif(btrim(coalesce(p_notes,'')),''),
    jsonb_build_object('sale_amount_kes',round(p_sale_amount_kes,2),'applied_to_loan_kes',v_applied,'surplus_kes',v_surplus,'remaining_outstanding_kes',v_new_outstanding,'sale_reference',btrim(p_sale_reference)));

  perform private.write_admin_audit('wallet_loan.asset_sale_recorded','wallet_loan_asset',c.id::text,v_before,v_after,
    jsonb_build_object('loan_id',l.id,'sale_amount_kes',round(p_sale_amount_kes,2),'applied_to_loan_kes',v_applied,'surplus_kes',v_surplus));

  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(l.user_id,'wallet_loan','Asset recovery sale recorded',
    'The held asset sale has been recorded. KSh '||to_char(v_applied,'FM999G999G990D00')||
    ' was applied to your outstanding loan.'||
    case when v_surplus>0 then ' Surplus of KSh '||to_char(v_surplus,'FM999G999G990D00')||' was credited to your LEOGO Wallet.' else '' end,
    'wallet_loan_asset',c.id,'wallet_loan_asset_sale_'||c.id::text,'wallet',
    jsonb_build_object('sale_amount_kes',round(p_sale_amount_kes,2),'applied_kes',v_applied,'surplus_kes',v_surplus,'remaining_outstanding_kes',v_new_outstanding));

  return jsonb_build_object('ok',true,'collateral_id',c.id,'sale_amount_kes',round(p_sale_amount_kes,2),
    'applied_to_loan_kes',v_applied,'surplus_kes',v_surplus,'remaining_outstanding_kes',v_new_outstanding);
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
      'customer_name',coalesce(cp.full_name,u.email::text,'Customer'),'customer_phone',cp.phone,
      'application',to_jsonb(a),
      'collateral',case when c.id is null then null else to_jsonb(c)||jsonb_build_object(
        'pickup_station_name',ps.station_name,'pickup_station_location',concat_ws(', ',ps.address_line,ps.town,ps.sub_county,ps.county)
      ) end
    ) order by l.created_at desc
  ),'[]'::jsonb) into v_result
  from public.wallet_loans l
  join public.wallet_loan_applications a on a.id=l.application_id
  left join public.wallet_loan_asset_collateral c on c.id=l.collateral_id
  left join public.pickup_stations ps on ps.id=c.pickup_station_id
  left join public.customer_profiles cp on cp.user_id=l.user_id
  left join auth.users u on u.id=l.user_id;
  return v_result;
end
$function$;

create or replace function public.admin_save_wallet_loan_settings(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_before jsonb;v_after jsonb;
begin
  if not private.is_leogo_admin('fees.manage') then raise exception 'Fee settings permission required'; end if;
  select to_jsonb(s) into v_before from public.wallet_loan_settings s where id=1 for update;

  if coalesce((p_settings->>'minimum_total_saved_kes')::numeric,-1)<0
     or coalesce((p_settings->>'minimum_saving_days')::integer,-1)<0
     or coalesce((p_settings->>'max_loan_amount_kes')::numeric,0)<=0
     or coalesce((p_settings->>'loan_to_savings_ratio')::numeric,0)<=0
     or coalesce((p_settings->>'loan_to_savings_ratio')::numeric,0)>20
     or coalesce((p_settings->>'interest_percent')::numeric,-1) not between 0 and 100
     or coalesce((p_settings->>'processing_fee_percent')::numeric,-1) not between 0 and 100
     or coalesce((p_settings->>'default_term_days')::integer,0) not between 1 and 3650
     or coalesce((p_settings->>'grace_days')::integer,-1) not between 0 and 365
     or coalesce((p_settings->>'overdue_penalty_percent')::numeric,-1) not between 0 and 100
     or coalesce((p_settings->>'asset_max_loan_amount_kes')::numeric,0)<=0
     or coalesce((p_settings->>'asset_loan_to_value_percent')::numeric,0) not between 0.01 and 100
     or coalesce((p_settings->>'asset_interest_percent')::numeric,-1) not between 0 and 100
     or coalesce((p_settings->>'asset_processing_fee_percent')::numeric,-1) not between 0 and 100
     or coalesce((p_settings->>'asset_default_term_days')::integer,0) not between 1 and 3650
     or coalesce((p_settings->>'asset_grace_days')::integer,-1) not between 0 and 365
     or coalesce((p_settings->>'asset_overdue_penalty_percent')::numeric,-1) not between 0 and 100
     or coalesce((p_settings->>'asset_recovery_after_overdue_days')::integer,-1) not between 0 and 3650
  then raise exception 'Enter valid loan settings'; end if;

  update public.wallet_loan_settings set
    applications_enabled=coalesce((p_settings->>'applications_enabled')::boolean,false),
    minimum_total_saved_kes=(p_settings->>'minimum_total_saved_kes')::numeric,
    minimum_saving_days=(p_settings->>'minimum_saving_days')::integer,
    max_loan_amount_kes=(p_settings->>'max_loan_amount_kes')::numeric,
    loan_to_savings_ratio=(p_settings->>'loan_to_savings_ratio')::numeric,
    interest_percent=(p_settings->>'interest_percent')::numeric,
    processing_fee_percent=(p_settings->>'processing_fee_percent')::numeric,
    default_term_days=(p_settings->>'default_term_days')::integer,
    grace_days=(p_settings->>'grace_days')::integer,
    overdue_penalty_percent=(p_settings->>'overdue_penalty_percent')::numeric,
    allow_partial_repayment=coalesce((p_settings->>'allow_partial_repayment')::boolean,true),
    asset_applications_enabled=coalesce((p_settings->>'asset_applications_enabled')::boolean,false),
    asset_max_loan_amount_kes=(p_settings->>'asset_max_loan_amount_kes')::numeric,
    asset_loan_to_value_percent=(p_settings->>'asset_loan_to_value_percent')::numeric,
    asset_interest_percent=(p_settings->>'asset_interest_percent')::numeric,
    asset_processing_fee_percent=(p_settings->>'asset_processing_fee_percent')::numeric,
    asset_default_term_days=(p_settings->>'asset_default_term_days')::integer,
    asset_grace_days=(p_settings->>'asset_grace_days')::integer,
    asset_overdue_penalty_percent=(p_settings->>'asset_overdue_penalty_percent')::numeric,
    asset_recovery_after_overdue_days=(p_settings->>'asset_recovery_after_overdue_days')::integer,
    updated_by=auth.uid(),updated_at=now()
  where id=1;

  select to_jsonb(s) into v_after from public.wallet_loan_settings s where id=1;
  perform private.write_admin_audit('wallet_loans.settings.updated','wallet_loan_settings','1',v_before,v_after,'{}'::jsonb);
  return v_after;
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

create or replace function public.admin_review_wallet_loan_repayment(
  p_repayment_id uuid,p_decision text,p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  r public.wallet_loan_repayment_requests%rowtype;l public.wallet_loans%rowtype;
  v_before jsonb;v_after jsonb;v_new_repaid numeric(14,2);v_new_outstanding numeric(14,2);
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('verify','reject') then raise exception 'Choose verify or reject'; end if;
  if p_decision='reject' and char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'Add a rejection reason'; end if;
  select * into r from public.wallet_loan_repayment_requests where id=p_repayment_id for update;
  if not found or r.payment_status<>'pending' then raise exception 'Pending repayment not found'; end if;
  select * into l from public.wallet_loans where id=r.loan_id for update;
  if not found then raise exception 'Loan not found'; end if;
  v_before:=to_jsonb(r);
  if p_decision='reject' then
    update public.wallet_loan_repayment_requests set payment_status='rejected',reviewed_at=now(),reviewed_by=auth.uid(),
      admin_notes=btrim(p_notes),updated_at=now() where id=r.id;
  else
    if r.amount_kes>l.outstanding_kes then raise exception 'Repayment exceeds the current outstanding balance'; end if;
    v_new_repaid:=round(l.amount_repaid_kes+r.amount_kes,2);
    v_new_outstanding:=greatest(0,round(l.total_due_kes-v_new_repaid,2));
    update public.wallet_loan_repayment_requests set payment_status='verified',reviewed_at=now(),reviewed_by=auth.uid(),
      admin_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now() where id=r.id;
    update public.wallet_loans set amount_repaid_kes=v_new_repaid,outstanding_kes=v_new_outstanding,
      status=case when v_new_outstanding<=0 then 'paid' else status end,
      paid_at=case when v_new_outstanding<=0 then now() else paid_at end,updated_at=now() where id=l.id;

    if v_new_outstanding<=0 and l.loan_type='asset_secured' and l.collateral_id is not null then
      update public.wallet_loan_asset_collateral
      set custody_status=case when custody_status in ('stored','recovery_review') then 'release_ready' else custody_status end,
          release_authorized_at=case when custody_status in ('stored','recovery_review') then now() else release_authorized_at end,
          updated_at=now()
      where id=l.collateral_id;
      if found then
        insert into public.wallet_loan_asset_events(collateral_id,event_type,actor_user_id,actor_role,notes,metadata)
        values(l.collateral_id,'release_authorized',auth.uid(),'admin','Loan fully repaid. Asset authorized for return to customer.',
          jsonb_build_object('loan_id',l.id));
        insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
        values(l.user_id,'wallet_loan','Asset ready for return',
          'Your Asset Loan is fully paid. The held asset is now authorized for release by the Pickup Station.',
          'wallet_loan_asset',l.collateral_id,'wallet_loan_asset_release_ready_'||l.collateral_id::text,'wallet','{}'::jsonb);
      end if;
    end if;
  end if;
  select to_jsonb(x) into v_after from public.wallet_loan_repayment_requests x where id=r.id;
  perform private.write_admin_audit('wallet_loan.repayment.'||p_decision,'wallet_loan_repayment',r.id::text,v_before,v_after,
    jsonb_build_object('loan_id',r.loan_id,'notes',nullif(btrim(coalesce(p_notes,'')),''))
  );
  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(r.user_id,'wallet_loan',
    case when p_decision='verify' then 'Loan repayment verified' else 'Loan repayment rejected' end,
    case when p_decision='verify' then 'Your repayment of KSh '||to_char(r.amount_kes,'FM999G999G990D00')||' has been applied to loan '||l.loan_reference||'.'
      else 'Your loan repayment was rejected.'||case when nullif(btrim(coalesce(p_notes,'')),'') is null then '' else ' Reason: '||btrim(p_notes) end end,
    'wallet_loan_repayment',r.id,'wallet_loan_repayment_'||p_decision||'_'||r.id::text,'wallet',
    jsonb_build_object('loan_id',r.loan_id,'amount_kes',r.amount_kes)
  );
  return jsonb_build_object('ok',true,'decision',p_decision,'repayment_id',r.id);
end
$function$;

revoke execute on function private.assert_owned_loan_upload(text,text) from public,anon,authenticated;

revoke execute on function public.customer_list_loan_pickup_stations() from public,anon;
grant execute on function public.customer_list_loan_pickup_stations() to authenticated;

revoke execute on function public.submit_wallet_loan_application_v3(jsonb) from public,anon;
grant execute on function public.submit_wallet_loan_application_v3(jsonb) to authenticated;

revoke execute on function public.pickup_partner_list_loan_assets() from public,anon;
grant execute on function public.pickup_partner_list_loan_assets() to authenticated;

revoke execute on function public.pickup_partner_receive_loan_asset(uuid,text[],text) from public,anon;
grant execute on function public.pickup_partner_receive_loan_asset(uuid,text[],text) to authenticated;

revoke execute on function public.pickup_partner_inspect_loan_asset(uuid,numeric,text,text,text[]) from public,anon;
grant execute on function public.pickup_partner_inspect_loan_asset(uuid,numeric,text,text,text[]) to authenticated;

revoke execute on function public.pickup_partner_release_loan_asset(uuid,text,text) from public,anon;
grant execute on function public.pickup_partner_release_loan_asset(uuid,text,text) to authenticated;

revoke execute on function public.admin_authorize_asset_recovery_sale(uuid,text) from public,anon;
grant execute on function public.admin_authorize_asset_recovery_sale(uuid,text) to authenticated;

revoke execute on function public.admin_record_asset_sale(uuid,numeric,text,text) from public,anon;
grant execute on function public.admin_record_asset_sale(uuid,numeric,text,text) to authenticated;
