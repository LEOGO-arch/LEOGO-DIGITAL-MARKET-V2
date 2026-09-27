-- Premium consent-based preview access.
-- Any signed-in customer who accepts the Premium 18+ and responsibility consent
-- may view approved/available profile picture, username, gender, age, About and general location.
-- Gallery, orientation and meetup requests remain subscriber-only.
-- Contact remains available only after the Premium Profile accepts the specific request.

create table if not exists public.premium_access_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  age_confirmed boolean not null default false,
  responsibility_confirmed boolean not null default false,
  consented_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.premium_access_consents enable row level security;
revoke all on table public.premium_access_consents from public,anon,authenticated;

create or replace function public.record_premium_access_consent(
  p_age_confirmed boolean,
  p_responsibility_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not coalesce(p_age_confirmed,false) or not coalesce(p_responsibility_confirmed,false) then
    raise exception 'Both Premium consent confirmations are required';
  end if;

  insert into public.premium_access_consents(
    user_id,age_confirmed,responsibility_confirmed,consented_at,updated_at
  ) values(
    v_uid,true,true,now(),now()
  )
  on conflict(user_id) do update set
    age_confirmed=true,
    responsibility_confirmed=true,
    consented_at=coalesce(public.premium_access_consents.consented_at,now()),
    updated_at=now();

  return jsonb_build_object('ok',true,'consented',true);
end;
$$;

revoke all on function public.record_premium_access_consent(boolean,boolean) from public,anon;
grant execute on function public.record_premium_access_consent(boolean,boolean) to authenticated;

create or replace function public.premium_customer_profile_directory()
returns table(
  profile_user_id uuid,
  display_name text,
  profile_picture_path text,
  general_location text,
  access_level text,
  gender text,
  about text,
  orientation text,
  age smallint,
  gallery_paths text[],
  request_status text,
  contact_phone text
)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_active boolean:=false;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  if not exists(
    select 1
    from public.premium_access_consents c
    where c.user_id=v_uid
      and c.age_confirmed=true
      and c.responsibility_confirmed=true
  ) then
    raise exception 'Premium age and responsibility consent required';
  end if;

  v_active:=private.premium_has_active_membership(v_uid);

  return query
  select
    p.user_id,
    p.display_name,
    p.profile_picture_path,
    p.general_location,
    case when v_active then 'full' else 'preview' end::text,
    p.gender,
    p.about,
    case when v_active then d.orientation else null end,
    d.age,
    case
      when v_active then coalesce((
        select array_agg(g.media_path order by g.sort_order)
        from public.premium_profile_gallery g
        where g.user_id=p.user_id
      ),array[]::text[])
      else array[]::text[]
    end,
    case when v_active then r.status else null end,
    case when v_active and r.status='accepted' then i.phone else null end
  from public.premium_profiles p
  left join public.premium_profile_details d on d.user_id=p.user_id
  left join public.premium_meetup_requests r
    on r.profile_user_id=p.user_id and r.customer_id=v_uid
  left join public.premium_identity_details i on i.user_id=p.user_id
  where p.application_status='approved'
    and p.is_available=true
  order by p.approved_at desc nulls last,p.updated_at desc;
end;
$$;

revoke all on function public.premium_customer_profile_directory() from public,anon;
grant execute on function public.premium_customer_profile_directory() to authenticated;

drop policy if exists premium_profile_media_select_scoped on storage.objects;
create policy premium_profile_media_select_scoped
on storage.objects
for select to authenticated
using (
  bucket_id='premium-profile-media'
  and (
    owner_id=((select auth.uid()))::text
    or (
      exists(
        select 1 from public.premium_access_consents c
        where c.user_id=(select auth.uid())
          and c.age_confirmed=true
          and c.responsibility_confirmed=true
      )
      and (
        exists(
          select 1 from public.premium_profiles p
          where p.application_status='approved'
            and p.is_available=true
            and p.profile_picture_path=objects.name
        )
        or (
          private.current_user_has_active_premium_membership()
          and exists(
            select 1
            from public.premium_profile_gallery g
            join public.premium_profiles p on p.user_id=g.user_id
            where p.application_status='approved'
              and p.is_available=true
              and g.media_path=objects.name
          )
        )
      )
    )
    or exists(
      select 1
      from public.premium_meetup_requests r
      join public.premium_customers c on c.user_id=r.customer_id
      where r.profile_user_id=(select auth.uid())
        and c.profile_picture_path=objects.name
    )
  )
);
