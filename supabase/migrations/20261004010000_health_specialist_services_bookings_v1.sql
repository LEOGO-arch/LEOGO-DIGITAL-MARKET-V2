-- LEOGO DIGITAL MARKET V2
-- Health Specialist / Doctor services + LEOGO booking fee V1
-- Additive extension of the existing regulated Health & Medicine module.
-- Does not reuse or change the locked ordinary Seller checkout/order workflow.

-- 1) Allow a regulated Health Specialist / Doctor partner type.
alter table public.health_medicine_accounts
  drop constraint if exists health_medicine_accounts_business_type_check;

alter table public.health_medicine_accounts
  add constraint health_medicine_accounts_business_type_check
  check (business_type in (
    'pharmacy','optics','medical_supplies','orthopaedic_rehab',
    'laboratory_diagnostics','health_specialist','other_health'
  ));

alter table public.health_medicine_accounts
  drop constraint if exists health_specialist_professional_documents_check;

alter table public.health_medicine_accounts
  add constraint health_specialist_professional_documents_check
  check (
    business_type <> 'health_specialist'
    or (
      nullif(btrim(coalesce(regulatory_licence_path,'')),'') is not null
      and nullif(btrim(coalesce(professional_certificate_path,'')),'') is not null
    )
  );

-- Health specialists use service listings, not medicine/product listings.
create or replace function private.guard_health_specialist_product_listing()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare v_type text;
begin
  select h.business_type into v_type
  from public.health_medicine_accounts h
  where h.user_id=new.provider_id;

  if v_type='health_specialist' then
    raise exception 'Health Specialist / Doctor profiles list professional services, not Health products';
  end if;
  return new;
end;
$$;

drop trigger if exists health_specialist_product_listing_guard on public.health_medicine_products;
create trigger health_specialist_product_listing_guard
before insert or update of provider_id,product_kind
on public.health_medicine_products
for each row execute function private.guard_health_specialist_product_listing();

