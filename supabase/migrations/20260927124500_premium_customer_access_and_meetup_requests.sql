-- Premium Customer access tiers and meetup request acceptance.
-- Expired/inactive Premium Customers see only profile picture, display name and general location.
-- Active subscribers receive full approved profile details/gallery.
-- Contact is released only after the Premium Profile accepts the specific customer's request.

create or replace function private.premium_has_active_membership(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.premium_memberships m
    where m.user_id=p_user_id
      and m.membership_status='active'
      and m.starts_at<=now()
      and m.ends_at>now()
  );
$$;

revoke all on function private.premium_has_active_membership(uuid) from public,anon,authenticated;

create or replace function private.current_user_has_active_premium_membership()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select private.premium_has_active_membership(auth.uid());
$$;

revoke all on function private.current_user_has_active_premium_membership() from public,anon;
grant execute on function private.current_user_has_active_premium_membership() to authenticated;

create table if not exists public.premium_meetup_requests (
  id uuid primary key default gen_random_uuid(),
  profile_user_id uuid not null references public.premium_profiles(user_id) on delete cascade,
  customer_id uuid not null references public.premium_customers(user_id) on delete cascade,
  customer_message text,
  status text not null default 'submitted'
    check (status in ('submitted','accepted','rejected','cancelled')),
  profile_response text,
  submitted_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(profile_user_id,customer_id),
  check (customer_message is null or char_length(customer_message)<=500),
  check (profile_response is null or char_length(profile_response)<=500)
);

alter table public.premium_meetup_requests enable row level security;
revoke all on table public.premium_meetup_requests from public,anon,authenticated;

drop policy if exists "premium_profiles_read_owner_or_approved_customer" on public.premium_profiles;
drop policy if exists "premium_details_read_owner_or_active_member" on public.premium_profile_details;
drop policy if exists premium_profile_gallery_read on public.premium_profile_gallery;

drop policy if exists premium_profiles_read_owner_or_admin on public.premium_profiles;
create policy premium_profiles_read_owner_or_admin
on public.premium_profiles
for select to authenticated
using (user_id=(select auth.uid()) or private.is_leogo_admin('data.read'));

drop policy if exists premium_details_read_owner_or_admin on public.premium_profile_details;
create policy premium_details_read_owner_or_admin
on public.premium_profile_details
for select to authenticated
using (user_id=(select auth.uid()) or private.is_leogo_admin('data.read'));

drop policy if exists premium_profile_gallery_read_owner_or_admin on public.premium_profile_gallery;
create policy premium_profile_gallery_read_owner_or_admin
on public.premium_profile_gallery
for select to authenticated
using (user_id=(select auth.uid()) or private.is_leogo_admin('data.read'));

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
    select 1 from public.premium_customers c
    where c.user_id=v_uid and c.application_status='approved'
  ) then
    raise exception 'Approved Premium Customer account required';
  end if;

  v_active:=private.premium_has_active_membership(v_uid);

  return query
  select
    p.user_id,p.display_name,p.profile_picture_path,p.general_location,
    case when v_active then 'full' else 'limited' end::text,
    case when v_active then p.gender else null end,
    case when v_active then p.about else null end,
    case when v_active then d.orientation else null end,
    case when v_active then d.age else null end,
    case when v_active then coalesce((
      select array_agg(g.media_path order by g.sort_order)
      from public.premium_profile_gallery g
      where g.user_id=p.user_id
    ),array[]::text[]) else array[]::text[] end,
    r.status,
    case when v_active and r.status='accepted' then i.phone else null end
  from public.premium_profiles p
  left join public.premium_profile_details d on d.user_id=p.user_id
  left join public.premium_meetup_requests r
    on r.profile_user_id=p.user_id and r.customer_id=v_uid
  left join public.premium_identity_details i on i.user_id=p.user_id
  where p.application_status='approved' and p.is_available=true
  order by p.approved_at desc nulls last,p.updated_at desc;
end;
$$;

revoke all on function public.premium_customer_profile_directory() from public,anon;
grant execute on function public.premium_customer_profile_directory() to authenticated;

