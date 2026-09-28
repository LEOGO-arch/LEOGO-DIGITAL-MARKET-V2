-- Premium Partner public profile editing and safe media replacement.
-- Old profile/gallery files are removed through the Storage API. A cleanup queue
-- preserves stale paths until the Partner Portal confirms Storage deletion.

drop policy if exists premium_profile_media_delete_own on storage.objects;
create policy premium_profile_media_delete_own
on storage.objects
for delete to authenticated
using (
  bucket_id='premium-profile-media'
  and owner_id=(select auth.uid())::text
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

create table if not exists public.premium_media_cleanup_queue (
  user_id uuid not null references auth.users(id) on delete cascade,
  media_path text not null,
  queued_at timestamptz not null default now(),
  primary key(user_id,media_path)
);
alter table public.premium_media_cleanup_queue enable row level security;
revoke all on table public.premium_media_cleanup_queue from public,anon,authenticated;

create or replace function public.premium_partner_list_media_cleanup()
returns text[]
language sql
security definer
set search_path=''
as $$
  select coalesce(array_agg(q.media_path order by q.queued_at),array[]::text[])
  from public.premium_media_cleanup_queue q
  where q.user_id=auth.uid();
$$;
revoke all on function public.premium_partner_list_media_cleanup() from public,anon;
grant execute on function public.premium_partner_list_media_cleanup() to authenticated;

create or replace function public.premium_partner_ack_media_cleanup(p_paths text[])
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then return; end if;
  delete from public.premium_media_cleanup_queue q
  where q.user_id=auth.uid()
    and q.media_path=any(coalesce(p_paths,array[]::text[]));
end;
$$;
revoke all on function public.premium_partner_ack_media_cleanup(text[]) from public,anon;
grant execute on function public.premium_partner_ack_media_cleanup(text[]) to authenticated;

create or replace function public.premium_partner_update_public_profile(
  p_display_name text,
  p_gender text,
  p_age integer,
  p_orientation text,
  p_general_location text,
  p_about text,
  p_profile_picture_path text,
  p_replace_gallery boolean default false,
  p_gallery_paths text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_existing public.premium_profiles%rowtype;
  v_old_gallery text[];
  v_new_gallery text[]:=coalesce(p_gallery_paths,array[]::text[]);
  v_path text;
  v_index integer:=0;
  v_old_paths text[]:=array[]::text[];
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  select * into v_existing
  from public.premium_profiles
  where user_id=v_uid
  for update;

  if not found or v_existing.application_status<>'approved' then
    raise exception 'An approved Premium Profile is required';
  end if;

  if char_length(btrim(coalesce(p_display_name,''))) not between 2 and 50 then
    raise exception 'Display name must be 2 to 50 characters';
  end if;
  if char_length(btrim(coalesce(p_gender,''))) not between 2 and 40 then
    raise exception 'Choose a valid gender';
  end if;
  if p_age is null or p_age<18 or p_age>100 then
    raise exception 'Age must be between 18 and 100';
  end if;
  if char_length(btrim(coalesce(p_orientation,''))) not between 2 and 60 then
    raise exception 'Choose a valid orientation';
  end if;
  if char_length(btrim(coalesce(p_general_location,''))) not between 2 and 100 then
    raise exception 'Enter your general location';
  end if;
  if char_length(btrim(coalesce(p_about,''))) not between 20 and 1000 then
    raise exception 'About must be between 20 and 1000 characters';
  end if;
  if char_length(btrim(coalesce(p_profile_picture_path,'')))<3 then
    raise exception 'Profile picture is required';
  end if;
  if p_profile_picture_path not like v_uid::text||'/%' then
    raise exception 'Invalid profile picture path';
  end if;

  if cardinality(v_new_gallery)>3 then
    raise exception 'Maximum 3 gallery photos allowed';
  end if;

  foreach v_path in array v_new_gallery loop
    if nullif(btrim(v_path),'') is not null
       and v_path not like v_uid::text||'/%' then
      raise exception 'Invalid gallery image path';
    end if;
  end loop;

  select coalesce(array_agg(g.media_path order by g.sort_order),array[]::text[])
  into v_old_gallery
  from public.premium_profile_gallery g
  where g.user_id=v_uid;

  if v_existing.profile_picture_path is distinct from btrim(p_profile_picture_path)
     and nullif(v_existing.profile_picture_path,'') is not null then
    v_old_paths:=array_append(v_old_paths,v_existing.profile_picture_path);
  end if;

  update public.premium_profiles
  set display_name=btrim(p_display_name),
      gender=btrim(p_gender),
      general_location=btrim(p_general_location),
      about=btrim(p_about),
      profile_picture_path=btrim(p_profile_picture_path),
      updated_at=now()
  where user_id=v_uid;

  update public.premium_profile_details
  set age=p_age,
      orientation=btrim(p_orientation),
      updated_at=now()
  where user_id=v_uid;

  if p_replace_gallery then
    v_old_paths:=v_old_paths||coalesce(v_old_gallery,array[]::text[]);
    delete from public.premium_profile_gallery where user_id=v_uid;

    foreach v_path in array v_new_gallery loop
      if nullif(btrim(v_path),'') is not null then
        v_index:=v_index+1;
        insert into public.premium_profile_gallery(user_id,media_path,sort_order)
        values(v_uid,btrim(v_path),v_index);
      end if;
    end loop;
  end if;

  select coalesce(array_agg(distinct x),array[]::text[])
  into v_old_paths
  from unnest(coalesce(v_old_paths,array[]::text[])) x
  where x is not null
    and x<>btrim(p_profile_picture_path)
    and not (x=any(v_new_gallery));

  insert into public.premium_media_cleanup_queue(user_id,media_path)
  select v_uid,x
  from unnest(coalesce(v_old_paths,array[]::text[])) x
  on conflict(user_id,media_path) do nothing;

  return jsonb_build_object(
    'ok',true,
    'profile',public.premium_partner_get_own_profile(),
    'old_paths_to_delete',to_jsonb(coalesce(v_old_paths,array[]::text[]))
  );
end;
$$;

revoke all on function public.premium_partner_update_public_profile(text,text,integer,text,text,text,text,boolean,text[]) from public,anon;
grant execute on function public.premium_partner_update_public_profile(text,text,integer,text,text,text,text,boolean,text[]) to authenticated;
