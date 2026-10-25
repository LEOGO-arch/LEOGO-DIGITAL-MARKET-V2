-- Customer advertisement requests flow into the existing Admin Advertisements module.
create table if not exists public.advertisement_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requester_name text not null check (char_length(requester_name) between 2 and 120),
  requester_phone text not null check (char_length(requester_phone) between 7 and 40),
  request_details text not null check (char_length(request_details) between 10 and 500),
  status text not null default 'pending'
    check (status in ('pending','in_review','contacted','approved','rejected')),
  admin_notes text check (admin_notes is null or char_length(admin_notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

create index if not exists advertisement_requests_created_at_idx
  on public.advertisement_requests(created_at desc);
create index if not exists advertisement_requests_status_created_at_idx
  on public.advertisement_requests(status, created_at desc);

alter table public.advertisement_requests enable row level security;
revoke all on table public.advertisement_requests from public, anon, authenticated;

create or replace function public.customer_submit_advertisement_request(
  p_requester_name text,
  p_requester_phone text,
  p_request_details text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_name text := nullif(btrim(p_requester_name), '');
  v_phone text := nullif(btrim(p_requester_phone), '');
  v_details text := nullif(btrim(p_request_details), '');
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Please log in before submitting an advertisement request';
  end if;
  if v_name is null or char_length(v_name) not between 2 and 120 then
    raise exception 'Name must be between 2 and 120 characters';
  end if;
  if v_phone is null or char_length(v_phone) not between 7 and 40
     or v_phone !~ '^[0-9+() .-]+$' then
    raise exception 'Enter a valid phone number';
  end if;
  if v_details is null or char_length(v_details) not between 10 and 500 then
    raise exception 'Advertisement details must be between 10 and 500 characters';
  end if;

  insert into public.advertisement_requests(user_id,requester_name,requester_phone,request_details)
  values (v_user_id,v_name,v_phone,v_details)
  returning id into v_id;

  return v_id;
end
$function$;

create or replace function public.admin_list_advertisement_requests()
returns table (
  id uuid,
  requester_name text,
  requester_phone text,
  request_details text,
  status text,
  admin_notes text,
  created_at timestamptz,
  updated_at timestamptz,
  reviewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if not private.is_leogo_admin('settings.manage') then
    raise exception 'Admin access required';
  end if;

  return query
  select r.id,r.requester_name,r.requester_phone,r.request_details,r.status,
         r.admin_notes,r.created_at,r.updated_at,r.reviewed_at
  from public.advertisement_requests r
  order by r.created_at desc
  limit 100;
end
$function$;

create or replace function public.admin_update_advertisement_request(
  p_request_id uuid,
  p_status text,
  p_admin_notes text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_status text := lower(btrim(coalesce(p_status,'')));
  v_notes text := nullif(btrim(p_admin_notes),'');
begin
  if not private.is_leogo_admin('settings.manage') then
    raise exception 'Admin access required';
  end if;
  if v_status not in ('in_review','contacted','approved','rejected') then
    raise exception 'Choose a valid review status';
  end if;
  if v_notes is not null and char_length(v_notes) > 1000 then
    raise exception 'Admin notes must be 1000 characters or fewer';
  end if;

  update public.advertisement_requests
  set status=v_status,
      admin_notes=v_notes,
      updated_at=now(),
      reviewed_at=now(),
      reviewed_by=auth.uid()
  where id=p_request_id;

  if not found then
    raise exception 'Advertisement request not found';
  end if;
end
$function$;

revoke all on function public.customer_submit_advertisement_request(text,text,text) from public,anon,authenticated;
grant execute on function public.customer_submit_advertisement_request(text,text,text) to authenticated;
revoke all on function public.admin_list_advertisement_requests() from public,anon,authenticated;
grant execute on function public.admin_list_advertisement_requests() to authenticated;
revoke all on function public.admin_update_advertisement_request(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_update_advertisement_request(uuid,text,text) to authenticated;
