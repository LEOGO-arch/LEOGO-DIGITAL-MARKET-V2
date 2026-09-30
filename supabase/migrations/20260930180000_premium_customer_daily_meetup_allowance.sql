-- Premium Customers receive one free accepted meetup per rolling 24 hours.
-- Further requests reserve an Admin-confirmed paid credit; rejection restores it.

alter table public.partner_subscription_settings
  add column if not exists customer_extra_meetup_amount_kes integer
  check (customer_extra_meetup_amount_kes is null or customer_extra_meetup_amount_kes >= 0);

update public.partner_subscription_settings
set customer_extra_meetup_amount_kes=coalesce(customer_extra_meetup_amount_kes,200)
where partner_type='premium';

create table if not exists public.premium_customer_meetup_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  quantity integer not null default 1 check (quantity between 1 and 100),
  unit_amount_kes integer not null check (unit_amount_kes >= 0),
  amount_kes integer generated always as (quantity*unit_amount_kes) stored,
  payment_reference text not null check (char_length(btrim(payment_reference)) between 4 and 80),
  payment_status text not null default 'pending' check (payment_status in ('pending','confirmed','rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  admin_notes text
);
create unique index if not exists premium_customer_meetup_payment_ref_uidx on public.premium_customer_meetup_payments(lower(btrim(payment_reference)));
create index if not exists premium_customer_meetup_payment_user_idx on public.premium_customer_meetup_payments(user_id,payment_status,submitted_at desc);
create index if not exists premium_customer_meetup_payment_reviewer_idx on public.premium_customer_meetup_payments(reviewed_by);

create table if not exists public.premium_customer_meetup_credits (
  payment_id uuid primary key references public.premium_customer_meetup_payments(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  purchased_quantity integer not null check (purchased_quantity>0),
  remaining_quantity integer not null check (remaining_quantity between 0 and purchased_quantity),
  activated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists premium_customer_meetup_credit_user_idx on public.premium_customer_meetup_credits(user_id);
create index if not exists premium_customer_meetup_credit_available_idx on public.premium_customer_meetup_credits(user_id,activated_at) where remaining_quantity>0;

alter table public.premium_customer_meetup_payments enable row level security;
alter table public.premium_customer_meetup_credits enable row level security;
revoke all on public.premium_customer_meetup_payments,public.premium_customer_meetup_credits from anon,authenticated;
grant all on public.premium_customer_meetup_payments,public.premium_customer_meetup_credits to service_role;

alter table public.premium_meetup_requests add column if not exists customer_access_source text not null default 'free' check (customer_access_source in ('free','paid'));
alter table public.premium_meetup_requests add column if not exists customer_credit_payment_id uuid references public.premium_customer_meetup_payments(id) on delete restrict;
create index if not exists premium_meetup_customer_allowance_idx on public.premium_meetup_requests(customer_id,status,responded_at desc,submitted_at desc);
create index if not exists premium_meetup_customer_credit_idx on public.premium_meetup_requests(customer_credit_payment_id);

create or replace function public.premium_customer_get_meetup_billing_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_amount integer; v_remaining integer:=0; v_latest jsonb; v_last_accepted timestamptz; v_destination jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select customer_extra_meetup_amount_kes into v_amount from public.partner_subscription_settings where partner_type='premium';
  select coalesce(sum(remaining_quantity),0) into v_remaining from public.premium_customer_meetup_credits where user_id=v_uid;
  select to_jsonb(p) into v_latest from public.premium_customer_meetup_payments p where p.user_id=v_uid order by p.submitted_at desc limit 1;
  select max(responded_at) into v_last_accepted from public.premium_meetup_requests where customer_id=v_uid and status='accepted';
  select jsonb_build_object('display_name',p.display_name,'account_type',p.account_type,'business_name',p.business_name,'account_name',p.account_name,'till_number',p.till_number,'paybill_number',p.paybill_number,'account_number',p.account_number,'bank_name',p.bank_name,'branch',p.branch,'instructions',p.instructions)
  into v_destination from public.payment_account_assignments a join public.payment_accounts p on p.id=a.account_id
  where a.function_code='premium_payments' and p.status='active' limit 1;
  return jsonb_build_object('unit_amount_kes',coalesce(v_amount,200),'credits',v_remaining,'latest_payment',v_latest,
    'last_accepted_at',v_last_accepted,'next_free_at',case when v_last_accepted is null then null else v_last_accepted+interval '24 hours' end,
    'payment_destination',v_destination);
end; $$;

create or replace function public.premium_customer_submit_extra_meetup_payment(p_payment_reference text,p_quantity integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_amount integer; v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if p_quantity not between 1 and 100 then raise exception 'Choose between 1 and 100 extra meetups'; end if;
  if not exists(select 1 from public.premium_customers where user_id=v_uid and application_status='approved') then raise exception 'Approved Premium Customer account required'; end if;
  if not private.premium_has_active_membership(v_uid) then raise exception 'An active Premium subscription is required'; end if;
  select customer_extra_meetup_amount_kes into v_amount from public.partner_subscription_settings where partner_type='premium';
  insert into public.premium_customer_meetup_payments(user_id,quantity,unit_amount_kes,payment_reference)
  values(v_uid,p_quantity,coalesce(v_amount,200),btrim(p_payment_reference)) returning id into v_id;
  return jsonb_build_object('ok',true,'payment_id',v_id,'amount_kes',coalesce(v_amount,200)*p_quantity,'status','pending');
exception when unique_violation then raise exception 'This payment reference has already been submitted'; end; $$;

create or replace function public.admin_list_premium_customer_meetup_approvals()
returns table(kind text,record_id uuid,applicant_id uuid,applicant_name text,applicant_email text,title text,subtitle text,amount_kes numeric,status text,submitted_at timestamptz,payload jsonb)
language plpgsql security definer set search_path='' as $$ begin
  if not private.is_leogo_admin('approvals.read') then raise exception 'Admin access required'; end if;
  return query select 'premium_customer_meetup_payment'::text,p.id,p.user_id,coalesce(d.real_name,u.email::text,'Premium Customer'),u.email::text,
    'Premium Customer extra meetup'::text,p.quantity||' meetup credit(s) · Ref '||p.payment_reference,p.amount_kes::numeric,p.payment_status,p.submitted_at,to_jsonb(p)
  from public.premium_customer_meetup_payments p left join public.premium_customer_private_details d on d.user_id=p.user_id
  left join auth.users u on u.id=p.user_id where p.payment_status='pending' order by p.submitted_at desc;
end; $$;

create or replace function public.admin_review_premium_customer_meetup_payment(p_payment_id uuid,p_decision text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_payment public.premium_customer_meetup_payments%rowtype; v_before jsonb; v_after jsonb;
begin
  if not private.is_leogo_admin('approvals.manage') then raise exception 'Approval permission required'; end if;
  if p_decision not in ('approve','reject') then raise exception 'Choose approve or reject'; end if;
  select * into v_payment from public.premium_customer_meetup_payments where id=p_payment_id for update;
  if not found then raise exception 'Meetup payment not found'; end if;
  if v_payment.payment_status<>'pending' then raise exception 'Payment has already been reviewed'; end if;
  v_before:=to_jsonb(v_payment);
  update public.premium_customer_meetup_payments set payment_status=case when p_decision='approve' then 'confirmed' else 'rejected' end,
    reviewed_at=now(),reviewed_by=auth.uid(),admin_notes=nullif(btrim(coalesce(p_notes,'')),'') where id=p_payment_id returning * into v_payment;
  if p_decision='approve' then
    insert into public.premium_customer_meetup_credits(payment_id,user_id,purchased_quantity,remaining_quantity)
    values(v_payment.id,v_payment.user_id,v_payment.quantity,v_payment.quantity);
  end if;
  v_after:=to_jsonb(v_payment);
  perform private.write_admin_audit('approval.premium_customer_meetup.'||p_decision,'premium_customer_meetup_payment',p_payment_id::text,v_before,v_after,jsonb_build_object('notes',p_notes));
  return jsonb_build_object('ok',true,'payment_id',p_payment_id,'status',v_payment.payment_status);
end; $$;

drop function if exists public.admin_save_partner_subscription_setting(text,integer,integer,integer);
create or replace function public.admin_save_partner_subscription_setting(p_partner_type text,p_monthly_amount_kes integer,p_yearly_amount_kes integer,p_extra_acceptance_amount_kes integer default null,p_customer_extra_meetup_amount_kes integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_before jsonb; v_after jsonb;
begin
  if not private.is_leogo_admin('fees.manage') and not private.is_leogo_admin('settings.manage') then raise exception 'Fee management permission required'; end if;
  if p_monthly_amount_kes<0 or p_yearly_amount_kes<0 or coalesce(p_extra_acceptance_amount_kes,0)<0 or coalesce(p_customer_extra_meetup_amount_kes,0)<0 then raise exception 'Fees cannot be negative'; end if;
  select to_jsonb(s) into v_before from public.partner_subscription_settings s where partner_type=p_partner_type for update;
  update public.partner_subscription_settings set monthly_amount_kes=p_monthly_amount_kes,yearly_amount_kes=p_yearly_amount_kes,
    extra_acceptance_amount_kes=case when p_partner_type='premium' then p_extra_acceptance_amount_kes else null end,
    customer_extra_meetup_amount_kes=case when p_partner_type='premium' then p_customer_extra_meetup_amount_kes else null end,
    updated_by=auth.uid(),updated_at=now() where partner_type=p_partner_type returning to_jsonb(partner_subscription_settings.*) into v_after;
  if v_after is null then raise exception 'Unsupported partner type'; end if;
  perform private.write_admin_audit('settings.partner_subscription.update','partner_subscription_setting',p_partner_type,v_before,v_after,'{}'::jsonb);
  return v_after;
end; $$;

create or replace function public.premium_customer_request_meetup(p_profile_user_id uuid,p_message text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_request public.premium_meetup_requests%rowtype; v_profile_name text; v_source text:='free'; v_credit uuid; v_amount integer; v_free_in_use boolean:=false;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.premium_customers where user_id=v_uid and application_status='approved') then raise exception 'Approved Premium Customer account required'; end if;
  if not private.premium_has_active_membership(v_uid) then raise exception 'An active Premium subscription is required to send meetup requests'; end if;
  if p_profile_user_id=v_uid then raise exception 'You cannot send a meetup request to your own profile'; end if;
  select display_name into v_profile_name from public.premium_profiles where user_id=p_profile_user_id and application_status='approved' and is_available=true and private.partner_has_active_subscription(user_id,'premium');
  if v_profile_name is null then raise exception 'This Premium Profile is not currently available'; end if;
  if char_length(btrim(coalesce(p_message,'')))>500 then raise exception 'Request message is too long'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text,55201));
  select * into v_request from public.premium_meetup_requests where profile_user_id=p_profile_user_id and customer_id=v_uid for update;
  if found and v_request.status in ('accepted','submitted') then return jsonb_build_object('ok',true,'request_id',v_request.id,'status',v_request.status,'access_source',v_request.customer_access_source); end if;
  select exists(select 1 from public.premium_meetup_requests r where r.customer_id=v_uid and r.customer_access_source='free' and ((r.status='submitted') or (r.status='accepted' and r.responded_at>now()-interval '24 hours'))) into v_free_in_use;
  if v_free_in_use then
    select payment_id into v_credit from public.premium_customer_meetup_credits where user_id=v_uid and remaining_quantity>0 order by activated_at,payment_id for update skip locked limit 1;
    if v_credit is null then
      select customer_extra_meetup_amount_kes into v_amount from public.partner_subscription_settings where partner_type='premium';
      raise exception 'Your Premium subscription includes one accepted meetup per 24 hours. Pay KSh % for an extra meetup and wait for Admin confirmation.',coalesce(v_amount,200);
    end if;
    update public.premium_customer_meetup_credits set remaining_quantity=remaining_quantity-1,updated_at=now() where payment_id=v_credit;
    v_source:='paid';
  end if;
  insert into public.premium_meetup_requests(profile_user_id,customer_id,customer_message,status,submitted_at,responded_at,updated_at,customer_access_source,customer_credit_payment_id)
  values(p_profile_user_id,v_uid,nullif(btrim(coalesce(p_message,'')),''),'submitted',now(),null,now(),v_source,v_credit)
  on conflict(profile_user_id,customer_id) do update set customer_message=excluded.customer_message,status='submitted',profile_response=null,submitted_at=now(),responded_at=null,updated_at=now(),customer_access_source=excluded.customer_access_source,customer_credit_payment_id=excluded.customer_credit_payment_id
  returning * into v_request;
  perform private.notify_partner(p_profile_user_id,'premium','premium_meetup_request','New Premium meetup request','An active Premium Customer sent you a meetup request. Open Meetup Requests to review it.','premium_meetup_request',v_request.id,'premium-requests',jsonb_build_object('request_id',v_request.id,'customer_id',v_uid));
  return jsonb_build_object('ok',true,'request_id',v_request.id,'status',v_request.status,'access_source',v_source);
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
    if v_last is null or v_last<=now()-interval '24 hours' then v_source:='free'; else
      select payment_id into v_credit from public.premium_acceptance_credits where user_id=v_uid and remaining_quantity>0 order by activated_at,payment_id for update skip locked limit 1;
      if v_credit is null then raise exception 'Your free acceptance is available again at %. Buy an extra acceptance and wait for Admin confirmation to accept now.',to_char(v_last+interval '24 hours','DD Mon YYYY HH24:MI TZ'); end if;
      update public.premium_acceptance_credits set remaining_quantity=remaining_quantity-1,updated_at=now() where payment_id=v_credit; v_source:='paid';
    end if;
  elsif v_request.customer_access_source='paid' and v_request.customer_credit_payment_id is not null then
    update public.premium_customer_meetup_credits set remaining_quantity=least(purchased_quantity,remaining_quantity+1),updated_at=now() where payment_id=v_request.customer_credit_payment_id;
  end if;
  v_status:=case when p_action='accept' then 'accepted' else 'rejected' end;
  update public.premium_meetup_requests set status=v_status,profile_response=nullif(btrim(coalesce(p_response,'')),''),responded_at=now(),updated_at=now() where id=v_request.id returning * into v_request;
  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(v_request.customer_id,'premium',case when v_status='accepted' then 'Premium meetup request accepted' else 'Premium meetup request not accepted' end,
    case when v_status='accepted' then v_profile_name||' accepted your Premium meetup request. Their contact is now available while your Premium plan is active.' else v_profile_name||' did not accept your Premium meetup request. Any paid extra-meetup credit reserved for this request has been returned.' end,
    'premium_meetup_request',v_request.id,'premium_meetup_'||v_status,'premiumaccess',jsonb_build_object('request_id',v_request.id,'profile_user_id',v_uid,'status',v_status));
  return jsonb_build_object('ok',true,'request_id',v_request.id,'status',v_status,'acceptance_source',v_source);
end; $$;

revoke all on function public.premium_customer_get_meetup_billing_status(),public.premium_customer_submit_extra_meetup_payment(text,integer),public.admin_list_premium_customer_meetup_approvals(),public.admin_review_premium_customer_meetup_payment(uuid,text,text),public.admin_save_partner_subscription_setting(text,integer,integer,integer,integer) from public,anon;
grant execute on function public.premium_customer_get_meetup_billing_status(),public.premium_customer_submit_extra_meetup_payment(text,integer) to authenticated;
grant execute on function public.admin_list_premium_customer_meetup_approvals(),public.admin_review_premium_customer_meetup_payment(uuid,text,text),public.admin_save_partner_subscription_setting(text,integer,integer,integer,integer) to authenticated;
