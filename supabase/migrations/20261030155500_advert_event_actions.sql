-- LEOGO advertised event actions: independent of existing advert publishing and orders.
create table if not exists public.advert_event_actions(
 advertisement_id uuid primary key references public.advertisements(id) on delete cascade,
 allow_ticket boolean not null default false,
 ticket_price_kes numeric(12,2) not null default 0 check(ticket_price_kes>=0),
 ticket_capacity integer check(ticket_capacity between 1 and 1000000),
 allow_register boolean not null default false,
 allow_join boolean not null default false,
 registration_capacity integer check(registration_capacity between 1 and 1000000),
 form_fields jsonb not null default '[]'::jsonb,
 updated_at timestamptz not null default now(),
 constraint valid_event_fields_shape check (jsonb_typeof(form_fields)='array' and jsonb_array_length(form_fields)<=12)
);
create table if not exists public.advert_event_entries(
 id uuid primary key default gen_random_uuid(),
 advertisement_id uuid not null references public.advertisements(id) on delete cascade,
 user_id uuid not null references auth.users(id),
 action_kind text not null check(action_kind in ('ticket','register','join')),
 ticket_code text unique not null default ('LEO-'||upper(substring(replace(gen_random_uuid()::text,'-',''),1,12))),
 attendee_name text not null check(length(attendee_name) between 2 and 120),
 attendee_phone text not null check(length(attendee_phone) between 7 and 30),
 form_answers jsonb not null default '{}'::jsonb,
 payment_reference text,
 amount_due_kes numeric(12,2) not null default 0,
 status text not null check(status in ('pending_payment','submitted','confirmed','rejected')),
 admin_notes text,
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id)
);
create index if not exists advert_event_entries_advert_idx on public.advert_event_entries(advertisement_id,action_kind,status,created_at desc);
create index if not exists advert_event_entries_user_idx on public.advert_event_entries(user_id,created_at desc);
alter table public.advert_event_actions enable row level security;
alter table public.advert_event_entries enable row level security;
revoke all on public.advert_event_actions,public.advert_event_entries from anon,authenticated;
-- All reads/writes use narrow security-definer RPCs; public tables remain inaccessible.

create or replace function public.admin_save_advert_event_actions(p_advertisement_id uuid,p_config jsonb)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare f jsonb; v_fields jsonb := coalesce(p_config->'form_fields','[]'::jsonb);
v_ticket boolean := coalesce((p_config->>'allow_ticket')::boolean,false);
v_reg boolean := coalesce((p_config->>'allow_register')::boolean,false);
v_join boolean := coalesce((p_config->>'allow_join')::boolean,false);
v_price numeric := coalesce((p_config->>'ticket_price_kes')::numeric,0);
v_ticket_cap integer := nullif(p_config->>'ticket_capacity','')::integer;
v_reg_cap integer := nullif(p_config->>'registration_capacity','')::integer;
v_result jsonb;
begin
 if not private.is_leogo_admin('settings.manage') then raise exception 'Admin access required'; end if;
 if not exists(select 1 from public.advertisements where id=p_advertisement_id) then raise exception 'Advertisement not found'; end if;
 if v_price<0 or v_price>10000000 then raise exception 'Ticket price is outside the allowed range'; end if;
 if (v_ticket_cap is not null and v_ticket_cap not between 1 and 1000000)
 or (v_reg_cap is not null and v_reg_cap not between 1 and 1000000) then raise exception 'Invalid event capacity'; end if;
 if jsonb_typeof(v_fields)<>'array' or jsonb_array_length(v_fields)>12 then raise exception 'Provide up to 12 registration questions'; end if;
 for f in select value from jsonb_array_elements(v_fields) loop
  if coalesce(f->>'key','') !~ '^[a-z][a-z0-9_]{0,30}$'
    or length(coalesce(f->>'label','')) not between 2 and 100
    or f->>'type' not in ('text','number','date','select','checkbox') then
    raise exception 'Invalid registration question';
  end if;
  if f->>'type'='select' and (jsonb_typeof(f->'options')<>'array'
     or jsonb_array_length(f->'options') not between 1 and 20) then
    raise exception 'Select questions require 1 to 20 options';
  end if;
 end loop;
 if (select count(distinct x->>'key') from jsonb_array_elements(v_fields) x)<>jsonb_array_length(v_fields)
 then raise exception 'Question keys must be unique'; end if;
 insert into public.advert_event_actions(advertisement_id,allow_ticket,ticket_price_kes,ticket_capacity,
    allow_register,allow_join,registration_capacity,form_fields,updated_at)
 values(p_advertisement_id,v_ticket,v_price,v_ticket_cap,v_reg,v_join,v_reg_cap,v_fields,now())
 on conflict(advertisement_id) do update set
 allow_ticket=excluded.allow_ticket,ticket_price_kes=excluded.ticket_price_kes,ticket_capacity=excluded.ticket_capacity,
 allow_register=excluded.allow_register,allow_join=excluded.allow_join,registration_capacity=excluded.registration_capacity,
 form_fields=excluded.form_fields,updated_at=now();
 select to_jsonb(t) into v_result from public.advert_event_actions t where advertisement_id=p_advertisement_id;
 return v_result;
