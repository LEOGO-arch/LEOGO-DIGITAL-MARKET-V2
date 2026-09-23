-- LEOGO DIGITAL MARKET
-- Service Provider public profile picture + Admin-only passport photo
-- Additive migration. Does not modify Seller, marketplace order, checkout or delivery workflows.

alter table public.service_provider_accounts
  add column if not exists profile_picture_path text,
  add column if not exists passport_photo_path text;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'service-provider-public-media',
  'service-provider-public-media',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public=true,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Service provider uploads own public media" on storage.objects;
create policy "Service provider uploads own public media"
on storage.objects for insert
to authenticated
with check (
  bucket_id='service-provider-public-media'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists "Service provider reads own public media" on storage.objects;
create policy "Service provider reads own public media"
on storage.objects for select
to authenticated
using (
  bucket_id='service-provider-public-media'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists "Service provider deletes own public media" on storage.objects;
create policy "Service provider deletes own public media"
on storage.objects for delete
to authenticated
using (
  bucket_id='service-provider-public-media'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'service-provider-passport-photo',
  'service-provider-passport-photo',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Service provider uploads own passport photo" on storage.objects;
create policy "Service provider uploads own passport photo"
on storage.objects for insert
to authenticated
with check (
  bucket_id='service-provider-passport-photo'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists "Service provider deletes own passport photo" on storage.objects;
create policy "Service provider deletes own passport photo"
on storage.objects for delete
to authenticated
using (
  bucket_id='service-provider-passport-photo'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists "Admin reads service provider passport photos" on storage.objects;
create policy "Admin reads service provider passport photos"
on storage.objects for select
to authenticated
using (
  bucket_id='service-provider-passport-photo'
  and private.is_leogo_admin('approvals.read')
);

create or replace function public.service_provider_update_profile_photos(
  p_profile_picture_path text default null,
  p_passport_photo_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  update public.service_provider_accounts
  set
    profile_picture_path=case
      when nullif(btrim(coalesce(p_profile_picture_path,'')),'') is not null
        then btrim(p_profile_picture_path)
      else profile_picture_path
    end,
    passport_photo_path=case
      when nullif(btrim(coalesce(p_passport_photo_path,'')),'') is not null
        then btrim(p_passport_photo_path)
      else passport_photo_path
    end,
    updated_at=now()
  where user_id=v_uid;

  if not found then raise exception 'Service Provider account not found'; end if;

  select to_jsonb(p) into v_row
  from public.service_provider_accounts p
  where p.user_id=v_uid;

  return v_row;
end;
$$;

revoke all on function public.service_provider_update_profile_photos(text,text) from public,anon;
grant execute on function public.service_provider_update_profile_photos(text,text) to authenticated;

create or replace function public.customer_public_service_providers()
returns table(
  provider_id uuid,
  business_name text,
  primary_service text,
  service_category text,
  county text,
  sub_county text,
  town text,
  business_description text,
  service_area_notes text,
  profile_picture_path text,
  approved_service_count bigint
)
language sql
security definer
set search_path=''
as $$
  select
    p.user_id,
    p.business_name,
    p.primary_service,
    p.service_category,
    p.county,
    p.sub_county,
    p.town,
    p.business_description,
    p.service_area_notes,
    p.profile_picture_path,
    count(s.id) filter (where s.approval_status='approved' and s.is_available)::bigint
  from public.service_provider_accounts p
  left join public.service_provider_services s on s.provider_id=p.user_id
  where p.application_status='approved'
    and p.availability_status <> 'offline'
  group by
    p.user_id,p.business_name,p.primary_service,p.service_category,p.county,p.sub_county,p.town,
    p.business_description,p.service_area_notes,p.profile_picture_path,p.approved_at
  order by p.approved_at desc nulls last,p.business_name;
$$;

revoke all on function public.customer_public_service_providers() from public;
grant execute on function public.customer_public_service_providers() to anon,authenticated;
