-- LEOGO DIGITAL MARKET
-- Service Provider Partner Module V1
-- Additive migration: does not modify Seller, marketplace order, delivery or Customer checkout tables.

create table if not exists public.service_provider_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null,
  owner_name text not null,
  id_number text not null,
  phone text not null,
  primary_service text not null,
  service_category text,
  experience_years integer,
  county text not null,
  sub_county text not null,
  county_code text,
  sub_county_code text,
  town text not null,
  location_details text not null,
  business_description text,
  service_area_notes text,
  availability_status text not null default 'available' check (availability_status in ('available','busy','offline')),
  business_id_document_path text not null,
  business_licence_path text,
  registration_certificate_path text,
  professional_licence_path text,
  other_permit_paths text[] not null default '{}',
  application_status text not null default 'submitted' check (application_status in ('draft','submitted','under_review','changes_requested','approved','rejected','suspended')),
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_provider_accounts_status_idx
  on public.service_provider_accounts(application_status,submitted_at desc);
create index if not exists service_provider_accounts_location_idx
  on public.service_provider_accounts(county_code,sub_county_code);

create table if not exists public.service_provider_services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.service_provider_accounts(user_id) on delete cascade,
  service_name text not null,
  category_name text,
  description text,
  pricing_model text not null default 'quote' check (pricing_model in ('fixed','from','hourly','quote')),
  price_from_kes numeric(12,2),
  price_to_kes numeric(12,2),
  unit_label text,
  service_area text,
  availability_notes text,
  is_available boolean not null default true,
  approval_status text not null default 'pending' check (approval_status in ('pending','under_review','changes_requested','approved','rejected')),
  admin_notes text,
  submitted_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_provider_services_prices_check check (
    (price_from_kes is null or price_from_kes >= 0)
    and (price_to_kes is null or price_to_kes >= 0)
    and (price_to_kes is null or price_from_kes is null or price_to_kes >= price_from_kes)
  )
);

create index if not exists service_provider_services_provider_idx
  on public.service_provider_services(provider_id,created_at desc);
create index if not exists service_provider_services_approval_idx
  on public.service_provider_services(approval_status,submitted_at desc);

alter table public.service_provider_accounts enable row level security;
alter table public.service_provider_services enable row level security;

drop policy if exists "Provider reads own service account" on public.service_provider_accounts;
create policy "Provider reads own service account"
on public.service_provider_accounts for select to authenticated
using ((select auth.uid())=user_id);

drop policy if exists "Admin reads service provider accounts" on public.service_provider_accounts;
create policy "Admin reads service provider accounts"
on public.service_provider_accounts for select to authenticated
using (private.is_leogo_admin('approvals.read'));

drop policy if exists "Provider reads own service listings" on public.service_provider_services;
create policy "Provider reads own service listings"
on public.service_provider_services for select to authenticated
using ((select auth.uid())=provider_id);

drop policy if exists "Admin reads service provider listings" on public.service_provider_services;
create policy "Admin reads service provider listings"
on public.service_provider_services for select to authenticated
using (private.is_leogo_admin('approvals.read'));

