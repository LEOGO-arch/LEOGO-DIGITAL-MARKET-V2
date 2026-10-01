
create table if not exists public.customer_looking_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requester_name text not null,
  phone text not null,
  location text not null,
  request_details text not null,
  urgency text not null default 'normal',
  budget_kes numeric(14,2),
  location_link text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  approval_status text not null default 'pending',
  admin_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  approved_at timestamptz,
  public_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_looking_requests_urgency_check check (urgency in ('normal','urgent','very_urgent')),
  constraint customer_looking_requests_approval_check check (approval_status in ('pending','under_review','approved','rejected')),
  constraint customer_looking_requests_public_status_check check (public_status in ('active','fulfilled','removed')),
  constraint customer_looking_requests_budget_check check (budget_kes is null or budget_kes > 0),
  constraint customer_looking_requests_lat_check check (latitude is null or latitude between -90 and 90),
  constraint customer_looking_requests_lng_check check (longitude is null or longitude between -180 and 180)
);

alter table public.customer_looking_requests enable row level security;
revoke all on public.customer_looking_requests from anon,authenticated;

create index if not exists customer_looking_requests_user_idx
  on public.customer_looking_requests(user_id,created_at desc);
create index if not exists customer_looking_requests_approval_idx
  on public.customer_looking_requests(approval_status,created_at desc);

create or replace function public.customer_submit_looking_request(
  p_requester_name text,
  p_phone text,
  p_location text,
  p_request_details text,
  p_urgency text,
  p_budget_kes numeric default null,
  p_location_link text default null,
  p_latitude numeric default null,
  p_longitude numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_urgency text := lower(replace(btrim(coalesce(p_urgency,'')),' ','_'));
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if char_length(btrim(coalesce(p_requester_name,''))) < 2 then raise exception 'Enter your name'; end if;
  if char_length(btrim(coalesce(p_phone,''))) < 7 then raise exception 'Enter a valid phone number'; end if;
  if char_length(btrim(coalesce(p_location,''))) < 2 then raise exception 'Enter your location'; end if;
  if char_length(btrim(coalesce(p_request_details,''))) < 3 then raise exception 'Describe what you are looking for'; end if;
  if char_length(btrim(p_request_details)) > 180 then raise exception 'Request description is too long'; end if;
  if v_urgency not in ('normal','urgent','very_urgent') then raise exception 'Choose a valid urgency'; end if;
  if p_budget_kes is not null and p_budget_kes <= 0 then raise exception 'Budget must be greater than zero'; end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then raise exception 'Invalid pinned latitude'; end if;
  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then raise exception 'Invalid pinned longitude'; end if;

  insert into public.customer_looking_requests(
    user_id,requester_name,phone,location,request_details,urgency,budget_kes,
    location_link,latitude,longitude,approval_status,public_status,created_at,updated_at
  ) values(
    v_uid,btrim(p_requester_name),btrim(p_phone),btrim(p_location),btrim(p_request_details),v_urgency,
    p_budget_kes,nullif(btrim(coalesce(p_location_link,'')),''),
    p_latitude,p_longitude,'pending','active',now(),now()
  )
  returning id into v_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_uid,'looking_request_submitted','Request submitted for approval',
    'Your request "'||left(btrim(p_request_details),90)||'" has been sent to LEOGO Admin for review.',
    'customer_looking_request',v_id,'looking_request_submitted_'||v_id::text,'dashboard',
    jsonb_build_object('request_id',v_id,'status','pending')
  );

  return jsonb_build_object('ok',true,'request_id',v_id,'approval_status','pending');
end
$function$;

revoke execute on function public.customer_submit_looking_request(text,text,text,text,text,numeric,text,numeric,numeric) from public,anon;
grant execute on function public.customer_submit_looking_request(text,text,text,text,text,numeric,text,numeric,numeric) to authenticated;