-- Existing application RPC extended only with the new regulated partner type.
create or replace function public.health_medicine_submit_application(
  p_business_name text,
  p_owner_name text,
  p_id_number text,
  p_phone text,
  p_business_type text,
  p_other_business_type text,
  p_county_code text,
  p_sub_county_code text,
  p_town text,
  p_location_details text,
  p_shop_latitude numeric,
  p_shop_longitude numeric,
  p_shop_map_link text,
  p_business_description text,
  p_profile_picture_path text,
  p_business_id_document_path text,
  p_business_licence_path text,
  p_regulatory_licence_path text,
  p_professional_certificate_path text,
  p_registration_certificate_path text,
  p_other_permit_paths text[] default '{}'
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_existing text;
  v_county text;
  v_sub_county text;
  v_row jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if char_length(btrim(coalesce(p_business_name,'')))<2 then raise exception 'Business / professional name is required'; end if;
  if char_length(btrim(coalesce(p_owner_name,'')))<2 then raise exception 'Owner / responsible person name is required'; end if;
  if char_length(btrim(coalesce(p_id_number,'')))<5 then raise exception 'A valid identification number is required'; end if;
  if coalesce(p_phone,'') !~ '^[+]254[17][0-9]{8}$' then raise exception 'Enter a valid Kenyan phone number'; end if;
  if p_business_type not in ('pharmacy','optics','medical_supplies','orthopaedic_rehab','laboratory_diagnostics','health_specialist','other_health') then
    raise exception 'Choose a valid Health & Medicine business type';
  end if;
  if p_business_type='other_health' and char_length(btrim(coalesce(p_other_business_type,'')))<2 then
    raise exception 'Describe the Health & Medicine business type';
  end if;
  if p_business_type='pharmacy' and nullif(btrim(coalesce(p_regulatory_licence_path,'')),'') is null then
    raise exception 'A Pharmacy / pharmaceuticals regulatory licence document is required';
  end if;
  if p_business_type='health_specialist' then
    if nullif(btrim(coalesce(p_regulatory_licence_path,'')),'') is null then
      raise exception 'A current professional / regulatory licence is required for a Health Specialist';
    end if;
    if nullif(btrim(coalesce(p_professional_certificate_path,'')),'') is null then
      raise exception 'A professional qualification certificate is required for a Health Specialist';
    end if;
  end if;
  if nullif(btrim(coalesce(p_business_id_document_path,'')),'') is null then
    raise exception 'Business ID / identification document is required';
  end if;

  select c.name into v_county
  from public.kenya_counties c
  where c.code=p_county_code and c.is_active;
  if v_county is null then raise exception 'Choose a valid county'; end if;

  select s.name into v_sub_county
  from public.kenya_subcounties s
  where s.code=p_sub_county_code and s.county_code=p_county_code and s.is_active;
  if v_sub_county is null then raise exception 'Choose a valid sub-county'; end if;

  select application_status into v_existing
  from public.health_medicine_accounts where user_id=v_uid;

  if v_existing is not null and v_existing not in ('changes_requested','rejected') then
    raise exception 'Your Health & Medicine application is already locked for review';
  end if;

  insert into public.health_medicine_accounts(
    user_id,business_name,owner_name,id_number,phone,business_type,other_business_type,
    county,sub_county,county_code,sub_county_code,town,location_details,
    shop_latitude,shop_longitude,shop_map_link,business_description,profile_picture_path,
    business_id_document_path,business_licence_path,regulatory_licence_path,
    professional_certificate_path,registration_certificate_path,other_permit_paths,
    application_status,availability_status,submitted_at,approved_at,approved_by,admin_notes,updated_at
  ) values (
    v_uid,btrim(p_business_name),btrim(p_owner_name),upper(btrim(p_id_number)),btrim(p_phone),
    p_business_type,nullif(btrim(coalesce(p_other_business_type,'')),''),
    v_county,v_sub_county,p_county_code,p_sub_county_code,btrim(p_town),btrim(p_location_details),
    p_shop_latitude,p_shop_longitude,nullif(btrim(coalesce(p_shop_map_link,'')),''),
    nullif(btrim(coalesce(p_business_description,'')),''),
    nullif(btrim(coalesce(p_profile_picture_path,'')),''),
    btrim(p_business_id_document_path),
    nullif(btrim(coalesce(p_business_licence_path,'')),''),
    nullif(btrim(coalesce(p_regulatory_licence_path,'')),''),
    nullif(btrim(coalesce(p_professional_certificate_path,'')),''),
    nullif(btrim(coalesce(p_registration_certificate_path,'')),''),
    coalesce(p_other_permit_paths,'{}'),'submitted','open',now(),null,null,null,now()
  )
  on conflict(user_id) do update set
    business_name=excluded.business_name,owner_name=excluded.owner_name,id_number=excluded.id_number,phone=excluded.phone,
    business_type=excluded.business_type,other_business_type=excluded.other_business_type,
    county=excluded.county,sub_county=excluded.sub_county,county_code=excluded.county_code,sub_county_code=excluded.sub_county_code,
    town=excluded.town,location_details=excluded.location_details,shop_latitude=excluded.shop_latitude,
    shop_longitude=excluded.shop_longitude,shop_map_link=excluded.shop_map_link,business_description=excluded.business_description,
    profile_picture_path=excluded.profile_picture_path,business_id_document_path=excluded.business_id_document_path,
    business_licence_path=excluded.business_licence_path,regulatory_licence_path=excluded.regulatory_licence_path,
    professional_certificate_path=excluded.professional_certificate_path,
    registration_certificate_path=excluded.registration_certificate_path,other_permit_paths=excluded.other_permit_paths,
    application_status='submitted',submitted_at=now(),approved_at=null,approved_by=null,admin_notes=null,updated_at=now()
  returning to_jsonb(health_medicine_accounts.*) into v_row;

  return v_row;
end;
$$;

revoke all on function public.health_medicine_submit_application(text,text,text,text,text,text,text,text,text,text,numeric,numeric,text,text,text,text,text,text,text,text,text[]) from public,anon;
grant execute on function public.health_medicine_submit_application(text,text,text,text,text,text,text,text,text,text,numeric,numeric,text,text,text,text,text,text,text,text,text[]) to authenticated;

-- Approval hardening: a Health Specialist cannot be approved without professional documents.
create or replace function public.admin_review_health_medicine_application(
  p_record_id uuid,p_decision text,p_notes text default null
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_before jsonb;v_after jsonb;v_business_type text;v_regulatory text;v_professional text;
  v_status text;v_title text;v_message text;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('approve','reject','under_review','changes_requested') then raise exception 'Unsupported decision'; end if;
  if p_decision in ('reject','changes_requested') and char_length(btrim(coalesce(p_notes,'')))<3 then
    raise exception 'A clear reason is required';
  end if;

  select to_jsonb(h),h.business_type,h.regulatory_licence_path,h.professional_certificate_path
  into v_before,v_business_type,v_regulatory,v_professional
  from public.health_medicine_accounts h
  where h.user_id=p_record_id for update;

  if v_before is null then raise exception 'Health & Medicine application not found'; end if;
  if p_decision='approve' and v_business_type='pharmacy'
     and nullif(btrim(coalesce(v_regulatory,'')),'') is null then
    raise exception 'A Pharmacy regulatory licence document must be present before approval';
  end if;
  if p_decision='approve' and v_business_type='health_specialist'
     and (
       nullif(btrim(coalesce(v_regulatory,'')),'') is null
       or nullif(btrim(coalesce(v_professional,'')),'') is null
     ) then
    raise exception 'Health Specialist approval requires both a professional / regulatory licence and qualification certificate';
  end if;

  v_status:=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected'
    when 'changes_requested' then 'changes_requested' else 'under_review' end;

  update public.health_medicine_accounts set
    application_status=v_status,
    approved_at=case when p_decision='approve' then now() else approved_at end,
    approved_by=case when p_decision='approve' then auth.uid() else approved_by end,
    admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
    updated_at=now()
  where user_id=p_record_id
    and application_status in ('submitted','under_review','changes_requested');

  if not found then raise exception 'Health & Medicine application has already been reviewed'; end if;

  select to_jsonb(h) into v_after from public.health_medicine_accounts h where h.user_id=p_record_id;

  v_title:=case p_decision
    when 'approve' then 'Health & Medicine application approved'
    when 'changes_requested' then 'Health & Medicine application needs correction'
    when 'reject' then 'Health & Medicine application not approved'
    else 'Health & Medicine application under review' end;
  v_message:=case p_decision
    when 'approve' then
      case when v_business_type='health_specialist'
        then 'Your Health Specialist account is approved. You can now submit professional services for Admin approval.'
        else 'Your Health & Medicine Partner account is approved. You can now submit products for Admin approval.' end
    when 'changes_requested' then 'LEOGO Admin requested corrections to your Health & Medicine registration. Update and resubmit from the Partner Portal.'
    when 'reject' then 'Your Health & Medicine application was not approved. Review the Admin note in the Partner Portal.'
    else 'LEOGO Admin is reviewing your Health & Medicine application.' end;

  insert into public.partner_notifications(user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata)
  values(p_record_id,'health_medicine','health_medicine_application_'||v_status,v_title,v_message,'health_medicine_account',p_record_id,'health-overview',jsonb_build_object('status',v_status));

  perform private.write_admin_audit(
    'approval.health_medicine.application.'||p_decision,'health_medicine_account',p_record_id::text,
    v_before,v_after,jsonb_build_object('notes',p_notes)
  );
  return jsonb_build_object('ok',true,'status',v_status);
end;
$$;

revoke all on function public.admin_review_health_medicine_application(uuid,text,text) from public,anon;
grant execute on function public.admin_review_health_medicine_application(uuid,text,text) to authenticated;

-- 2) Health Specialist service catalogue.
create table if not exists public.health_specialist_services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.health_medicine_accounts(user_id) on delete cascade,
  service_name text not null check (char_length(btrim(service_name)) between 2 and 160),
  specialty text not null check (char_length(btrim(specialty)) between 2 and 160),
  description text,
  consultation_fee_kes numeric(12,2) not null default 0 check (consultation_fee_kes>=0),
  duration_minutes integer not null default 30 check (duration_minutes between 5 and 480),
  service_mode text not null default 'in_person' check (service_mode in ('in_person','online','both')),
  availability_notes text,
  image_path text,
  listing_status text not null default 'active' check (listing_status in ('active','inactive')),
  approval_status text not null default 'pending'
    check (approval_status in ('pending','under_review','changes_requested','approved','rejected')),
  admin_notes text,
  submitted_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists health_specialist_services_provider_idx
  on public.health_specialist_services(provider_id,approval_status,listing_status);
create index if not exists health_specialist_services_approval_idx
  on public.health_specialist_services(approval_status,submitted_at desc);

alter table public.health_specialist_services enable row level security;

drop policy if exists health_specialist_services_read_own on public.health_specialist_services;
create policy health_specialist_services_read_own
on public.health_specialist_services for select to authenticated
using (provider_id=(select auth.uid()));

drop policy if exists health_specialist_services_admin_read on public.health_specialist_services;
create policy health_specialist_services_admin_read
on public.health_specialist_services for select to authenticated
using (private.is_leogo_admin('approvals.read'));

revoke all on public.health_specialist_services from anon,authenticated;
grant select on public.health_specialist_services to authenticated;

create or replace function public.health_specialist_list_own_services()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_rows jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.updated_at desc),'[]'::jsonb)
  into v_rows
  from public.health_specialist_services s
  where s.provider_id=v_uid;
  return v_rows;