grant select on public.service_provider_accounts to authenticated;
grant select on public.service_provider_services to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('service-provider-verification','service-provider-verification',false,8388608,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

drop policy if exists "Service provider uploads own verification" on storage.objects;
create policy "Service provider uploads own verification"
on storage.objects for insert to authenticated
with check (
  bucket_id='service-provider-verification'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists "Service provider reads own verification" on storage.objects;
create policy "Service provider reads own verification"
on storage.objects for select to authenticated
using (
  bucket_id='service-provider-verification'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists "Admin reads service provider verification" on storage.objects;
create policy "Admin reads service provider verification"
on storage.objects for select to authenticated
using (
  bucket_id='service-provider-verification'
  and private.is_leogo_admin('approvals.read')
);

drop policy if exists "Service provider deletes own notifications" on public.partner_notifications;
create policy "Service provider deletes own notifications"
on public.partner_notifications for delete to authenticated
using (user_id=(select auth.uid()) and partner_type='service_provider');

create or replace function public.service_provider_get_own_account()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_row jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select to_jsonb(p) into v_row from public.service_provider_accounts p where p.user_id=v_uid limit 1;
  return v_row;
end;
$$;

create or replace function public.submit_service_provider_application(
  p_business_name text,p_owner_name text,p_id_number text,p_phone text,p_primary_service text,p_service_category text,
  p_experience_years integer,p_county_code text,p_sub_county_code text,p_town text,p_location_details text,
  p_business_description text,p_service_area_notes text,p_business_id_document_path text,
  p_business_licence_path text default null,p_registration_certificate_path text default null,
  p_professional_licence_path text default null,p_other_permit_paths text[] default '{}'
)
returns public.service_provider_accounts
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_existing text;
  v_county_name text;
  v_subcounty_name text;
  v_row public.service_provider_accounts;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if char_length(btrim(coalesce(p_business_name,'')))<2 then raise exception 'Business or professional name is required'; end if;
  if char_length(btrim(coalesce(p_owner_name,'')))<2 then raise exception 'Owner or professional name is required'; end if;
  if char_length(btrim(coalesce(p_id_number,'')))<5 then raise exception 'A valid ID number is required'; end if;
  if coalesce(p_phone,'') !~ '^[+]254[17][0-9]{8}
  if char_length(btrim(coalesce(p_primary_service,'')))<2 then raise exception 'Primary service is required'; end if;
  if p_experience_years is not null and (p_experience_years<0 or p_experience_years>80) then raise exception 'Experience years must be between 0 and 80'; end if;
  if nullif(btrim(coalesce(p_business_id_document_path,'')),'') is null then raise exception 'Business ID or identification document is required'; end if;

  select c.name into v_county_name from public.kenya_counties c where c.code=p_county_code and c.is_active;
  if v_county_name is null then raise exception 'Choose a valid Kenyan county'; end if;
  select s.name into v_subcounty_name from public.kenya_subcounties s
    where s.code=p_sub_county_code and s.county_code=p_county_code and s.is_active;
  if v_subcounty_name is null then raise exception 'Choose a valid sub-county for the selected county'; end if;

  select application_status into v_existing from public.service_provider_accounts where user_id=v_uid;
  if v_existing is not null and v_existing not in ('draft','changes_requested','rejected') then
    raise exception 'Service Provider application is already locked for review';
  end if;

  insert into public.service_provider_accounts(
    user_id,business_name,owner_name,id_number,phone,primary_service,service_category,experience_years,
    county,sub_county,county_code,sub_county_code,town,location_details,business_description,service_area_notes,
    business_id_document_path,business_licence_path,registration_certificate_path,professional_licence_path,other_permit_paths,
    application_status,submitted_at,approved_at,approved_by,admin_notes,updated_at
  ) values (
    v_uid,btrim(p_business_name),btrim(p_owner_name),upper(btrim(p_id_number)),btrim(p_phone),btrim(p_primary_service),
    nullif(btrim(coalesce(p_service_category,'')),''),p_experience_years,
    v_county_name,v_subcounty_name,p_county_code,p_sub_county_code,btrim(p_town),btrim(p_location_details),
    nullif(btrim(coalesce(p_business_description,'')),''),nullif(btrim(coalesce(p_service_area_notes,'')),''),
    p_business_id_document_path,nullif(btrim(coalesce(p_business_licence_path,'')),''),
    nullif(btrim(coalesce(p_registration_certificate_path,'')),''),
    nullif(btrim(coalesce(p_professional_licence_path,'')),''),
    coalesce(p_other_permit_paths,'{}'),'submitted',now(),null,null,null,now()
  )
  on conflict(user_id) do update set
    business_name=excluded.business_name,owner_name=excluded.owner_name,id_number=excluded.id_number,phone=excluded.phone,
    primary_service=excluded.primary_service,service_category=excluded.service_category,experience_years=excluded.experience_years,
    county=excluded.county,sub_county=excluded.sub_county,county_code=excluded.county_code,sub_county_code=excluded.sub_county_code,
    town=excluded.town,location_details=excluded.location_details,business_description=excluded.business_description,
    service_area_notes=excluded.service_area_notes,business_id_document_path=excluded.business_id_document_path,
    business_licence_path=excluded.business_licence_path,registration_certificate_path=excluded.registration_certificate_path,
    professional_licence_path=excluded.professional_licence_path,other_permit_paths=excluded.other_permit_paths,
    application_status='submitted',submitted_at=now(),approved_at=null,approved_by=null,admin_notes=null,updated_at=now()
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.service_provider_list_own_services()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_rows jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc),'[]'::jsonb) into v_rows
  from public.service_provider_services s where s.provider_id=v_uid;
  return v_rows;
end;
$$;

create or replace function public.service_provider_save_service(
  p_service_id uuid,p_service_name text,p_category_name text,p_description text,p_pricing_model text,
  p_price_from_kes numeric,p_price_to_kes numeric,p_unit_label text,p_service_area text,p_availability_notes text,
  p_is_available boolean default true
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_status text; v_id uuid; v_row jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select application_status into v_status from public.service_provider_accounts where user_id=v_uid;
  if v_status is distinct from 'approved' then raise exception 'Your Service Provider account must be approved before adding services'; end if;
  if char_length(btrim(coalesce(p_service_name,'')))<2 then raise exception 'Service name is required'; end if;
  if p_pricing_model not in ('fixed','from','hourly','quote') then raise exception 'Choose a valid pricing model'; end if;
  if p_price_from_kes is not null and p_price_from_kes<0 then raise exception 'Price cannot be negative'; end if;
  if p_price_to_kes is not null and p_price_to_kes<0 then raise exception 'Price cannot be negative'; end if;
  if p_price_from_kes is not null and p_price_to_kes is not null and p_price_to_kes<p_price_from_kes then
    raise exception 'Maximum price cannot be lower than minimum price';
  end if;

  if p_service_id is null then
    insert into public.service_provider_services(
      provider_id,service_name,category_name,description,pricing_model,price_from_kes,price_to_kes,unit_label,
      service_area,availability_notes,is_available,approval_status,admin_notes,submitted_at,updated_at
    ) values (
      v_uid,btrim(p_service_name),nullif(btrim(coalesce(p_category_name,'')),''),
      nullif(btrim(coalesce(p_description,'')),''),p_pricing_model,p_price_from_kes,p_price_to_kes,
      nullif(btrim(coalesce(p_unit_label,'')),''),nullif(btrim(coalesce(p_service_area,'')),''),
      nullif(btrim(coalesce(p_availability_notes,'')),''),coalesce(p_is_available,true),'pending',null,now(),now()
    ) returning id into v_id;
  else
    update public.service_provider_services set
      service_name=btrim(p_service_name),category_name=nullif(btrim(coalesce(p_category_name,'')),''),
      description=nullif(btrim(coalesce(p_description,'')),''),pricing_model=p_pricing_model,
      price_from_kes=p_price_from_kes,price_to_kes=p_price_to_kes,unit_label=nullif(btrim(coalesce(p_unit_label,'')),''),
      service_area=nullif(btrim(coalesce(p_service_area,'')),''),availability_notes=nullif(btrim(coalesce(p_availability_notes,'')),''),
      is_available=coalesce(p_is_available,true),approval_status='pending',admin_notes=null,submitted_at=now(),
      approved_at=null,approved_by=null,updated_at=now()
    where id=p_service_id and provider_id=v_uid returning id into v_id;
    if v_id is null then raise exception 'Service listing not found'; end if;
  end if;
  select to_jsonb(s) into v_row from public.service_provider_services s where s.id=v_id;
  return v_row;
end;
$$;

create or replace function public.service_provider_delete_service(p_service_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid());
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  delete from public.service_provider_services where id=p_service_id and provider_id=v_uid;
  return found;
end;
$$;

create or replace function public.admin_list_service_provider_approvals()
returns table(
  kind text,record_id uuid,applicant_id uuid,applicant_name text,applicant_email text,title text,subtitle text,
  amount_kes numeric,status text,submitted_at timestamptz,payload jsonb
)
language plpgsql security definer set search_path=''
as $$
begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Admin access required'; end if;
  return query
  select 'service_provider_application'::text,p.user_id,p.user_id,p.business_name,u.email::text,
    'Service Provider Registration'::text,concat_ws(' · ',p.primary_service,p.town,p.county),null::numeric,
    p.application_status,coalesce(p.submitted_at,p.created_at),to_jsonb(p)
  from public.service_provider_accounts p left join auth.users u on u.id=p.user_id
  where p.application_status in ('submitted','under_review','changes_requested')
  union all
  select 'service_listing'::text,s.id,s.provider_id,p.business_name,u.email::text,s.service_name,
    concat_ws(' · ',coalesce(s.category_name,p.primary_service),p.town,p.county),s.price_from_kes,
    s.approval_status,coalesce(s.submitted_at,s.created_at),
    to_jsonb(s)||jsonb_build_object('provider_name',p.business_name,'provider_primary_service',p.primary_service,'provider_phone',p.phone)
  from public.service_provider_services s
  join public.service_provider_accounts p on p.user_id=s.provider_id
  left join auth.users u on u.id=s.provider_id
  where s.approval_status in ('pending','under_review','changes_requested')
  order by submitted_at desc nulls last;
end;
$$;

create or replace function public.admin_review_service_provider_application(p_record_id uuid,p_decision text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_before jsonb; v_after jsonb; v_business_id text; v_title text; v_message text;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('approve','reject','under_review','changes_requested') then raise exception 'Unsupported provider decision'; end if;
  if p_decision in ('reject','changes_requested') and char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'A clear reason is required'; end if;

  select to_jsonb(p),p.business_id_document_path into v_before,v_business_id
  from public.service_provider_accounts p where p.user_id=p_record_id for update;
  if v_before is null then raise exception 'Service Provider application not found'; end if;
  if p_decision='approve' and nullif(btrim(coalesce(v_business_id,'')),'') is null then
    raise exception 'Business ID or identification document is required before approval';
  end if;

  update public.service_provider_accounts set
    application_status=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected'
      when 'changes_requested' then 'changes_requested' else 'under_review' end,
    approved_at=case when p_decision='approve' then now() else null end,
    approved_by=case when p_decision='approve' then (select auth.uid()) else null end,
    admin_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now()
  where user_id=p_record_id and application_status in ('submitted','under_review');
  if not found then raise exception 'Service Provider application has already been reviewed'; end if;

  select to_jsonb(p) into v_after from public.service_provider_accounts p where p.user_id=p_record_id;
  v_title:=case p_decision when 'approve' then 'Service Provider application approved'
    when 'changes_requested' then 'Service Provider application needs correction'
    when 'reject' then 'Service Provider application not approved' else 'Service Provider application under review' end;
  v_message:=case p_decision when 'approve' then 'Your Service Provider account is approved. You can now add services from the Partner Portal.'
    when 'changes_requested' then 'LEOGO Admin requested corrections to your Service Provider application. Open the Partner Portal, update the form and resubmit.'
    when 'reject' then 'Your Service Provider application was not approved. Review the Admin note in the Partner Portal.'
    else 'LEOGO Admin is reviewing your Service Provider application.' end;

  insert into public.partner_notifications(user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata)
  values (p_record_id,'service_provider','provider_application_'||p_decision,v_title,
    case when nullif(btrim(coalesce(p_notes,'')),'') is null then v_message else v_message||' Admin note: '||btrim(p_notes) end,
    'service_provider_application',p_record_id,'provider-profile',jsonb_build_object('decision',p_decision));

  perform private.write_admin_audit('approval.service_provider_application.'||p_decision,'service_provider_application',
    p_record_id::text,v_before,v_after,jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''))
  );
  return jsonb_build_object('ok',true,'kind','service_provider_application','record_id',p_record_id,'decision',p_decision);
end;
$$;

create or replace function public.admin_review_service_listing(p_record_id uuid,p_decision text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_before jsonb; v_after jsonb; v_provider uuid; v_service_name text;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('approve','reject','under_review','changes_requested') then raise exception 'Unsupported service decision'; end if;
  if p_decision in ('reject','changes_requested') and char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'A clear reason is required'; end if;

  select to_jsonb(s),s.provider_id,s.service_name into v_before,v_provider,v_service_name
  from public.service_provider_services s where s.id=p_record_id for update;
  if v_before is null then raise exception 'Service listing not found'; end if;

  update public.service_provider_services set
    approval_status=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected'
      when 'changes_requested' then 'changes_requested' else 'under_review' end,
    approved_at=case when p_decision='approve' then now() else null end,
    approved_by=case when p_decision='approve' then (select auth.uid()) else null end,
    admin_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now()
  where id=p_record_id and approval_status in ('pending','under_review');
  if not found then raise exception 'Service listing has already been reviewed'; end if;

  select to_jsonb(s) into v_after from public.service_provider_services s where s.id=p_record_id;
  insert into public.partner_notifications(user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata)
  values (
    v_provider,'service_provider','service_listing_'||p_decision,
    case p_decision when 'approve' then 'Service approved' when 'changes_requested' then 'Service needs correction'
      when 'reject' then 'Service not approved' else 'Service under review' end,
    case p_decision when 'approve' then v_service_name||' has been approved by LEOGO Admin.'
      when 'changes_requested' then v_service_name||' needs correction before approval.'
      when 'reject' then v_service_name||' was not approved.'
      else v_service_name||' is currently under Admin review.' end
      || case when nullif(btrim(coalesce(p_notes,'')),'') is null then '' else ' Admin note: '||btrim(p_notes) end,
    'service_listing',p_record_id,'provider-services',jsonb_build_object('decision',p_decision)
  );
  perform private.write_admin_audit('approval.service_listing.'||p_decision,'service_listing',p_record_id::text,
    v_before,v_after,jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''))
  );
  return jsonb_build_object('ok',true,'kind','service_listing','record_id',p_record_id,'decision',p_decision);