create or replace function public.premium_customer_request_meetup(
  p_profile_user_id uuid,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_request public.premium_meetup_requests%rowtype;
  v_profile_name text;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(
    select 1 from public.premium_customers c
    where c.user_id=v_uid and c.application_status='approved'
  ) then
    raise exception 'Approved Premium Customer account required';
  end if;
  if not private.premium_has_active_membership(v_uid) then
    raise exception 'An active Premium subscription is required to send meetup requests';
  end if;
  if p_profile_user_id=v_uid then raise exception 'You cannot send a meetup request to your own profile'; end if;

  select p.display_name into v_profile_name
  from public.premium_profiles p
  where p.user_id=p_profile_user_id
    and p.application_status='approved'
    and p.is_available=true;
  if v_profile_name is null then raise exception 'This Premium Profile is not currently available'; end if;
  if char_length(btrim(coalesce(p_message,'')))>500 then raise exception 'Request message is too long'; end if;

  select * into v_request
  from public.premium_meetup_requests
  where profile_user_id=p_profile_user_id and customer_id=v_uid
  for update;

  if found and v_request.status='accepted' then
    return jsonb_build_object('ok',true,'request_id',v_request.id,'status','accepted');
  end if;
  if found and v_request.status='submitted' then
    return jsonb_build_object('ok',true,'request_id',v_request.id,'status','submitted');
  end if;

  insert into public.premium_meetup_requests(
    profile_user_id,customer_id,customer_message,status,submitted_at,responded_at,updated_at
  ) values(
    p_profile_user_id,v_uid,nullif(btrim(coalesce(p_message,'')),''),'submitted',now(),null,now()
  )
  on conflict(profile_user_id,customer_id) do update set
    customer_message=excluded.customer_message,status='submitted',profile_response=null,
    submitted_at=now(),responded_at=null,updated_at=now()
  returning * into v_request;

  perform private.notify_partner(
    p_profile_user_id,'premium','premium_meetup_request','New Premium meetup request',
    'An active Premium Customer sent you a meetup request. Open Meetup Requests to review it.',
    'premium_meetup_request',v_request.id,'premium-requests',
    jsonb_build_object('request_id',v_request.id,'customer_id',v_uid)
  );

  return jsonb_build_object('ok',true,'request_id',v_request.id,'status',v_request.status);
end;
$$;

revoke all on function public.premium_customer_request_meetup(uuid,text) from public,anon;
grant execute on function public.premium_customer_request_meetup(uuid,text) to authenticated;

create or replace function public.premium_partner_list_meetup_requests()
returns table(
  request_id uuid,
  customer_id uuid,
  customer_profile_picture_path text,
  customer_sex text,
  customer_age smallint,
  customer_location text,
  customer_message text,
  request_status text,
  profile_response text,
  customer_phone text,
  submitted_at timestamptz,
  responded_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(
    select 1 from public.premium_profiles p
    where p.user_id=v_uid and p.application_status='approved'
  ) then
    raise exception 'Approved Premium Profile required';
  end if;

  return query
  select r.id,r.customer_id,c.profile_picture_path,c.sex,c.age,c.location,
         r.customer_message,r.status,r.profile_response,
         case when r.status='accepted' then d.phone else null end,
         r.submitted_at,r.responded_at
  from public.premium_meetup_requests r
  join public.premium_customers c on c.user_id=r.customer_id
  left join public.premium_customer_private_details d on d.user_id=r.customer_id
  where r.profile_user_id=v_uid
  order by case r.status when 'submitted' then 0 when 'accepted' then 1 else 2 end,r.submitted_at desc;
end;
$$;

revoke all on function public.premium_partner_list_meetup_requests() from public,anon;
grant execute on function public.premium_partner_list_meetup_requests() to authenticated;

create or replace function public.premium_partner_respond_meetup_request(
  p_request_id uuid,
  p_action text,
  p_response text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_request public.premium_meetup_requests%rowtype;
  v_profile_name text;
  v_status text;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select p.display_name into v_profile_name
  from public.premium_profiles p
  where p.user_id=v_uid and p.application_status='approved';
  if v_profile_name is null then raise exception 'Approved Premium Profile required'; end if;
  if p_action not in ('accept','reject') then raise exception 'Choose accept or reject'; end if;
  if char_length(btrim(coalesce(p_response,'')))>500 then raise exception 'Response is too long'; end if;

  select * into v_request
  from public.premium_meetup_requests
  where id=p_request_id and profile_user_id=v_uid
  for update;
  if not found then raise exception 'Premium meetup request not found'; end if;
  if v_request.status<>'submitted' then raise exception 'This request has already been responded to'; end if;

  v_status:=case when p_action='accept' then 'accepted' else 'rejected' end;
  update public.premium_meetup_requests
  set status=v_status,profile_response=nullif(btrim(coalesce(p_response,'')),''),
      responded_at=now(),updated_at=now()
  where id=v_request.id
  returning * into v_request;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_request.customer_id,'premium',
    case when v_status='accepted' then 'Premium meetup request accepted' else 'Premium meetup request not accepted' end,
    case when v_status='accepted'
      then v_profile_name||' accepted your Premium meetup request. Their contact is now available while your Premium plan is active.'
      else v_profile_name||' did not accept your Premium meetup request.' end,
    'premium_meetup_request',v_request.id,'premium_meetup_'||v_status,'premiumaccess',
    jsonb_build_object('request_id',v_request.id,'profile_user_id',v_uid,'status',v_status)
  );

  return jsonb_build_object('ok',true,'request_id',v_request.id,'status',v_status);
end;
$$;

revoke all on function public.premium_partner_respond_meetup_request(uuid,text,text) from public,anon;
grant execute on function public.premium_partner_respond_meetup_request(uuid,text,text) to authenticated;

drop policy if exists premium_profile_media_select_owner_or_approved_customer on storage.objects;
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
        select 1 from public.premium_customers c
        where c.user_id=(select auth.uid()) and c.application_status='approved'
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