create or replace function public.customer_public_looking_requests()
returns table(
  id uuid,
  public_name text,
  request_details text,
  urgency text,
  budget_kes numeric,
  public_title text,
  approved_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path=''
as $function$
  select
    r.id,
    split_part(btrim(r.requester_name),' ',1)::text,
    r.request_details,
    r.urgency,
    r.budget_kes,
    (
      split_part(btrim(r.requester_name),' ',1)
      || ' needs '
      || btrim(r.request_details)
    )::text,
    r.approved_at,
    r.created_at
  from public.customer_looking_requests r
  where r.approval_status='approved'
    and r.public_status='active'
  order by coalesce(r.approved_at,r.created_at) desc;
$function$;

revoke execute on function public.customer_public_looking_requests() from public;
grant execute on function public.customer_public_looking_requests() to anon,authenticated;

create or replace function public.customer_list_own_looking_requests()
returns table(
  id uuid,
  request_details text,
  urgency text,
  budget_kes numeric,
  approval_status text,
  admin_notes text,
  public_status text,
  created_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz
)
language sql
security definer
set search_path=''
as $function$
  select
    r.id,r.request_details,r.urgency,r.budget_kes,r.approval_status,r.admin_notes,
    r.public_status,r.created_at,r.reviewed_at,r.approved_at
  from public.customer_looking_requests r
  where r.user_id=(select auth.uid())
  order by r.created_at desc;
$function$;

revoke execute on function public.customer_list_own_looking_requests() from public,anon;
grant execute on function public.customer_list_own_looking_requests() to authenticated;

create or replace function public.admin_list_looking_request_approvals()
returns table(
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
set search_path=''
as $function$
begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Admin access required'; end if;

  return query
  select
    'customer_looking_request'::text,
    r.id,
    r.user_id,
    r.requester_name,
    u.email::text,
    ('Looking For: '||left(r.request_details,90))::text,
    (
      replace(initcap(replace(r.urgency,'_',' ')),'Very Urgent','Very Urgent')
      || ' · Private location: ' || r.location
    )::text,
    r.budget_kes,
    r.approval_status,
    r.created_at,
    to_jsonb(r)
  from public.customer_looking_requests r
  left join auth.users u on u.id=r.user_id
  where r.approval_status in ('pending','under_review')
  order by r.created_at desc;
end
$function$;

revoke execute on function public.admin_list_looking_request_approvals() from public,anon;
grant execute on function public.admin_list_looking_request_approvals() to authenticated;

create or replace function public.admin_review_looking_request(
  p_record_id uuid,
  p_decision text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row public.customer_looking_requests%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_status text;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('approve','reject','under_review') then raise exception 'Unsupported decision'; end if;
  if p_decision='reject' and char_length(btrim(coalesce(p_notes,'')))<3 then
    raise exception 'Give a clear reason for rejection';
  end if;

  select * into v_row
  from public.customer_looking_requests
  where id=p_record_id
  for update;

  if not found then raise exception 'Customer request not found'; end if;
  if v_row.approval_status not in ('pending','under_review') then raise exception 'This request has already been reviewed'; end if;

  v_before:=to_jsonb(v_row);
  v_status:=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'under_review' end;

  update public.customer_looking_requests
  set approval_status=v_status,
      admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
      reviewed_by=(select auth.uid()),
      reviewed_at=case when p_decision in ('approve','reject') then now() else reviewed_at end,
      approved_at=case when p_decision='approve' then now() else approved_at end,
      updated_at=now()
  where id=p_record_id;

  select to_jsonb(r) into v_after
  from public.customer_looking_requests r
  where r.id=p_record_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_row.user_id,
    'looking_request_'||v_status,
    case v_status
      when 'approved' then 'Your request was approved'
      when 'rejected' then 'Your request was not approved'
      else 'Your request is under review'
    end,
    case v_status
      when 'approved' then '"'||left(v_row.request_details,100)||'" is now visible under What People Are Looking For.'
      when 'rejected' then '"'||left(v_row.request_details,100)||'" was not approved. '||coalesce(p_notes,'')
      else '"'||left(v_row.request_details,100)||'" is being reviewed by LEOGO Admin.'
    end,
    'customer_looking_request',p_record_id,
    'looking_request_'||v_status||'_'||p_record_id::text||'_'||extract(epoch from now())::bigint::text,
    'dashboard',
    jsonb_build_object('request_id',p_record_id,'status',v_status,'notes',nullif(btrim(coalesce(p_notes,'')),''))
  );

  perform private.write_admin_audit(
    'approval.customer_looking_request.'||p_decision,
    'customer_looking_request',
    p_record_id::text,
    v_before,
    v_after,
    jsonb_build_object('notes',nullif(btrim(coalesce(p_notes,'')),''))
  );

  return jsonb_build_object('ok',true,'record_id',p_record_id,'approval_status',v_status);
end
$function$;

revoke execute on function public.admin_review_looking_request(uuid,text,text) from public,anon;
grant execute on function public.admin_review_looking_request(uuid,text,text) to authenticated;