end;
$$;

create or replace function public.admin_list_service_providers()
returns table(
  user_id uuid,email text,business_name text,owner_name text,phone text,primary_service text,service_category text,
  experience_years integer,county text,sub_county text,town text,location_details text,availability_status text,
  application_status text,submitted_at timestamptz,approved_at timestamptz,admin_notes text,
  service_count bigint,approved_service_count bigint,created_at timestamptz
)
language plpgsql security definer set search_path=''
as $$
begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Admin access required'; end if;
  return query
  select p.user_id,u.email::text,p.business_name,p.owner_name,p.phone,p.primary_service,p.service_category,p.experience_years,
    p.county,p.sub_county,p.town,p.location_details,p.availability_status,p.application_status,p.submitted_at,p.approved_at,
    p.admin_notes,count(s.id)::bigint,count(s.id) filter(where s.approval_status='approved')::bigint,p.created_at
  from public.service_provider_accounts p
  left join auth.users u on u.id=p.user_id
  left join public.service_provider_services s on s.provider_id=p.user_id
  group by p.user_id,u.email,p.business_name,p.owner_name,p.phone,p.primary_service,p.service_category,p.experience_years,
    p.county,p.sub_county,p.town,p.location_details,p.availability_status,p.application_status,p.submitted_at,p.approved_at,
    p.admin_notes,p.created_at
  order by p.created_at desc;
