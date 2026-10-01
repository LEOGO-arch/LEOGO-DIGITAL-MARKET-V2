-- Customer Feedback & Testimonies V1
-- Customers submit signed-in feedback/testimonies. Admin moderation is required
-- before any entry can appear publicly on the Customer Front.

create table if not exists public.customer_feedback_testimonials(
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null check(entry_type in ('feedback','testimonial')),
  display_name text not null check(char_length(display_name) between 2 and 80),
  rating smallint not null check(rating between 1 and 5),
  headline text,
  message text not null check(char_length(message) between 10 and 1500),
  moderation_status text not null default 'submitted' check(moderation_status in ('submitted','approved','rejected')),
  admin_notes text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.customer_feedback_testimonials enable row level security;

create unique index if not exists customer_feedback_one_pending_uidx
  on public.customer_feedback_testimonials(customer_id)
  where moderation_status='submitted';

create index if not exists customer_feedback_public_idx
  on public.customer_feedback_testimonials(moderation_status,published_at desc);

create or replace function public.customer_submit_feedback_testimonial(
  p_entry_type text,
  p_rating integer,
  p_headline text,
  p_message text,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_id uuid;
  v_name text:=btrim(coalesce(p_display_name,''));
  v_message text:=btrim(coalesce(p_message,''));
  v_headline text:=nullif(btrim(coalesce(p_headline,'')),'');
begin
  if v_uid is null then raise exception 'Sign in before sharing feedback or a testimonial'; end if;
  if not exists(select 1 from public.customer_profiles p where p.user_id=v_uid) then
    raise exception 'Complete your customer profile before sharing your experience';
  end if;
  if p_entry_type not in ('feedback','testimonial') then
    raise exception 'Choose Feedback or Testimonial';
  end if;
  if p_rating is null or p_rating<1 or p_rating>5 then
    raise exception 'Choose a rating from 1 to 5 stars';
  end if;
  if char_length(v_name)<2 or char_length(v_name)>80 then
    raise exception 'Enter a public display name between 2 and 80 characters';
  end if;
  if v_headline is not null and char_length(v_headline)>120 then
    raise exception 'Headline must be 120 characters or fewer';
  end if;
  if char_length(v_message)<10 or char_length(v_message)>1500 then
    raise exception 'Write between 10 and 1500 characters';
  end if;
  if exists(
    select 1
    from public.customer_feedback_testimonials f
    where f.customer_id=v_uid and f.moderation_status='submitted'
  ) then
    raise exception 'You already have feedback awaiting Admin review';
  end if;

  insert into public.customer_feedback_testimonials(
    customer_id,entry_type,display_name,rating,headline,message
  )
  values(v_uid,p_entry_type,v_name,p_rating,v_headline,v_message)
  returning id into v_id;

  return jsonb_build_object(
    'ok',true,
    'entry_id',v_id,
    'moderation_status','submitted',
    'message','Thank you. Your submission has been sent to LEOGO Admin for approval.'
  );
exception
  when unique_violation then
    raise exception 'You already have feedback awaiting Admin review';
end
$function$;

create or replace function public.customer_list_own_feedback_testimonials()
returns table(
  entry_id uuid,
  entry_type text,
  display_name text,
  rating smallint,
  headline text,
  message text,
  moderation_status text,
  admin_notes text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  published_at timestamptz
)
language sql
security definer
set search_path=''
as $function$
  select
    f.id,f.entry_type,f.display_name,f.rating,f.headline,f.message,
    f.moderation_status,f.admin_notes,f.submitted_at,f.reviewed_at,f.published_at
  from public.customer_feedback_testimonials f
  where f.customer_id=(select auth.uid())
  order by f.submitted_at desc
  limit 20;
$function$;

create or replace function public.public_list_customer_feedback_testimonials(p_limit integer default 30)
returns table(
  entry_id uuid,
  entry_type text,
  display_name text,
  rating smallint,
  headline text,
  message text,
  published_at timestamptz
)
language sql
security definer
set search_path=''
as $function$
  select f.id,f.entry_type,f.display_name,f.rating,f.headline,f.message,f.published_at
  from public.customer_feedback_testimonials f
  where f.moderation_status='approved'
    and f.published_at is not null
  order by f.published_at desc,f.submitted_at desc
  limit least(greatest(coalesce(p_limit,30),1),100);
$function$;

create or replace function public.admin_list_customer_feedback_testimonials()
returns table(
  entry_id uuid,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  entry_type text,
  display_name text,
  rating smallint,
  headline text,
  message text,
  moderation_status text,
  admin_notes text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  published_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not (
    private.is_leogo_admin('customers.read')
    or private.is_leogo_admin('approvals.read')
  ) then
    raise exception 'Customer or approval permission required';
  end if;

  return query
  select
    f.id,
    f.customer_id,
    p.full_name,
    p.phone,
    f.entry_type,
    f.display_name,
    f.rating,
    f.headline,
    f.message,
    f.moderation_status,
    f.admin_notes,
    f.submitted_at,
    f.reviewed_at,
    f.published_at
  from public.customer_feedback_testimonials f
  left join public.customer_profiles p on p.user_id=f.customer_id
  order by
    case f.moderation_status when 'submitted' then 0 when 'approved' then 1 else 2 end,
    f.submitted_at desc;
end
$function$;

create or replace function public.admin_moderate_customer_feedback_testimonial(
  p_entry_id uuid,
  p_action text,
  p_admin_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row public.customer_feedback_testimonials%rowtype;
  v_before jsonb;
  v_note text:=nullif(btrim(coalesce(p_admin_notes,'')),'');
begin
  if not private.is_leogo_admin('approvals.manage') then
    raise exception 'Approval management permission required';
  end if;
  if p_action not in ('approved','rejected') then
    raise exception 'Choose approved or rejected';
  end if;
  if p_action='rejected' and char_length(coalesce(v_note,''))<3 then
    raise exception 'Add a clear rejection reason';
  end if;

  select * into v_row
  from public.customer_feedback_testimonials
  where id=p_entry_id
  for update;
  if not found then raise exception 'Feedback or testimonial not found'; end if;

  v_before:=to_jsonb(v_row);

  update public.customer_feedback_testimonials
  set moderation_status=p_action,
      admin_notes=v_note,
      reviewed_at=now(),
      reviewed_by=(select auth.uid()),
      published_at=case when p_action='approved' then coalesce(published_at,now()) else null end,
      updated_at=now()
  where id=p_entry_id
  returning * into v_row;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_row.customer_id,
    'profile',
    case when p_action='approved'
      then case when v_row.entry_type='testimonial' then 'Testimonial approved' else 'Feedback approved' end
      else case when v_row.entry_type='testimonial' then 'Testimonial needs attention' else 'Feedback needs attention' end
    end,
    case when p_action='approved'
      then 'Your '||v_row.entry_type||' was approved by LEOGO Admin and is now visible under Feedback & Testimonies.'
      else 'Your '||v_row.entry_type||' was not published. '||coalesce(v_row.admin_notes,'Please review it before trying again.')
    end,
    'customer_feedback_testimonial',
    v_row.id,
    'customer_feedback_'||p_action,
    'home',
    jsonb_build_object(
      'entry_id',v_row.id,
      'entry_type',v_row.entry_type,
      'moderation_status',p_action
    )
  )
  on conflict(user_id,source_type,source_id,event_key)
  where source_id is not null
  do update set
    title=excluded.title,
    message=excluded.message,
    metadata=excluded.metadata,
    read_at=null,
    created_at=now();

  perform private.write_admin_audit(
    'customer.feedback.'||p_action,
    'customer_feedback_testimonial',
    v_row.id::text,
    v_before,
    to_jsonb(v_row),
    jsonb_build_object('entry_type',v_row.entry_type,'customer_id',v_row.customer_id)
  );

  return jsonb_build_object(
    'ok',true,
    'entry_id',v_row.id,
    'moderation_status',v_row.moderation_status
  );
end
$function$;

revoke all on table public.customer_feedback_testimonials from anon,authenticated;
revoke execute on function public.customer_submit_feedback_testimonial(text,integer,text,text,text) from public,anon;
grant execute on function public.customer_submit_feedback_testimonial(text,integer,text,text,text) to authenticated;

revoke execute on function public.customer_list_own_feedback_testimonials() from public,anon;
grant execute on function public.customer_list_own_feedback_testimonials() to authenticated;

revoke execute on function public.public_list_customer_feedback_testimonials(integer) from public;
grant execute on function public.public_list_customer_feedback_testimonials(integer) to anon,authenticated;

revoke execute on function public.admin_list_customer_feedback_testimonials() from public,anon,authenticated;
grant execute on function public.admin_list_customer_feedback_testimonials() to authenticated;

revoke execute on function public.admin_moderate_customer_feedback_testimonial(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_moderate_customer_feedback_testimonial(uuid,text,text) to authenticated;