end;
$$;

revoke all on function public.health_specialist_list_own_services() from public,anon;
grant execute on function public.health_specialist_list_own_services() to authenticated;

create or replace function public.health_specialist_save_service(
  p_service_id uuid,
  p_service_name text,
  p_specialty text,
  p_description text,
  p_consultation_fee_kes numeric,
  p_duration_minutes integer,
  p_service_mode text,
  p_availability_notes text,
  p_image_path text,
  p_listing_status text
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_id uuid;
  v_existing public.health_specialist_services%rowtype;
  v_row jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(
    select 1 from public.health_medicine_accounts h
    where h.user_id=v_uid
      and h.application_status='approved'
      and h.business_type='health_specialist'
  ) then raise exception 'Approved Health Specialist / Doctor account required'; end if;

  if char_length(btrim(coalesce(p_service_name,'')))<2 then raise exception 'Service name is required'; end if;
  if char_length(btrim(coalesce(p_specialty,'')))<2 then raise exception 'Specialty / service category is required'; end if;
  if coalesce(p_consultation_fee_kes,-1)<0 then raise exception 'Enter a valid consultation / service fee'; end if;
  if coalesce(p_duration_minutes,0)<5 or p_duration_minutes>480 then raise exception 'Service duration must be between 5 and 480 minutes'; end if;
  if p_service_mode not in ('in_person','online','both') then raise exception 'Choose a valid service mode'; end if;
  if p_listing_status not in ('active','inactive') then raise exception 'Choose a valid listing status'; end if;

  if p_service_id is null then
    insert into public.health_specialist_services(
      provider_id,service_name,specialty,description,consultation_fee_kes,duration_minutes,
      service_mode,availability_notes,image_path,listing_status,approval_status,admin_notes,
      submitted_at,approved_at,approved_by,updated_at
    ) values (
      v_uid,btrim(p_service_name),btrim(p_specialty),nullif(btrim(coalesce(p_description,'')),''),
      p_consultation_fee_kes,p_duration_minutes,p_service_mode,nullif(btrim(coalesce(p_availability_notes,'')),''),
      nullif(btrim(coalesce(p_image_path,'')),''),p_listing_status,'pending',null,now(),null,null,now()
    ) returning id into v_id;
  else
    select * into v_existing
    from public.health_specialist_services
    where id=p_service_id and provider_id=v_uid
    for update;
    if not found then raise exception 'Health Specialist service not found'; end if;
    if v_existing.approval_status='under_review' then
      raise exception 'This service is locked while LEOGO Admin is reviewing it';
    end if;

    update public.health_specialist_services set
      service_name=btrim(p_service_name),
      specialty=btrim(p_specialty),
      description=nullif(btrim(coalesce(p_description,'')),''),
      consultation_fee_kes=p_consultation_fee_kes,
      duration_minutes=p_duration_minutes,
      service_mode=p_service_mode,
      availability_notes=nullif(btrim(coalesce(p_availability_notes,'')),''),
      image_path=coalesce(nullif(btrim(coalesce(p_image_path,'')),''),image_path),
      listing_status=p_listing_status,
      approval_status='pending',
      admin_notes=null,
      submitted_at=now(),
      approved_at=null,
      approved_by=null,
      updated_at=now()
    where id=p_service_id and provider_id=v_uid
    returning id into v_id;
  end if;

  select to_jsonb(s) into v_row from public.health_specialist_services s where s.id=v_id;
  perform private.notify_partner(
    v_uid,'health_medicine','health_specialist_service_submitted',
    'Health Specialist service sent for approval',
    btrim(p_service_name)||' was sent to LEOGO Admin for review.',
    'health_specialist_service',v_id,'health-services',
    jsonb_build_object('status','pending')
  );
  return v_row;
end;
$$;

revoke all on function public.health_specialist_save_service(uuid,text,text,text,numeric,integer,text,text,text,text) from public,anon;
grant execute on function public.health_specialist_save_service(uuid,text,text,text,numeric,integer,text,text,text,text) to authenticated;

-- 3) Admin-controlled LEOGO booking fee.
create table if not exists public.health_medicine_settings (
  id smallint primary key default 1 check (id=1),
  specialist_booking_fee_kes numeric(12,2) not null default 50 check (specialist_booking_fee_kes>=0),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.health_medicine_settings(id,specialist_booking_fee_kes)
values(1,50)
on conflict(id) do nothing;

alter table public.health_medicine_settings enable row level security;
revoke all on public.health_medicine_settings from anon,authenticated;
grant select on public.health_medicine_settings to authenticated;

drop policy if exists health_settings_admin_read on public.health_medicine_settings;
create policy health_settings_admin_read
on public.health_medicine_settings for select to authenticated
using (private.is_leogo_admin('settings.read') or private.is_leogo_admin('approvals.read'));

create or replace function public.admin_health_specialist_get_settings()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_row jsonb;
begin
  if not (private.is_leogo_admin('settings.read') or private.is_leogo_admin('approvals.read')) then
    raise exception 'Admin access required';
  end if;
  select to_jsonb(s) into v_row from public.health_medicine_settings s where s.id=1;
  return coalesce(v_row,jsonb_build_object('id',1,'specialist_booking_fee_kes',50));
end;
$$;

revoke all on function public.admin_health_specialist_get_settings() from public,anon;
grant execute on function public.admin_health_specialist_get_settings() to authenticated;

create or replace function public.admin_health_specialist_set_booking_fee(p_booking_fee_kes numeric)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_before jsonb;v_after jsonb;
begin
  if not (private.is_leogo_admin('fees.manage') or private.is_leogo_admin('settings.manage')) then raise exception 'Fee settings permission required'; end if;
  if p_booking_fee_kes is null or p_booking_fee_kes<0 or p_booking_fee_kes>100000 then
    raise exception 'Enter a valid Health Specialist booking fee';
  end if;

  select to_jsonb(s) into v_before from public.health_medicine_settings s where s.id=1 for update;
  insert into public.health_medicine_settings(id,specialist_booking_fee_kes,updated_by,updated_at)
  values(1,p_booking_fee_kes,auth.uid(),now())
  on conflict(id) do update set
    specialist_booking_fee_kes=excluded.specialist_booking_fee_kes,
    updated_by=excluded.updated_by,
    updated_at=now();

  select to_jsonb(s) into v_after from public.health_medicine_settings s where s.id=1;
  perform private.write_admin_audit(
    'health_medicine.specialist_booking_fee.updated','health_medicine_settings','1',
    v_before,v_after,jsonb_build_object('booking_fee_kes',p_booking_fee_kes)
  );
  return v_after;
end;
$$;

revoke all on function public.admin_health_specialist_set_booking_fee(numeric) from public,anon;
grant execute on function public.admin_health_specialist_set_booking_fee(numeric) to authenticated;

-- 4) Customer Health Specialist bookings.
create table if not exists public.health_specialist_bookings (
  id uuid primary key default gen_random_uuid(),
  booking_reference text not null unique,
  customer_id uuid not null references auth.users(id) on delete restrict,
  provider_id uuid not null references public.health_medicine_accounts(user_id) on delete restrict,
  service_id uuid not null references public.health_specialist_services(id) on delete restrict,
  customer_name text not null,
  customer_phone text not null,
  preferred_date date not null,
  preferred_time time not null,
  service_mode text not null check (service_mode in ('in_person','online')),
  customer_notes text,
  consultation_fee_kes numeric(12,2) not null default 0 check (consultation_fee_kes>=0),
  booking_fee_kes numeric(12,2) not null check (booking_fee_kes>=0),
  payment_account_id uuid references public.payment_accounts(id) on delete restrict,
  payment_method text not null,
  payment_message text not null,
  payment_status text not null default 'submitted'
    check (payment_status in ('submitted','verified_paid','rejected')),
  booking_status text not null default 'awaiting_payment_verification'
    check (booking_status in ('awaiting_payment_verification','requested','accepted','declined','completed','cancelled')),
  provider_notes text,
  admin_notes text,
  payment_verified_at timestamptz,
  payment_verified_by uuid references auth.users(id),
  responded_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists health_specialist_bookings_customer_idx
  on public.health_specialist_bookings(customer_id,created_at desc);
create index if not exists health_specialist_bookings_provider_idx
  on public.health_specialist_bookings(provider_id,booking_status,created_at desc);
create index if not exists health_specialist_bookings_payment_idx
  on public.health_specialist_bookings(payment_status,created_at desc);

alter table public.health_specialist_bookings enable row level security;
revoke all on public.health_specialist_bookings from anon,authenticated;
grant select on public.health_specialist_bookings to authenticated;

drop policy if exists health_specialist_bookings_customer_read on public.health_specialist_bookings;
create policy health_specialist_bookings_customer_read
on public.health_specialist_bookings for select to authenticated
using (customer_id=(select auth.uid()));

drop policy if exists health_specialist_bookings_provider_read on public.health_specialist_bookings;
create policy health_specialist_bookings_provider_read
on public.health_specialist_bookings for select to authenticated
using (provider_id=(select auth.uid()));

drop policy if exists health_specialist_bookings_admin_read on public.health_specialist_bookings;
create policy health_specialist_bookings_admin_read
on public.health_specialist_bookings for select to authenticated
using (private.is_leogo_admin('approvals.read') or private.is_leogo_admin('orders.read'));

create or replace function public.public_list_health_specialist_services()
returns jsonb
language sql security definer set search_path=''
as $$
  select jsonb_build_object(
    'booking_fee_kes',coalesce((select specialist_booking_fee_kes from public.health_medicine_settings where id=1),50),
    'payment',(
      select jsonb_build_object(
        'display_name',p.display_name,
        'account_type',p.account_type,
        'business_name',p.business_name,
        'account_name',p.account_name,
        'till_number',p.till_number,
        'paybill_number',p.paybill_number,
        'account_number',p.account_number,
        'bank_name',p.bank_name,
        'branch',p.branch,
        'instructions',p.instructions
      )
      from public.payment_account_assignments a
      join public.payment_accounts p on p.id=a.account_id
      where a.function_code='service_payments' and p.status='active'
      limit 1
    ),
    'services',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,
        'provider_id',s.provider_id,
        'provider_name',h.business_name,
        'specialist_name',h.owner_name,
        'profile_picture_path',h.profile_picture_path,
        'service_name',s.service_name,
        'specialty',s.specialty,
        'description',s.description,
        'consultation_fee_kes',s.consultation_fee_kes,
        'duration_minutes',s.duration_minutes,
        'service_mode',s.service_mode,
        'availability_notes',s.availability_notes,
        'image_path',s.image_path,
        'county',h.county,
        'sub_county',h.sub_county,
        'town',h.town,
        'location_details',h.location_details,
        'shop_map_link',h.shop_map_link
      ) order by s.updated_at desc)
      from public.health_specialist_services s
      join public.health_medicine_accounts h on h.user_id=s.provider_id
      where h.application_status='approved'
        and h.business_type='health_specialist'
        and h.availability_status<>'closed'
        and s.approval_status='approved'
        and s.listing_status='active'
    ),'[]'::jsonb)
  );