end;
$$;

revoke all on function public.service_provider_get_own_account() from public,anon;
revoke all on function public.submit_service_provider_application(text,text,text,text,text,text,integer,text,text,text,text,text,text,text,text,text,text,text[]) from public,anon;
revoke all on function public.service_provider_list_own_services() from public,anon;
revoke all on function public.service_provider_save_service(uuid,text,text,text,text,numeric,numeric,text,text,text,boolean) from public,anon;
revoke all on function public.service_provider_delete_service(uuid) from public,anon;
revoke all on function public.admin_list_service_provider_approvals() from public,anon;
revoke all on function public.admin_review_service_provider_application(uuid,text,text) from public,anon;
revoke all on function public.admin_review_service_listing(uuid,text,text) from public,anon;
revoke all on function public.admin_list_service_providers() from public,anon;

grant execute on function public.service_provider_get_own_account() to authenticated;
grant execute on function public.submit_service_provider_application(text,text,text,text,text,text,integer,text,text,text,text,text,text,text,text,text,text,text[]) to authenticated;
grant execute on function public.service_provider_list_own_services() to authenticated;
grant execute on function public.service_provider_save_service(uuid,text,text,text,text,numeric,numeric,text,text,text,boolean) to authenticated;
grant execute on function public.service_provider_delete_service(uuid) to authenticated;
grant execute on function public.admin_list_service_provider_approvals() to authenticated;
grant execute on function public.admin_review_service_provider_application(uuid,text,text) to authenticated;
grant execute on function public.admin_review_service_listing(uuid,text,text) to authenticated;
grant execute on function public.admin_list_service_providers() to authenticated;
 then raise exception 'A valid Kenyan phone number is required'; end if;
  if char_length(btrim(coalesce(p_primary_service,'')))<2 then raise exception 'Primary service is required'; end if;
  if p_experience_years is not null and (p_experience_years<0 or p_experience_years>80) then raise exception 'Experience years must be between 0 and 80'; end if;
  if nullif(btrim(coalesce(p_business_id_document_path,'')),'') is null then raise exception 'Business ID or identification document is required'; end if;

  select c.name into v_county_name from public.kenya_counties c where c.code=p_county_code and c.is_active;
  if v_county_name is null then raise exception 'Choose a valid Kenyan county'; end if;
  select s.name into v_subcounty_name from public.kenya_subcounties s
    where s.code=p_sub_county_code and s.county_code=p_county_code and s.is_active;
  if v_subcounty_name is null then raise exception 'Choose a valid sub-county for the selected county'; end if;

  select application_status into v_existing from public.service_provider_accounts where user_id=v_uid;
  if v_existing is not null and v_existing not in ('draft','changes_requested','rejected') then
    raise exception 'Service Provider application is already locked for review';
  end if;

  insert into public.service_provider_accounts(
    user_id,business_name,owner_name,id_number,phone,primary_service,service_category,experience_years,
    county,sub_county,county_code,sub_county_code,town,location_details,business_description,service_area_notes,
    business_id_document_path,business_licence_path,registration_certificate_path,professional_licence_path,other_permit_paths,
    application_status,submitted_at,approved_at,approved_by,admin_notes,updated_at
  ) values (
    v_uid,btrim(p_business_name),btrim(p_owner_name),upper(btrim(p_id_number)),btrim(p_phone),btrim(p_primary_service),
    nullif(btrim(coalesce(p_service_category,'')),''),p_experience_years,
    v_county_name,v_subcounty_name,p_county_code,p_sub_county_code,btrim(p_town),btrim(p_location_details),
    nullif(btrim(coalesce(p_business_description,'')),''),nullif(btrim(coalesce(p_service_area_notes,'')),''),
    p_business_id_document_path,nullif(btrim(coalesce(p_business_licence_path,'')),''),
    nullif(btrim(coalesce(p_registration_certificate_path,'')),''),
    nullif(btrim(coalesce(p_professional_licence_path,'')),''),
    coalesce(p_other_permit_paths,'{}'),'submitted',now(),null,null,null,now()
  )
  on conflict(user_id) do update set
    business_name=excluded.business_name,owner_name=excluded.owner_name,id_number=excluded.id_number,phone=excluded.phone,
    primary_service=excluded.primary_service,service_category=excluded.service_category,experience_years=excluded.experience_years,
    county=excluded.county,sub_county=excluded.sub_county,county_code=excluded.county_code,sub_county_code=excluded.sub_county_code,
    town=excluded.town,location_details=excluded.location_details,business_description=excluded.business_description,
    service_area_notes=excluded.service_area_notes,business_id_document_path=excluded.business_id_document_path,
    business_licence_path=excluded.business_licence_path,registration_certificate_path=excluded.registration_certificate_path,
    professional_licence_path=excluded.professional_licence_path,other_permit_paths=excluded.other_permit_paths,
    application_status='submitted',submitted_at=now(),approved_at=null,approved_by=null,admin_notes=null,updated_at=now()
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.service_provider_list_own_services()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_rows jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc),'[]'::jsonb) into v_rows
  from public.service_provider_services s where s.provider_id=v_uid;
  return v_rows;
