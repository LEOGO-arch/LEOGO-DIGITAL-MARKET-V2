-- Partner subscriptions and Premium Partner acceptance credits.
-- Prices are snapshotted on payment rows so later Admin changes never rewrite history.

create table if not exists public.partner_subscription_settings (
  partner_type text primary key check (partner_type in ('premium','seller','service_provider','cyber','accommodation','transport')),
  monthly_amount_kes integer not null check (monthly_amount_kes >= 0),
  yearly_amount_kes integer not null check (yearly_amount_kes >= 0),
  extra_acceptance_amount_kes integer check (extra_acceptance_amount_kes is null or extra_acceptance_amount_kes >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.partner_subscription_settings(partner_type,monthly_amount_kes,yearly_amount_kes,extra_acceptance_amount_kes)
values
  ('premium',700,6000,100),
  ('seller',500,5400,null),
  ('service_provider',500,5400,null),
  ('cyber',500,5400,null),
  ('accommodation',500,5400,null),
  ('transport',500,5400,null)
on conflict (partner_type) do nothing;

create table if not exists public.partner_billing_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  partner_type text not null check (partner_type in ('premium','seller','service_provider','cyber','accommodation','transport')),
  payment_kind text not null check (payment_kind in ('subscription','premium_extra_acceptance')),
  billing_period text check (billing_period in ('monthly','yearly') or billing_period is null),
  quantity integer not null default 1 check (quantity between 1 and 100),
  unit_amount_kes integer not null check (unit_amount_kes >= 0),
  amount_kes integer generated always as (quantity * unit_amount_kes) stored,
  payment_reference text not null check (char_length(btrim(payment_reference)) between 4 and 80),
  payment_status text not null default 'pending' check (payment_status in ('pending','confirmed','rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  admin_notes text,
  created_at timestamptz not null default now(),
  check (
    (payment_kind='subscription' and billing_period is not null and quantity=1)
    or (payment_kind='premium_extra_acceptance' and partner_type='premium' and billing_period is null)
  )
);

create unique index if not exists partner_billing_payment_reference_uidx
  on public.partner_billing_payments(lower(btrim(payment_reference)));
create index if not exists partner_billing_user_status_idx
  on public.partner_billing_payments(user_id,partner_type,payment_status,submitted_at desc);

create table if not exists public.partner_subscriptions (
  user_id uuid not null references auth.users(id) on delete restrict,
  partner_type text not null check (partner_type in ('premium','seller','service_provider','cyber','accommodation','transport')),
  last_payment_id uuid not null references public.partner_billing_payments(id) on delete restrict,
  subscription_status text not null default 'active' check (subscription_status in ('active','cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key(user_id,partner_type),
  check (ends_at > starts_at)
);

create table if not exists public.premium_acceptance_credits (
  payment_id uuid primary key references public.partner_billing_payments(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  purchased_quantity integer not null check (purchased_quantity > 0),
  remaining_quantity integer not null check (remaining_quantity between 0 and purchased_quantity),
  activated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists premium_acceptance_credit_available_idx
  on public.premium_acceptance_credits(user_id,activated_at) where remaining_quantity > 0;

alter table public.partner_subscription_settings enable row level security;
alter table public.partner_billing_payments enable row level security;
alter table public.partner_subscriptions enable row level security;
alter table public.premium_acceptance_credits enable row level security;
revoke all on public.partner_subscription_settings,public.partner_billing_payments,public.partner_subscriptions,public.premium_acceptance_credits from anon,authenticated;
grant all on public.partner_subscription_settings,public.partner_billing_payments,public.partner_subscriptions,public.premium_acceptance_credits to service_role;

create or replace function private.partner_account_exists(p_user_id uuid,p_partner_type text)
returns boolean language sql stable security definer set search_path='' as $$
  select case p_partner_type
    when 'premium' then exists(select 1 from public.premium_profiles where user_id=p_user_id)
    when 'seller' then exists(select 1 from public.seller_accounts where user_id=p_user_id)
    when 'service_provider' then exists(select 1 from public.service_provider_accounts where user_id=p_user_id)
    when 'cyber' then exists(select 1 from public.cyber_provider_accounts where user_id=p_user_id)
    when 'accommodation' then exists(select 1 from public.accommodation_hosts where user_id=p_user_id)
    when 'transport' then exists(select 1 from public.transport_provider_accounts where user_id=p_user_id)
    else false end;
$$;

create or replace function private.partner_has_active_subscription(p_user_id uuid,p_partner_type text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.partner_subscriptions s where s.user_id=p_user_id and s.partner_type=p_partner_type and s.subscription_status='active' and s.ends_at>now());
$$;

create or replace function public.partner_get_billing_status(p_partner_type text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_settings public.partner_subscription_settings%rowtype; v_subscription public.partner_subscriptions%rowtype; v_payment jsonb; v_destination jsonb; v_remaining integer:=0; v_last_accept timestamptz;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if p_partner_type not in ('premium','seller','service_provider','cyber','accommodation','transport') then raise exception 'Unsupported partner type'; end if;
  select * into v_settings from public.partner_subscription_settings where partner_type=p_partner_type;
  select * into v_subscription from public.partner_subscriptions where user_id=v_uid and partner_type=p_partner_type;
  select to_jsonb(p) into v_payment from public.partner_billing_payments p where p.user_id=v_uid and p.partner_type=p_partner_type order by p.submitted_at desc limit 1;
  select jsonb_build_object('display_name',p.display_name,'account_type',p.account_type,'business_name',p.business_name,'account_name',p.account_name,'till_number',p.till_number,'paybill_number',p.paybill_number,'account_number',p.account_number,'bank_name',p.bank_name,'branch',p.branch,'instructions',p.instructions)
  into v_destination from public.payment_account_assignments a join public.payment_accounts p on p.id=a.account_id
  where a.function_code in ('premium_payments','marketplace_orders') and p.status='active'
  order by case a.function_code when 'premium_payments' then 0 else 1 end limit 1;
  if p_partner_type='premium' then
    select coalesce(sum(remaining_quantity),0) into v_remaining from public.premium_acceptance_credits where user_id=v_uid;
    select max(responded_at) into v_last_accept from public.premium_meetup_requests where profile_user_id=v_uid and status='accepted';
  end if;
  return jsonb_build_object(
    'partner_type',p_partner_type,'monthly_amount_kes',v_settings.monthly_amount_kes,'yearly_amount_kes',v_settings.yearly_amount_kes,
    'extra_acceptance_amount_kes',v_settings.extra_acceptance_amount_kes,'active',coalesce(v_subscription.subscription_status='active' and v_subscription.ends_at>now(),false),
    'starts_at',v_subscription.starts_at,'ends_at',v_subscription.ends_at,'latest_payment',v_payment,'payment_destination',v_destination,
    'acceptance_credits',v_remaining,'last_free_acceptance_at',v_last_accept,
    'next_free_acceptance_at',case when v_last_accept is null then null else v_last_accept+interval '24 hours' end
  );
end; $$;

create or replace function public.partner_submit_subscription_payment(p_partner_type text,p_billing_period text,p_payment_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_amount integer; v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if p_billing_period not in ('monthly','yearly') then raise exception 'Choose monthly or yearly billing'; end if;
  if not private.partner_account_exists(v_uid,p_partner_type) then raise exception 'Create this Partner profile before submitting its subscription payment'; end if;
  select case p_billing_period when 'monthly' then monthly_amount_kes else yearly_amount_kes end into v_amount from public.partner_subscription_settings where partner_type=p_partner_type;
  if v_amount is null then raise exception 'Partner subscription settings are unavailable'; end if;
  insert into public.partner_billing_payments(user_id,partner_type,payment_kind,billing_period,unit_amount_kes,payment_reference)
  values(v_uid,p_partner_type,'subscription',p_billing_period,v_amount,btrim(p_payment_reference)) returning id into v_id;
  return jsonb_build_object('ok',true,'payment_id',v_id,'amount_kes',v_amount,'payment_status','pending');
exception when unique_violation then raise exception 'This payment reference has already been submitted'; end; $$;

create or replace function public.premium_submit_extra_acceptance_payment(p_payment_reference text,p_quantity integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_amount integer; v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if p_quantity not between 1 and 100 then raise exception 'Choose between 1 and 100 extra acceptances'; end if;
  if not exists(select 1 from public.premium_profiles where user_id=v_uid and application_status='approved') then raise exception 'Approved Premium Partner profile required'; end if;
  select extra_acceptance_amount_kes into v_amount from public.partner_subscription_settings where partner_type='premium';
  insert into public.partner_billing_payments(user_id,partner_type,payment_kind,quantity,unit_amount_kes,payment_reference)
  values(v_uid,'premium','premium_extra_acceptance',p_quantity,v_amount,btrim(p_payment_reference)) returning id into v_id;
  return jsonb_build_object('ok',true,'payment_id',v_id,'amount_kes',v_amount*p_quantity,'payment_status','pending');
exception when unique_violation then raise exception 'This payment reference has already been submitted'; end; $$;

create or replace function public.admin_list_partner_subscription_settings()
returns setof public.partner_subscription_settings language plpgsql security definer set search_path='' as $$ begin
  if not private.is_leogo_admin('fees.manage') and not private.is_leogo_admin('settings.manage') then raise exception 'Fee management permission required'; end if;
  return query select * from public.partner_subscription_settings order by case partner_type when 'premium' then 0 else 1 end,partner_type;
end; $$;

create or replace function public.admin_save_partner_subscription_setting(p_partner_type text,p_monthly_amount_kes integer,p_yearly_amount_kes integer,p_extra_acceptance_amount_kes integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_before jsonb; v_after jsonb;
begin
  if not private.is_leogo_admin('fees.manage') and not private.is_leogo_admin('settings.manage') then raise exception 'Fee management permission required'; end if;
  if p_monthly_amount_kes<0 or p_yearly_amount_kes<0 or coalesce(p_extra_acceptance_amount_kes,0)<0 then raise exception 'Fees cannot be negative'; end if;
  select to_jsonb(s) into v_before from public.partner_subscription_settings s where partner_type=p_partner_type for update;
  update public.partner_subscription_settings set monthly_amount_kes=p_monthly_amount_kes,yearly_amount_kes=p_yearly_amount_kes,
    extra_acceptance_amount_kes=case when p_partner_type='premium' then p_extra_acceptance_amount_kes else null end,updated_by=auth.uid(),updated_at=now()
  where partner_type=p_partner_type returning to_jsonb(partner_subscription_settings.*) into v_after;
  if v_after is null then raise exception 'Unsupported partner type'; end if;
  perform private.write_admin_audit('settings.partner_subscription.update','partner_subscription_setting',p_partner_type,v_before,v_after,'{}'::jsonb);
  return v_after;
end; $$;

create or replace function public.admin_list_partner_billing_approvals()
returns table(kind text,record_id uuid,applicant_id uuid,applicant_name text,applicant_email text,title text,subtitle text,amount_kes numeric,status text,submitted_at timestamptz,payload jsonb)
language plpgsql security definer set search_path='' as $$ begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Admin access required'; end if;
  return query select case when b.payment_kind='subscription' then 'partner_subscription_payment' else 'premium_extra_acceptance_payment' end,
    b.id,b.user_id,coalesce(u.raw_user_meta_data->>'full_name',u.email::text,'Partner'),u.email::text,
    case when b.payment_kind='subscription' then initcap(replace(b.partner_type,'_',' '))||' subscription' else 'Premium extra acceptance' end,
    case when b.payment_kind='subscription' then initcap(b.billing_period)||' plan · ' else b.quantity||' acceptance(s) · ' end||'Ref '||b.payment_reference,
    b.amount_kes::numeric,b.payment_status,b.submitted_at,to_jsonb(b)
  from public.partner_billing_payments b left join auth.users u on u.id=b.user_id where b.payment_status='pending' order by b.submitted_at desc;
end; $$;

create or replace function public.admin_review_partner_billing_payment(p_payment_id uuid,p_decision text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_payment public.partner_billing_payments%rowtype; v_start timestamptz; v_end timestamptz; v_before jsonb; v_after jsonb;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('approve','reject') then raise exception 'Choose approve or reject'; end if;
  select * into v_payment from public.partner_billing_payments where id=p_payment_id for update;
  if not found then raise exception 'Partner payment not found'; end if;
  if v_payment.payment_status<>'pending' then raise exception 'Payment has already been reviewed'; end if;
  v_before:=to_jsonb(v_payment);
  update public.partner_billing_payments set payment_status=case when p_decision='approve' then 'confirmed' else 'rejected' end,
    reviewed_at=now(),reviewed_by=auth.uid(),admin_notes=nullif(btrim(coalesce(p_notes,'')),'') where id=p_payment_id returning * into v_payment;
  if p_decision='approve' and v_payment.payment_kind='subscription' then
    select greatest(now(),coalesce(s.ends_at,now())) into v_start from public.partner_subscriptions s
      where s.user_id=v_payment.user_id and s.partner_type=v_payment.partner_type and s.subscription_status='active' for update;
    v_start:=coalesce(v_start,now());
    v_end:=case when v_payment.billing_period='monthly' then v_start+interval '1 month' else v_start+interval '1 year' end;
    insert into public.partner_subscriptions(user_id,partner_type,last_payment_id,subscription_status,starts_at,ends_at)
    values(v_payment.user_id,v_payment.partner_type,v_payment.id,'active',v_start,v_end)
    on conflict(user_id,partner_type) do update set last_payment_id=excluded.last_payment_id,subscription_status='active',starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_at=now();
  elsif p_decision='approve' and v_payment.payment_kind='premium_extra_acceptance' then
    insert into public.premium_acceptance_credits(payment_id,user_id,purchased_quantity,remaining_quantity)
    values(v_payment.id,v_payment.user_id,v_payment.quantity,v_payment.quantity);
  end if;
  v_after:=to_jsonb(v_payment);
  perform private.write_admin_audit('approval.partner_billing.'||p_decision,'partner_billing_payment',p_payment_id::text,v_before,v_after,jsonb_build_object('notes',p_notes));
  return jsonb_build_object('ok',true,'payment_id',p_payment_id,'status',v_payment.payment_status);
end; $$;

create or replace function public.premium_partner_set_availability(p_available boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if coalesce(p_available,false) and not private.partner_has_active_subscription(v_uid,'premium') then raise exception 'An active Premium Partner subscription is required before going available'; end if;
  update public.premium_profiles set is_available=coalesce(p_available,false),updated_at=now() where user_id=v_uid and application_status='approved';
  if not found then raise exception 'An approved Premium Profile is required'; end if;
  return jsonb_build_object('ok',true,'is_available',coalesce(p_available,false));
end; $$;

create or replace function public.premium_partner_respond_meetup_request(p_request_id uuid,p_action text,p_response text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_request public.premium_meetup_requests%rowtype; v_profile_name text; v_status text; v_last timestamptz; v_credit uuid; v_source text;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select display_name into v_profile_name from public.premium_profiles where user_id=v_uid and application_status='approved';
  if v_profile_name is null then raise exception 'Approved Premium Profile required'; end if;
  if p_action not in ('accept','reject') then raise exception 'Choose accept or reject'; end if;
  if char_length(btrim(coalesce(p_response,'')))>500 then raise exception 'Response is too long'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text,90421));
  select * into v_request from public.premium_meetup_requests where id=p_request_id and profile_user_id=v_uid for update;
  if not found then raise exception 'Premium meetup request not found'; end if;
  if v_request.status<>'submitted' then raise exception 'This request has already been responded to'; end if;
  if p_action='accept' then
    if not private.partner_has_active_subscription(v_uid,'premium') then raise exception 'An active Premium Partner subscription is required to accept requests'; end if;
    select max(responded_at) into v_last from public.premium_meetup_requests where profile_user_id=v_uid and status='accepted';
    if v_last is null or v_last<=now()-interval '24 hours' then v_source:='free';
    else
      select payment_id into v_credit from public.premium_acceptance_credits where user_id=v_uid and remaining_quantity>0 order by activated_at,payment_id for update skip locked limit 1;
      if v_credit is null then raise exception 'Your free acceptance is available again at %. Buy an extra acceptance and wait for Admin confirmation to accept now.',to_char(v_last+interval '24 hours','DD Mon YYYY HH24:MI TZ'); end if;
      update public.premium_acceptance_credits set remaining_quantity=remaining_quantity-1,updated_at=now() where payment_id=v_credit;
      v_source:='paid';
    end if;
  end if;
  v_status:=case when p_action='accept' then 'accepted' else 'rejected' end;
  update public.premium_meetup_requests set status=v_status,profile_response=nullif(btrim(coalesce(p_response,'')),''),responded_at=now(),updated_at=now() where id=v_request.id returning * into v_request;
  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(v_request.customer_id,'premium',case when v_status='accepted' then 'Premium meetup request accepted' else 'Premium meetup request not accepted' end,
    case when v_status='accepted' then v_profile_name||' accepted your Premium meetup request. Their contact is now available while your Premium plan is active.' else v_profile_name||' did not accept your Premium meetup request.' end,
    'premium_meetup_request',v_request.id,'premium_meetup_'||v_status,'premiumaccess',jsonb_build_object('request_id',v_request.id,'profile_user_id',v_uid,'status',v_status));
  return jsonb_build_object('ok',true,'request_id',v_request.id,'status',v_status,'acceptance_source',v_source);
end; $$;

-- Hide expired Premium Partner profiles even if the previous availability flag stayed on.
create or replace function public.premium_customer_profile_directory()
returns table(profile_user_id uuid,display_name text,profile_picture_path text,general_location text,access_level text,gender text,about text,orientation text,age smallint,gallery_paths text[],request_status text,contact_phone text)
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_active boolean:=false; begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.premium_access_consents c where c.user_id=v_uid and c.age_confirmed=true and c.responsibility_confirmed=true) then raise exception 'Premium age and responsibility consent required'; end if;
  v_active:=private.premium_has_active_membership(v_uid);
  return query select p.user_id,p.display_name,p.profile_picture_path,p.general_location,case when v_active then 'full' else 'preview' end::text,p.gender,p.about,
    case when v_active then d.orientation else null end,d.age,
    case when v_active then coalesce((select array_agg(g.media_path order by g.sort_order) from public.premium_profile_gallery g where g.user_id=p.user_id),array[]::text[]) else array[]::text[] end,
    case when v_active then r.status else null end,case when v_active and r.status='accepted' then i.phone else null end
  from public.premium_profiles p left join public.premium_profile_details d on d.user_id=p.user_id
  left join public.premium_meetup_requests r on r.profile_user_id=p.user_id and r.customer_id=v_uid
  left join public.premium_identity_details i on i.user_id=p.user_id
  where p.application_status='approved' and p.is_available=true and private.partner_has_active_subscription(p.user_id,'premium')
  order by p.approved_at desc nulls last,p.updated_at desc;
end; $$;

revoke all on function public.partner_get_billing_status(text),public.partner_submit_subscription_payment(text,text,text),public.premium_submit_extra_acceptance_payment(text,integer),public.admin_list_partner_subscription_settings(),public.admin_save_partner_subscription_setting(text,integer,integer,integer),public.admin_list_partner_billing_approvals(),public.admin_review_partner_billing_payment(uuid,text,text) from public,anon;
grant execute on function public.partner_get_billing_status(text),public.partner_submit_subscription_payment(text,text,text),public.premium_submit_extra_acceptance_payment(text,integer) to authenticated;
grant execute on function public.admin_list_partner_subscription_settings(),public.admin_save_partner_subscription_setting(text,integer,integer,integer),public.admin_list_partner_billing_approvals(),public.admin_review_partner_billing_payment(uuid,text,text) to authenticated;