end $fn$;

create or replace function public.admin_list_advert_event_actions()
returns jsonb language sql stable security definer set search_path='' as $fn$
select case when private.is_leogo_admin('settings.manage') then
 coalesce((select jsonb_agg(to_jsonb(a)) from public.advert_event_actions a),'[]'::jsonb)
 else '[]'::jsonb end;
$fn$;

create or replace function public.public_get_active_advert_event_actions()
returns jsonb language sql stable security definer set search_path='' as $fn$
select coalesce((
 select jsonb_build_object('advertisement_id',a.id,'allow_ticket',c.allow_ticket,
 'ticket_price_kes',c.ticket_price_kes,'allow_register',c.allow_register,
 'allow_join',c.allow_join,'form_fields',c.form_fields)
 from public.advertisements a join public.advert_event_actions c on c.advertisement_id=a.id
 where a.status='published' and a.starts_at<=now() and a.ends_at>now()
 order by a.starts_at desc,a.created_at desc limit 1
 ),'{}'::jsonb);
$fn$;

create or replace function public.customer_submit_advert_event_entry(
 p_advertisement_id uuid,p_action_kind text,p_attendee_name text,p_attendee_phone text,
 p_form_answers jsonb default '{}'::jsonb,p_payment_reference text default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_user uuid := auth.uid(); v_actions public.advert_event_actions%rowtype;
v_advert public.advertisements%rowtype; v_field jsonb; v_answer jsonb;
v_count integer; v_entry public.advert_event_entries%rowtype;
v_name text := trim(coalesce(p_attendee_name,''));v_phone text := trim(coalesce(p_attendee_phone,''));
v_reference text := upper(trim(coalesce(p_payment_reference,'')));
begin
 if v_user is null then raise exception 'Sign in to register or request a ticket'; end if;
 if p_action_kind not in ('ticket','register','join') then raise exception 'Choose a valid event action'; end if;
 if length(v_name) not between 2 and 120 or length(v_phone) not between 7 and 30 or v_phone !~ '^[+0-9 ()-]+$'
 then raise exception 'Enter your name and a valid phone number'; end if;
 if jsonb_typeof(p_form_answers)<>'object' or length(p_form_answers::text)>6000 then raise exception 'Invalid registration answers'; end if;
 select * into v_advert from public.advertisements where id=p_advertisement_id for share;
 if not found or v_advert.status<>'published' or v_advert.starts_at>now() or v_advert.ends_at<=now()
 then raise exception 'This event is no longer open'; end if;
 select * into v_actions from public.advert_event_actions where advertisement_id=p_advertisement_id for update;
 if not found then raise exception 'Event actions unavailable'; end if;
 if (p_action_kind='ticket' and not v_actions.allow_ticket)
 or (p_action_kind='register' and not v_actions.allow_register)
 or (p_action_kind='join' and not v_actions.allow_join) then raise exception 'This action is not enabled'; end if;
 if p_action_kind='ticket' and v_actions.ticket_price_kes>0 and (length(v_reference)<>10 or v_reference !~ '^[A-Z0-9]{10}$')
 then raise exception 'Provide the 10-character M-PESA reference for your ticket payment'; end if;
 if p_action_kind='ticket' and v_actions.ticket_capacity is not null then
  select count(*) into v_count from public.advert_event_entries
   where advertisement_id=p_advertisement_id and action_kind='ticket' and status='confirmed';
  if v_count>=v_actions.ticket_capacity then raise exception 'All confirmed tickets are taken'; end if;
 end if;
 if p_action_kind<>'ticket' and v_actions.registration_capacity is not null then
  select count(*) into v_count from public.advert_event_entries
   where advertisement_id=p_advertisement_id and action_kind in ('register','join') and status in ('submitted','confirmed');
  if v_count>=v_actions.registration_capacity then raise exception 'Registration is full'; end if;
 end if;
 if p_action_kind<>'ticket' then
  if exists(select 1 from public.advert_event_entries where advertisement_id=p_advertisement_id and user_id=v_user and action_kind=p_action_kind and status in ('submitted','confirmed'))
  then raise exception 'You already registered for this event'; end if;
  for v_field in select value from jsonb_array_elements(v_actions.form_fields) loop
    v_answer:=p_form_answers->(v_field->>'key');
    if coalesce((v_field->>'required')::boolean,false) and
      (v_answer is null or v_answer='null'::jsonb or v_answer='""'::jsonb or v_answer='false'::jsonb)
    then raise exception 'Please answer: %',v_field->>'label'; end if;
    if v_answer is not null and v_answer<>'null'::jsonb and length(v_answer::text)>500
    then raise exception 'An answer is too long'; end if;
    if v_field->>'type'='select' and v_answer is not null and v_answer<>'null'::jsonb and
      not exists(select 1 from jsonb_array_elements_text(v_field->'options') opt where to_jsonb(opt)=v_answer)
    then raise exception 'Invalid option for %',v_field->>'label'; end if;
  end loop;
 end if;
 insert into public.advert_event_entries(advertisement_id,user_id,action_kind,attendee_name,attendee_phone,
    form_answers,payment_reference,amount_due_kes,status)
 values(p_advertisement_id,v_user,p_action_kind,v_name,v_phone,
  case when p_action_kind='ticket' then '{}'::jsonb else p_form_answers end,
  case when p_action_kind='ticket' then nullif(v_reference,'') else null end,
  case when p_action_kind='ticket' then v_actions.ticket_price_kes else 0 end,
  case when p_action_kind='ticket' and v_actions.ticket_price_kes>0 then 'pending_payment' else 'submitted' end)
 returning * into v_entry;
 return jsonb_build_object('ticket_code',v_entry.ticket_code,'status',v_entry.status,
   'amount_due_kes',v_entry.amount_due_kes,'action_kind',v_entry.action_kind,
   'message',case when v_entry.status='pending_payment' then 'Awaiting manual M-PESA verification by LEOGO Admin; ticket not yet confirmed'
      else 'Request submitted successfully' end);
end $fn$;

create or replace function public.admin_list_advert_event_entries()
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 if not private.is_leogo_admin('settings.manage') then raise exception 'Admin access required'; end if;
 return coalesce((select jsonb_agg(to_jsonb(e) || jsonb_build_object('advert_title',a.title) order by e.created_at desc)
 from public.advert_event_entries e join public.advertisements a on a.id=e.advertisement_id),'[]'::jsonb);
end $fn$;

create or replace function public.admin_review_advert_event_entry(p_entry_id uuid,p_approve boolean,p_notes text default null)
returns void language plpgsql security definer set search_path='' as $fn$
declare v_entry public.advert_event_entries%rowtype; v_capacity integer; v_used integer;
begin
 if not private.is_leogo_admin('settings.manage') then raise exception 'Admin access required'; end if;
 select * into v_entry from public.advert_event_entries where id=p_entry_id for update;
 if not found then raise exception 'Event entry not found'; end if;
 if v_entry.status not in ('pending_payment','submitted') then raise exception 'Entry already reviewed'; end if;
 if p_approve and v_entry.action_kind='ticket' then
  perform 1 from public.advert_event_actions where advertisement_id=v_entry.advertisement_id for update;
  select ticket_capacity into v_capacity from public.advert_event_actions where advertisement_id=v_entry.advertisement_id;
  if v_capacity is not null then
   select count(*) into v_used from public.advert_event_entries where advertisement_id=v_entry.advertisement_id and action_kind='ticket' and status='confirmed';
   if v_used>=v_capacity then raise exception 'Ticket capacity reached'; end if;
  end if;
 end if;
 update public.advert_event_entries set status=case when p_approve then 'confirmed' else 'rejected' end,
 admin_notes=left(coalesce(p_notes,''),1000),reviewed_at=now(),reviewed_by=auth.uid()
 where id=p_entry_id;
end $fn$;

revoke all on function public.admin_save_advert_event_actions(uuid,jsonb),
public.admin_list_advert_event_actions(),public.admin_list_advert_event_entries(),
public.admin_review_advert_event_entry(uuid,boolean,text),public.customer_submit_advert_event_entry(uuid,text,text,text,jsonb,text),
public.public_get_active_advert_event_actions() from public,anon;
grant execute on function public.admin_save_advert_event_actions(uuid,jsonb),
public.admin_list_advert_event_actions(),public.admin_list_advert_event_entries(),
public.admin_review_advert_event_entry(uuid,boolean,text),public.customer_submit_advert_event_entry(uuid,text,text,text,jsonb,text)
to authenticated;
grant execute on function public.public_get_active_advert_event_actions() to anon,authenticated;