end;
$$;

create or replace function public.service_provider_save_service(
  p_service_id uuid,p_service_name text,p_category_name text,p_description text,p_pricing_model text,
  p_price_from_kes numeric,p_price_to_kes numeric,p_unit_label text,p_service_area text,p_availability_notes text,
  p_is_available boolean default true
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_status text; v_id uuid; v_row jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select application_status into v_status from public.service_provider_accounts where user_id=v_uid;
  if v_status is distinct from 'approved' then raise exception 'Your Service Provider account must be approved before adding services'; end if;
  if char_length(btrim(coalesce(p_service_name,'')))<2 then raise exception 'Service name is required'; end if;
  if p_pricing_model not in ('fixed','from','hourly','quote') then raise exception 'Choose a valid pricing model'; end if;
  if p_price_from_kes is not null and p_price_from_kes<0 then raise exception 'Price cannot be negative'; end if;
  if p_price_to_kes is not null and p_price_to_kes<0 then raise exception 'Price cannot be negative'; end if;
  if p_price_from_kes is not null and p_price_to_kes is not null and p_price_to_kes<p_price_from_kes then
    raise exception 'Maximum price cannot be lower than minimum price';
  end if;

  if p_service_id is null then
    insert into public.service_provider_services(
      provider_id,service_name,category_name,description,pricing_model,price_from_kes,price_to_kes,unit_label,
      service_area,availability_notes,is_available,approval_status,admin_notes,submitted_at,updated_at
    ) values (
      v_uid,btrim(p_service_name),nullif(btrim(coalesce(p_category_name,'')),''),
      nullif(btrim(coalesce(p_description,'')),''),p_pricing_model,p_price_from_kes,p_price_to_kes,
      nullif(btrim(coalesce(p_unit_label,'')),''),nullif(btrim(coalesce(p_service_area,'')),''),
      nullif(btrim(coalesce(p_availability_notes,'')),''),coalesce(p_is_available,true),'pending',null,now(),now()
    ) returning id into v_id;
  else
    update public.service_provider_services set
      service_name=btrim(p_service_name),category_name=nullif(btrim(coalesce(p_category_name,'')),''),
      description=nullif(btrim(coalesce(p_description,'')),''),pricing_model=p_pricing_model,
      price_from_kes=p_price_from_kes,price_to_kes=p_price_to_kes,unit_label=nullif(btrim(coalesce(p_unit_label,'')),''),
      service_area=nullif(btrim(coalesce(p_service_area,'')),''),availability_notes=nullif(btrim(coalesce(p_availability_notes,'')),''),
      is_available=coalesce(p_is_available,true),approval_status='pending',admin_notes=null,submitted_at=now(),
      approved_at=null,approved_by=null,updated_at=now()
    where id=p_service_id and provider_id=v_uid returning id into v_id;
    if v_id is null then raise exception 'Service listing not found'; end if;
  end if;
  select to_jsonb(s) into v_row from public.service_provider_services s where s.id=v_id;
  return v_row;
end;
$$;

create or replace function public.service_provider_delete_service(p_service_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid());
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  delete from public.service_provider_services where id=p_service_id and provider_id=v_uid;
  return found;
end;
$$;

create or replace function public.admin_list_service_provider_approvals()
returns table(
  kind text,record_id uuid,applicant_id uuid,applicant_name text,applicant_email text,title text,subtitle text,
  amount_kes numeric,status text,submitted_at timestamptz,payload jsonb
)
language plpgsql security definer set search_path=''
as $$
begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Admin access required'; end if;
  return query
  select 'service_provider_application'::text,p.user_id,p.user_id,p.business_name,u.email::text,
    'Service Provider Registration'::text,concat_ws(' · ',p.primary_service,p.town,p.county),null::numeric,
    p.application_status,coalesce(p.submitted_at,p.created_at),to_jsonb(p)
  from public.service_provider_accounts p left join auth.users u on u.id=p.user_id
  where p.application_status in ('submitted','under_review','changes_requested')
  union all
  select 'service_listing'::text,s.id,s.provider_id,p.business_name,u.email::text,s.service_name,
    concat_ws(' · ',coalesce(s.category_name,p.primary_service),p.town,p.county),s.price_from_kes,
    s.approval_status,coalesce(s.submitted_at,s.created_at),
    to_jsonb(s)||jsonb_build_object('provider_name',p.business_name,'provider_primary_service',p.primary_service,'provider_phone',p.phone)
  from public.service_provider_services s
  join public.service_provider_accounts p on p.user_id=s.provider_id
  left join auth.users u on u.id=s.provider_id
  where s.approval_status in ('pending','under_review','changes_requested')
  order by submitted_at desc nulls last;
end;
$$;

create or replace function public.admin_review_service_provider_application(p_record_id uuid,p_decision text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_before jsonb; v_after jsonb; v_business_id text; v_title text; v_message text;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('approve','reject','under_review','changes_requested') then raise exception 'Unsupported provider decision'; end if;
  if p_decision in ('reject','changes_requested') and char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'A clear reason is required'; end if;

  select to_jsonb(p),p.business_id_document_path into v_before,v_business_id
  from public.service_provider_accounts p where p.user_id=p_record_id for update;
  if v_before is null then raise exception 'Service Provider application not found'; end if;
  if p_decision='approve' and nullif(btrim(coalesce(v_business_id,'')),'') is null then
    raise exception 'Business ID or identification document is required before approval';
  end if;

  update public.service_provider_accounts set
    application_status=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected'
      when 'changes_requested' then 'changes_requested' else 'under_review' end,
    approved_at=case when p_decision='approve' then now() else null end,
    approved_by=case when p_decision='approve' then (select auth.uid()) else null end,
    admin_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now()
  where user_id=p_record_id and application_status in ('submitted','under_review');
  if not found then raise exception 'Service Provider application has already been reviewed'; end if;

  select to_jsonb(p) into v_after from public.service_provider_accounts p where p.user_id=p_record_id;
  v_title:=case p_decision when 'approve' then 'Service Provider application approved'
    when 'changes_requested' then 'Service Provider application needs correction'
    when 'reject' then 'Service Provider application not approved' else 'Service Provider application under review' end;
  v_message:=case p_decision when 'approve' then 'Your Service Provider account is approved. You can now add services from the Partner Portal.'
    when 'changes_requested' then 'LEOGO Admin requested corrections to your Service Provider application. Open the Partner Portal, update the form and resubmit.'
    when 'reject' then 'Your Service Provider application was not approved. Review the Admin note in the Partner Portal.'
    else 'LEOGO Admin is reviewing your Service Provider application.' end;

  insert into public.partner_notifications(user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata)
  values (p_record_id,'service_provider','provider_application_'||p_decision,v_title,
    case when nullif(btrim(coalesce(p_notes,'')),'') is null then v_message else v_message||' Admin note: '||btrim(p_notes) end,
    'service_provider_application',p_record_id,'provider-profile',jsonb_build_object('decision',p_decision));

  perform private.write_admin_audit('approval.service_provider_application.'||p_decision,'service_provider_application',
    p_record_id::text,v_before,v_after,jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''))
  );
  return jsonb_build_object('ok',true,'kind','service_provider_application','record_id',p_record_id,'decision',p_decision);