$$;

revoke all on function public.public_list_health_specialist_services() from public;
grant execute on function public.public_list_health_specialist_services() to anon,authenticated;

create or replace function public.customer_create_health_specialist_booking(
  p_service_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_preferred_date date,
  p_preferred_time time,
  p_service_mode text,
  p_customer_notes text,
  p_payment_message text
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_service public.health_specialist_services%rowtype;
  v_provider public.health_medicine_accounts%rowtype;
  v_fee numeric;
  v_payment_id uuid;
  v_payment_type text;
  v_id uuid;
  v_reference text;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if char_length(btrim(coalesce(p_customer_name,'')))<2 then raise exception 'Customer name is required'; end if;
  if coalesce(p_customer_phone,'') !~ '^[+]254[17][0-9]{8}$' then raise exception 'Enter a valid Kenyan phone number'; end if;
  if p_preferred_date is null or p_preferred_date<current_date then raise exception 'Choose a valid booking date'; end if;
  if p_preferred_time is null then raise exception 'Choose a preferred booking time'; end if;
  if p_service_mode not in ('in_person','online') then raise exception 'Choose in-person or online service'; end if;
  if char_length(btrim(coalesce(p_payment_message,'')))<4 then
    raise exception 'Paste the payment confirmation / reference for the LEOGO booking fee';
  end if;

  select * into v_service
  from public.health_specialist_services s
  where s.id=p_service_id and s.approval_status='approved' and s.listing_status='active';
  if not found then raise exception 'This Health Specialist service is not available for booking'; end if;

  select * into v_provider
  from public.health_medicine_accounts h
  where h.user_id=v_service.provider_id
    and h.application_status='approved'
    and h.business_type='health_specialist'
    and h.availability_status<>'closed';
  if not found then raise exception 'This Health Specialist is not currently available for booking'; end if;

  if v_service.service_mode='in_person' and p_service_mode<>'in_person' then raise exception 'This service is available in person only'; end if;
  if v_service.service_mode='online' and p_service_mode<>'online' then raise exception 'This service is available online only'; end if;

  if exists(
    select 1 from public.health_specialist_bookings b
    where b.customer_id=v_uid
      and b.service_id=p_service_id
      and b.preferred_date=p_preferred_date
      and b.preferred_time=p_preferred_time
      and b.booking_status not in ('declined','cancelled')
  ) then raise exception 'You already have this Health Specialist service booked for the selected date and time'; end if;

  if exists(
    select 1 from public.health_specialist_bookings b
    where lower(btrim(b.payment_message))=lower(btrim(p_payment_message))
      and b.payment_status in ('submitted','verified_paid')
  ) then raise exception 'This booking payment confirmation has already been used'; end if;

  select specialist_booking_fee_kes into v_fee
  from public.health_medicine_settings where id=1;
  v_fee:=coalesce(v_fee,50);

  select p.id,p.account_type into v_payment_id,v_payment_type
  from public.payment_account_assignments a
  join public.payment_accounts p on p.id=a.account_id
  where a.function_code='service_payments' and p.status='active'
  limit 1;
  if v_payment_id is null then raise exception 'LEOGO booking payment account is not configured. Contact Customer Care.'; end if;

  v_reference:='LHS-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

  insert into public.health_specialist_bookings(
    booking_reference,customer_id,provider_id,service_id,customer_name,customer_phone,
    preferred_date,preferred_time,service_mode,customer_notes,consultation_fee_kes,
    booking_fee_kes,payment_account_id,payment_method,payment_message,payment_status,booking_status
  ) values (
    v_reference,v_uid,v_service.provider_id,v_service.id,btrim(p_customer_name),btrim(p_customer_phone),
    p_preferred_date,p_preferred_time,p_service_mode,nullif(btrim(coalesce(p_customer_notes,'')),''),
    v_service.consultation_fee_kes,v_fee,v_payment_id,v_payment_type,btrim(p_payment_message),
    'submitted','awaiting_payment_verification'
  ) returning id into v_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values (
    v_uid,'payment','Health Specialist booking submitted',
    'Booking '||v_reference||' was received. LEOGO will verify the booking fee before sending it to the Health Specialist.',
    'health_specialist_booking',v_id,'health_specialist_booking_submitted_'||v_id::text,'orders',
    jsonb_build_object('booking_reference',v_reference,'booking_fee_kes',v_fee,'payment_status','submitted')
  );

  return jsonb_build_object(
    'ok',true,'booking_id',v_id,'booking_reference',v_reference,
    'booking_fee_kes',v_fee,'payment_status','submitted','booking_status','awaiting_payment_verification'
  );
end;
$$;

revoke all on function public.customer_create_health_specialist_booking(uuid,text,text,date,time,text,text,text) from public,anon;
grant execute on function public.customer_create_health_specialist_booking(uuid,text,text,date,time,text,text,text) to authenticated;

create or replace function public.customer_list_health_specialist_bookings()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_rows jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select coalesce(jsonb_agg(
    to_jsonb(b)||jsonb_build_object(
      'service_name',s.service_name,
      'specialty',s.specialty,
      'provider_name',h.business_name,
      'specialist_name',h.owner_name,
      'provider_location',concat_ws(' · ',h.location_details,h.town,h.county)
    ) order by b.created_at desc
  ),'[]'::jsonb)
  into v_rows
  from public.health_specialist_bookings b
  join public.health_specialist_services s on s.id=b.service_id
  join public.health_medicine_accounts h on h.user_id=b.provider_id
  where b.customer_id=v_uid;
  return v_rows;
end;
$$;

revoke all on function public.customer_list_health_specialist_bookings() from public,anon;
grant execute on function public.customer_list_health_specialist_bookings() to authenticated;

create or replace function public.health_specialist_list_own_bookings()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_rows jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(
    select 1 from public.health_medicine_accounts h
    where h.user_id=v_uid and h.application_status='approved' and h.business_type='health_specialist'
  ) then raise exception 'Approved Health Specialist / Doctor account required'; end if;

  select coalesce(jsonb_agg(
    to_jsonb(b)||jsonb_build_object('service_name',s.service_name,'specialty',s.specialty)
    order by b.created_at desc
  ),'[]'::jsonb)
  into v_rows
  from public.health_specialist_bookings b
  join public.health_specialist_services s on s.id=b.service_id
  where b.provider_id=v_uid;
  return v_rows;
end;
$$;

revoke all on function public.health_specialist_list_own_bookings() from public,anon;
grant execute on function public.health_specialist_list_own_bookings() to authenticated;

create or replace function public.health_specialist_update_booking_status(
  p_booking_id uuid,p_status text,p_provider_notes text default null
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_booking public.health_specialist_bookings%rowtype;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if p_status not in ('accepted','declined','completed') then raise exception 'Unsupported booking status'; end if;

  select * into v_booking
  from public.health_specialist_bookings
  where id=p_booking_id and provider_id=v_uid for update;
  if not found then raise exception 'Health Specialist booking not found'; end if;
  if v_booking.payment_status<>'verified_paid' then
    raise exception 'LEOGO must verify the booking fee before this booking can be actioned';
  end if;
  if p_status in ('accepted','declined') and v_booking.booking_status<>'requested' then
    raise exception 'Only a new requested booking can be accepted or declined';
  end if;
  if p_status='completed' and v_booking.booking_status<>'accepted' then
    raise exception 'Only an accepted booking can be completed';
  end if;

  update public.health_specialist_bookings set
    booking_status=p_status,
    provider_notes=nullif(btrim(coalesce(p_provider_notes,'')),''),
    responded_at=case when p_status in ('accepted','declined') then now() else responded_at end,
    completed_at=case when p_status='completed' then now() else completed_at end,
    updated_at=now()
  where id=p_booking_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values (
    v_booking.customer_id,'service',
    case p_status when 'accepted' then 'Health Specialist booking accepted'
      when 'declined' then 'Health Specialist booking declined'
      else 'Health Specialist service completed' end,
    'Booking '||v_booking.booking_reference||' is now '||replace(p_status,'_',' ')||'.',
    'health_specialist_booking',v_booking.id,'health_specialist_booking_'||p_status||'_'||v_booking.id::text,'orders',
    jsonb_build_object('booking_reference',v_booking.booking_reference,'booking_status',p_status)
  );

  return jsonb_build_object('ok',true,'booking_status',p_status);
end;
$$;

revoke all on function public.health_specialist_update_booking_status(uuid,text,text) from public,anon;
grant execute on function public.health_specialist_update_booking_status(uuid,text,text) to authenticated;

-- 5) Admin approval, payment verification and operational views.
create or replace function public.admin_list_health_specialist_approvals()
returns table(
  kind text,record_id uuid,applicant_id uuid,applicant_name text,applicant_email text,
  title text,subtitle text,amount_kes numeric,status text,submitted_at timestamptz,payload jsonb
)
language plpgsql security definer set search_path=''
as $$
begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Admin access required'; end if;

  return query
  select
    'health_medicine_service'::text,
    s.id,
    s.provider_id,
    h.business_name,
    u.email::text,
    s.service_name,
    concat_ws(' · ',s.specialty,initcap(replace(s.service_mode,'_',' ')),h.town,h.county),
    s.consultation_fee_kes,
    s.approval_status,
    coalesce(s.submitted_at,s.created_at),
    (to_jsonb(s)-'image_path')||jsonb_build_object(
      'health_business_name',h.business_name,
      'health_specialist_name',h.owner_name,
      'business_type',h.business_type,
      'health_service_image_path',s.image_path
    )
  from public.health_specialist_services s
  join public.health_medicine_accounts h on h.user_id=s.provider_id
  left join auth.users u on u.id=s.provider_id
  where s.approval_status in ('pending','under_review','changes_requested')
  order by coalesce(s.submitted_at,s.created_at) desc;
end;
$$;

revoke all on function public.admin_list_health_specialist_approvals() from public,anon;
grant execute on function public.admin_list_health_specialist_approvals() to authenticated;

create or replace function public.admin_review_health_specialist_service(
  p_record_id uuid,p_decision text,p_notes text default null
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_before jsonb;v_after jsonb;v_provider uuid;v_status text;v_name text;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('approve','reject','under_review','changes_requested') then raise exception 'Unsupported decision'; end if;
  if p_decision in ('reject','changes_requested') and char_length(btrim(coalesce(p_notes,'')))<3 then
    raise exception 'A clear reason is required';
  end if;

  select to_jsonb(s),s.provider_id,s.service_name
  into v_before,v_provider,v_name
  from public.health_specialist_services s
  where s.id=p_record_id for update;
  if v_before is null then raise exception 'Health Specialist service not found'; end if;

  if not exists(
    select 1 from public.health_medicine_accounts h
    where h.user_id=v_provider
      and h.application_status='approved'
      and h.business_type='health_specialist'
  ) then raise exception 'Provider must remain an approved Health Specialist before a service can be approved'; end if;

  v_status:=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected'
    when 'changes_requested' then 'changes_requested' else 'under_review' end;

  update public.health_specialist_services set
    approval_status=v_status,
    approved_at=case when p_decision='approve' then now() else approved_at end,
    approved_by=case when p_decision='approve' then auth.uid() else approved_by end,
    admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
    updated_at=now()
  where id=p_record_id
    and approval_status in ('pending','under_review','changes_requested');

  if not found then raise exception 'Health Specialist service has already been reviewed'; end if;

  select to_jsonb(s) into v_after from public.health_specialist_services s where s.id=p_record_id;

  perform private.notify_partner(
    v_provider,'health_medicine','health_specialist_service_'||v_status,
    'Health Specialist service '||case p_decision when 'approve' then 'approved'
      when 'changes_requested' then 'needs correction'
      when 'reject' then 'not approved' else 'under review' end,
    coalesce(v_name,'Service')||case p_decision
      when 'approve' then ' is approved and can now receive customer bookings.'
      when 'changes_requested' then ' needs changes before it can be approved.'
      when 'reject' then ' was not approved. Review the Admin note.'
      else ' is being reviewed by LEOGO Admin.' end,
    'health_specialist_service',p_record_id,'health-services',jsonb_build_object('status',v_status)
  );

  perform private.write_admin_audit(
    'approval.health_specialist.service.'||p_decision,'health_specialist_service',p_record_id::text,
    v_before,v_after,jsonb_build_object('notes',p_notes)
  );
  return jsonb_build_object('ok',true,'status',v_status);
end;
$$;

revoke all on function public.admin_review_health_specialist_service(uuid,text,text) from public,anon;
grant execute on function public.admin_review_health_specialist_service(uuid,text,text) to authenticated;

create or replace function public.admin_list_health_specialist_operations()
returns jsonb
language plpgsql security definer set search_path=''
as $$
begin
  if not (private.is_leogo_admin('approvals.read') or private.is_leogo_admin('orders.read')) then
    raise exception 'Admin access required';
  end if;
  return jsonb_build_object(
    'services',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.updated_at desc)
      from (
        select s.*,h.business_name as provider_name,h.owner_name as specialist_name,h.town,h.county
        from public.health_specialist_services s
        join public.health_medicine_accounts h on h.user_id=s.provider_id
      ) x
    ),'[]'::jsonb),
    'bookings',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select b.*,s.service_name,s.specialty,h.business_name as provider_name,h.owner_name as specialist_name,u.email::text as customer_email
        from public.health_specialist_bookings b
        join public.health_specialist_services s on s.id=b.service_id
        join public.health_medicine_accounts h on h.user_id=b.provider_id
        left join auth.users u on u.id=b.customer_id
      ) x
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_list_health_specialist_operations() from public,anon;
grant execute on function public.admin_list_health_specialist_operations() to authenticated;