end;
$$;

create or replace function public.admin_review_service_listing(p_record_id uuid,p_decision text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_before jsonb; v_after jsonb; v_provider uuid; v_service_name text;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('approve','reject','under_review','changes_requested') then raise exception 'Unsupported service decision'; end if;
  if p_decision in ('reject','changes_requested') and char_length(btrim(coalesce(p_notes,'')))<3 then raise exception 'A clear reason is required'; end if;

  select to_jsonb(s),s.provider_id,s.service_name into v_before,v_provider,v_service_name
  from public.service_provider_services s where s.id=p_record_id for update;
  if v_before is null then raise exception 'Service listing not found'; end if;

  update public.service_provider_services set
    approval_status=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected'
      when 'changes_requested' then 'changes_requested' else 'under_review' end,
    approved_at=case when p_decision='approve' then now() else null end,
    approved_by=case when p_decision='approve' then (select auth.uid()) else null end,
    admin_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now()
  where id=p_record_id and approval_status in ('pending','under_review');
  if not found then raise exception 'Service listing has already been reviewed'; end if;

  select to_jsonb(s) into v_after from public.service_provider_services s where s.id=p_record_id;
  insert into public.partner_notifications(user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata)
  values (
    v_provider,'service_provider','service_listing_'||p_decision,
    case p_decision when 'approve' then 'Service approved' when 'changes_requested' then 'Service needs correction'
      when 'reject' then 'Service not approved' else 'Service under review' end,
    case p_decision when 'approve' then v_service_name||' has been approved by LEOGO Admin.'
      when 'changes_requested' then v_service_name||' needs correction before approval.'
      when 'reject' then v_service_name||' was not approved.'
      else v_service_name||' is currently under Admin review.' end
      || case when nullif(btrim(coalesce(p_notes,'')),'') is null then '' else ' Admin note: '||btrim(p_notes) end,
    'service_listing',p_record_id,'provider-services',jsonb_build_object('decision',p_decision)
  );
  perform private.write_admin_audit('approval.service_listing.'||p_decision,'service_listing',p_record_id::text,
    v_before,v_after,jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''))
  );
  return jsonb_build_object('ok',true,'kind','service_listing','record_id',p_record_id,'decision',p_decision);
end;
$$;

create or replace function public.admin_list_service_providers()
returns table(
  user_id uuid,email text,business_name text,owner_name text,phone text,primary_service text,service_category text,
  experience_years integer,county text,sub_county text,town text,location_details text,availability_status text,
  application_status text,submitted_at timestamptz,approved_at timestamptz,admin_notes text,
  service_count bigint,approved_service_count bigint,created_at timestamptz
)
language plpgsql security definer set search_path=''
as $$
begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Admin access required'; end if;
  return query
  select p.user_id,u.email::text,p.business_name,p.owner_name,p.phone,p.primary_service,p.service_category,p.experience_years,
    p.county,p.sub_county,p.town,p.location_details,p.availability_status,p.application_status,p.submitted_at,p.approved_at,
    p.admin_notes,count(s.id)::bigint,count(s.id) filter(where s.approval_status='approved')::bigint,p.created_at
  from public.service_provider_accounts p
  left join auth.users u on u.id=p.user_id
  left join public.service_provider_services s on s.provider_id=p.user_id
  group by p.user_id,u.email,p.business_name,p.owner_name,p.phone,p.primary_service,p.service_category,p.experience_years,
    p.county,p.sub_county,p.town,p.location_details,p.availability_status,p.application_status,p.submitted_at,p.approved_at,
    p.admin_notes,p.created_at
  order by p.created_at desc;