create or replace function public.admin_review_health_specialist_booking_payment(
  p_booking_id uuid,p_decision text,p_notes text default null
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_booking public.health_specialist_bookings%rowtype;
begin
  if not private.is_leogo_admin('approvals.manage')
     and not private.is_leogo_admin('orders.payment_verify') then
    raise exception 'Payment verification permission required';
  end if;
  if p_decision not in ('verify','reject') then raise exception 'Choose verify or reject'; end if;
  if p_decision='reject' and char_length(btrim(coalesce(p_notes,'')))<3 then
    raise exception 'Add a clear rejection reason';
  end if;

  select * into v_booking
  from public.health_specialist_bookings
  where id=p_booking_id for update;
  if not found then raise exception 'Health Specialist booking not found'; end if;
  if v_booking.payment_status<>'submitted' then raise exception 'This booking fee is no longer awaiting verification'; end if;

  update public.health_specialist_bookings set
    payment_status=case when p_decision='verify' then 'verified_paid' else 'rejected' end,
    booking_status=case when p_decision='verify' then 'requested' else 'cancelled' end,
    payment_verified_at=case when p_decision='verify' then now() else null end,
    payment_verified_by=case when p_decision='verify' then auth.uid() else null end,
    admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
    updated_at=now()
  where id=p_booking_id;

  if p_decision='verify' then
    perform private.notify_partner(
      v_booking.provider_id,'health_medicine','health_specialist_booking_received',
      'New Health Specialist booking',
      'LEOGO verified the booking fee for '||v_booking.booking_reference||'. Open Service Bookings to respond.',
      'health_specialist_booking',v_booking.id,'health-bookings',
      jsonb_build_object('booking_reference',v_booking.booking_reference,'booking_status','requested')
    );
  end if;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values (
    v_booking.customer_id,'payment',
    case when p_decision='verify' then 'Health Specialist booking fee verified' else 'Health Specialist booking fee rejected' end,
    'Booking '||v_booking.booking_reference||
      case when p_decision='verify'
        then ' has been sent to the Health Specialist for response.'
        else ' could not be verified. Please contact LEOGO Customer Care before making another booking.' end,
    'health_specialist_booking',v_booking.id,
    'health_specialist_booking_payment_'||p_decision||'_'||v_booking.id::text,'orders',
    jsonb_build_object('booking_reference',v_booking.booking_reference,'payment_status',
      case when p_decision='verify' then 'verified_paid' else 'rejected' end)
  );

  perform private.write_admin_audit(
    'health_specialist.booking_payment.'||p_decision,'health_specialist_booking',p_booking_id::text,
    to_jsonb(v_booking),
    (select to_jsonb(b) from public.health_specialist_bookings b where b.id=p_booking_id),
    jsonb_build_object('notes',p_notes)
  );

  return jsonb_build_object(
    'ok',true,
    'payment_status',case when p_decision='verify' then 'verified_paid' else 'rejected' end,
    'booking_status',case when p_decision='verify' then 'requested' else 'cancelled' end
  );
end;
$$;

revoke all on function public.admin_review_health_specialist_booking_payment(uuid,text,text) from public,anon;
grant execute on function public.admin_review_health_specialist_booking_payment(uuid,text,text) to authenticated;


-- Existing Health Partner list now reports approved specialist service counts as well.
create or replace function public.public_list_health_medicine()
returns jsonb
language sql security definer set search_path=''
as $$
  select jsonb_build_object(
    'providers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider_id',h.user_id,
        'business_name',h.business_name,
        'business_type',h.business_type,
        'other_business_type',h.other_business_type,
        'county',h.county,
        'sub_county',h.sub_county,
        'town',h.town,
        'location_details',h.location_details,
        'shop_map_link',h.shop_map_link,
        'business_description',h.business_description,
        'profile_picture_path',h.profile_picture_path,
        'availability_status',h.availability_status,
        'approved_product_count',(select count(*) from public.health_medicine_products p where p.provider_id=h.user_id and p.approval_status='approved' and p.availability_status<>'inactive'),
        'approved_service_count',(select count(*) from public.health_specialist_services s where s.provider_id=h.user_id and s.approval_status='approved' and s.listing_status='active')
      ) order by h.business_name)
      from public.health_medicine_accounts h
      where h.application_status='approved'
        and h.availability_status<>'closed'
    ),'[]'::jsonb),
    'products',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,
        'provider_id',p.provider_id,
        'provider_name',h.business_name,
        'business_type',h.business_type,
        'product_name',p.product_name,
        'product_kind',p.product_kind,
        'medicine_classification',p.medicine_classification,
        'requires_prescription',p.requires_prescription,
        'brand',p.brand,
        'description',p.description,
        'price_kes',p.price_kes,
        'quantity_available',p.quantity_available,
        'measurement_unit',p.measurement_unit,
        'image_path',p.image_path,
        'availability_status',p.availability_status,
        'order_mode',p.order_mode,
        'cart_eligible',(p.order_mode='cart' and p.medicine_classification='otc' and p.requires_prescription=false),
        'county',h.county,
        'sub_county',h.sub_county,
        'town',h.town,
        'location_details',h.location_details
      ) order by p.updated_at desc)
      from public.health_medicine_products p
      join public.health_medicine_accounts h on h.user_id=p.provider_id
      where h.application_status='approved'
        and h.availability_status<>'closed'
        and p.approval_status='approved'
        and p.availability_status<>'inactive'
    ),'[]'::jsonb)
  );
$$;

revoke all on function public.public_list_health_medicine() from public;
grant execute on function public.public_list_health_medicine() to anon,authenticated;