end;
$$;

revoke all on function public.service_provider_get_own_account() from public,anon;
revoke all on function public.submit_service_provider_application(text,text,text,text,text,text,integer,text,text,text,text,text,text,text,text,text,text,text[]) from public,anon;
revoke all on function public.service_provider_list_own_services() from public,anon;
revoke all on function public.service_provider_save_service(uuid,text,text,text,text,numeric,numeric,text,text,text,boolean) from public,anon;
revoke all on function public.service_provider_delete_service(uuid) from public,anon;
revoke all on function public.admin_list_service_provider_approvals() from public,anon;
revoke all on function public.admin_review_service_provider_application(uuid,text,text) from public,anon;
revoke all on function public.admin_review_service_listing(uuid,text,text) from public,anon;
revoke all on function public.admin_list_service_providers() from public,anon;

grant execute on function public.service_provider_get_own_account() to authenticated;
grant execute on function public.submit_service_provider_application(text,text,text,text,text,text,integer,text,text,text,text,text,text,text,text,text,text,text[]) to authenticated;
grant execute on function public.service_provider_list_own_services() to authenticated;
grant execute on function public.service_provider_save_service(uuid,text,text,text,text,numeric,numeric,text,text,text,boolean) to authenticated;
grant execute on function public.service_provider_delete_service(uuid) to authenticated;
grant execute on function public.admin_list_service_provider_approvals() to authenticated;
grant execute on function public.admin_review_service_provider_application(uuid,text,text) to authenticated;
grant execute on function public.admin_review_service_listing(uuid,text,text) to authenticated;
grant execute on function public.admin_list_service_providers() to authenticated;
