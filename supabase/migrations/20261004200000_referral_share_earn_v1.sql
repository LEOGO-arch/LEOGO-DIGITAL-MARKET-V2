-- LEOGO Share & Earn Referral Shopping Voucher V1
-- Referral rewards reuse the existing non-withdrawable LEOGO Points ledger.
-- No cash-wallet balance, Seller payout, checkout, Rider or delivery rules are changed.

create table if not exists public.customer_referral_settings(
  id smallint primary key default 1 check(id=1),
  is_enabled boolean not null default true,
  referrer_reward_kes numeric(14,2) not null default 100 check(referrer_reward_kes>=0 and referrer_reward_kes<=1000000),
  referred_welcome_reward_kes numeric(14,2) not null default 50 check(referred_welcome_reward_kes>=0 and referred_welcome_reward_kes<=1000000),
  minimum_qualifying_order_kes numeric(14,2) not null default 500 check(minimum_qualifying_order_kes>=0 and minimum_qualifying_order_kes<=100000000),
  max_rewarded_referrals_per_customer integer not null default 50 check(max_rewarded_referrals_per_customer between 1 and 100000),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.customer_referral_settings(id)
values(1)
on conflict(id) do nothing;

create table if not exists public.customer_referral_codes(
  user_id uuid primary key references auth.users(id) on delete restrict,
  referral_code text not null unique
    check(referral_code ~ '^LEO-[A-Z0-9]{8}$'),
  share_count integer not null default 0 check(share_count>=0),
  last_shared_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_referrals(
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete restrict,
  referred_user_id uuid not null unique references auth.users(id) on delete restrict,
  referral_code text not null,
  status text not null default 'pending'
    check(status in ('pending','rewarded','limit_reached')),
  qualifying_order_id uuid unique references public.marketplace_orders(id) on delete restrict,
  qualifying_order_reference text,
  qualifying_order_subtotal_kes numeric(14,2),
  referrer_reward_kes numeric(14,2) not null default 0 check(referrer_reward_kes>=0),
  referred_welcome_reward_kes numeric(14,2) not null default 0 check(referred_welcome_reward_kes>=0),
  claimed_at timestamptz not null default now(),
  qualified_at timestamptz,
  rewarded_at timestamptz,
  check(referrer_user_id<>referred_user_id)
);

create index if not exists customer_referrals_referrer_status_idx
  on public.customer_referrals(referrer_user_id,status,claimed_at desc);

create index if not exists customer_referrals_referred_status_idx
  on public.customer_referrals(referred_user_id,status,claimed_at desc);

alter table public.customer_referral_settings enable row level security;
alter table public.customer_referral_codes enable row level security;
alter table public.customer_referrals enable row level security;

revoke all on table public.customer_referral_settings from anon,authenticated;
revoke all on table public.customer_referral_codes from anon,authenticated;
revoke all on table public.customer_referrals from anon,authenticated;
grant all on table public.customer_referral_settings to service_role;
grant all on table public.customer_referral_codes to service_role;
grant all on table public.customer_referrals to service_role;

-- Referral vouchers are stored as the existing shopping_reward ledger class,
-- so they stay in LEOGO Points and remain non-withdrawable.
alter table public.wallet_shopping_rewards
  drop constraint if exists wallet_shopping_rewards_credit_source_check;

alter table public.wallet_shopping_rewards
  add constraint wallet_shopping_rewards_credit_source_check
  check(credit_source in (
    'manual_admin','automatic_delivery','referral_referrer','referral_welcome'
  ));

create or replace function private.ensure_customer_referral_code(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_code text;
begin
  if p_user_id is null then return null; end if;

  select c.referral_code into v_code
  from public.customer_referral_codes c
  where c.user_id=p_user_id;

  if v_code is not null then return v_code; end if;

  loop
    v_code:='LEO-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    begin
      insert into public.customer_referral_codes(user_id,referral_code)
      values(p_user_id,v_code)
      on conflict(user_id) do nothing;

      select c.referral_code into v_code
      from public.customer_referral_codes c
      where c.user_id=p_user_id;

      if v_code is not null then return v_code; end if;
    exception when unique_violation then
      v_code:=null;
    end;
  end loop;
end
$function$;

revoke execute on function private.ensure_customer_referral_code(uuid)
  from public,anon,authenticated;

create or replace function public.customer_get_referral_program()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_code text;
  v_settings public.customer_referral_settings%rowtype;
  v_referred public.customer_referrals%rowtype;
  v_pending bigint:=0;
  v_rewarded bigint:=0;
  v_limit bigint:=0;
  v_earned numeric:=0;
  v_can_claim boolean:=false;
begin
  if v_uid is null then
    return jsonb_build_object('success',false,'code','authentication_required');
  end if;

  v_code:=private.ensure_customer_referral_code(v_uid);
  select * into v_settings from public.customer_referral_settings where id=1;
  select * into v_referred
  from public.customer_referrals r
  where r.referred_user_id=v_uid;

  select
    count(*) filter(where status='pending'),
    count(*) filter(where status='rewarded'),
    count(*) filter(where status='limit_reached'),
    coalesce(sum(referrer_reward_kes) filter(where status='rewarded'),0)
  into v_pending,v_rewarded,v_limit,v_earned
  from public.customer_referrals
  where referrer_user_id=v_uid;

  v_can_claim := v_referred.id is null
    and not exists(
      select 1
      from public.marketplace_orders o
      where o.customer_id=v_uid
        and o.order_status='delivered'
        and o.payment_status in ('verified_paid','cod_paid')
        and o.items_subtotal_kes>=coalesce(v_settings.minimum_qualifying_order_kes,0)
    );

  return jsonb_build_object(
    'success',true,
    'referral_code',v_code,
    'settings',jsonb_build_object(
      'is_enabled',coalesce(v_settings.is_enabled,false),
      'referrer_reward_kes',coalesce(v_settings.referrer_reward_kes,0),
      'referred_welcome_reward_kes',coalesce(v_settings.referred_welcome_reward_kes,0),
      'minimum_qualifying_order_kes',coalesce(v_settings.minimum_qualifying_order_kes,0),
      'max_rewarded_referrals_per_customer',coalesce(v_settings.max_rewarded_referrals_per_customer,0)
    ),
    'my_referral',case when v_referred.id is null then null else jsonb_build_object(
      'status',v_referred.status,
      'referral_code',v_referred.referral_code,
      'claimed_at',v_referred.claimed_at,
      'qualified_at',v_referred.qualified_at,
      'welcome_reward_kes',v_referred.referred_welcome_reward_kes
    ) end,
    'can_claim_referral',v_can_claim,
    'summary',jsonb_build_object(
      'pending_referrals',v_pending,
      'rewarded_referrals',v_rewarded,
      'limit_reached_referrals',v_limit,
      'referral_rewards_earned_kes',round(v_earned,2)
    )
  );
end
$function$;

revoke execute on function public.customer_get_referral_program() from public,anon;
grant execute on function public.customer_get_referral_program() to authenticated;

create or replace function public.customer_claim_referral_code(p_referral_code text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_code text:=upper(btrim(coalesce(p_referral_code,'')));
  v_settings public.customer_referral_settings%rowtype;
  v_referrer uuid;
  v_own_code text;
  v_my_phone text;
  v_referrer_phone text;
  v_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('success',false,'code','authentication_required');
  end if;

  select * into v_settings from public.customer_referral_settings where id=1;
  if not coalesce(v_settings.is_enabled,false) then
    return jsonb_build_object('success',false,'code','referral_program_disabled');
  end if;

  if v_code !~ '^LEO-[A-Z0-9]{8}$' then
    return jsonb_build_object('success',false,'code','invalid_referral_code');
  end if;

  if exists(select 1 from public.customer_referrals where referred_user_id=v_uid) then
    return jsonb_build_object('success',false,'code','referral_already_claimed');
  end if;

  if exists(
    select 1 from public.marketplace_orders o
    where o.customer_id=v_uid
      and o.order_status='delivered'
      and o.payment_status in ('verified_paid','cod_paid')
      and o.items_subtotal_kes>=coalesce(v_settings.minimum_qualifying_order_kes,0)
  ) then
    return jsonb_build_object('success',false,'code','first_order_already_completed');
  end if;

  v_own_code:=private.ensure_customer_referral_code(v_uid);
  if v_code=v_own_code then
    return jsonb_build_object('success',false,'code','self_referral_not_allowed');
  end if;

  select c.user_id into v_referrer
  from public.customer_referral_codes c
  where c.referral_code=v_code;

  if v_referrer is null then
    return jsonb_build_object('success',false,'code','referral_code_not_found');
  end if;
  if v_referrer=v_uid then
    return jsonb_build_object('success',false,'code','self_referral_not_allowed');
  end if;

  select phone into v_my_phone from public.customer_profiles where user_id=v_uid;
  select phone into v_referrer_phone from public.customer_profiles where user_id=v_referrer;
  if v_my_phone is not null and v_referrer_phone is not null
     and regexp_replace(v_my_phone,'[^0-9]','','g')=regexp_replace(v_referrer_phone,'[^0-9]','','g') then
    return jsonb_build_object('success',false,'code','self_referral_not_allowed');
  end if;

  insert into public.customer_referrals(
    referrer_user_id,referred_user_id,referral_code
  ) values(
    v_referrer,v_uid,v_code
  )
  returning id into v_id;

  return jsonb_build_object(
    'success',true,
    'code','referral_claimed',
    'referral_id',v_id,
    'referral_code',v_code,
    'minimum_qualifying_order_kes',v_settings.minimum_qualifying_order_kes
  );
exception when unique_violation then
  return jsonb_build_object('success',false,'code','referral_already_claimed');
end
$function$;

revoke execute on function public.customer_claim_referral_code(text) from public,anon;
grant execute on function public.customer_claim_referral_code(text) to authenticated;

create or replace function public.customer_mark_referral_shared()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_code text;
  v_count integer;
begin
  if v_uid is null then
    return jsonb_build_object('success',false,'code','authentication_required');
  end if;

  v_code:=private.ensure_customer_referral_code(v_uid);

  update public.customer_referral_codes
  set share_count=share_count+1,last_shared_at=now()
  where user_id=v_uid
  returning share_count into v_count;

  return jsonb_build_object(
    'success',true,
    'referral_code',v_code,
    'share_count',coalesce(v_count,0)
  );
end
$function$;

revoke execute on function public.customer_mark_referral_shared() from public,anon;
grant execute on function public.customer_mark_referral_shared() to authenticated;

create or replace function private.credit_fixed_referral_reward(
  p_user_id uuid,
  p_referral_id uuid,
  p_reward_amount numeric,
  p_credit_source text,
  p_eligible_subtotal numeric,
  p_external_reference text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_reward_id uuid;
  v_reference text;
begin
  if p_user_id is null or p_referral_id is null or coalesce(p_reward_amount,0)<=0 then
    return null;
  end if;
  if p_credit_source not in ('referral_referrer','referral_welcome') then
    raise exception 'Unsupported referral reward source';
  end if;

  v_reference:='REF-'||upper(substr(replace(p_referral_id::text,'-',''),1,16))||
    case when p_credit_source='referral_welcome' then '-WELCOME' else '-EARN' end;

  insert into public.wallet_accounts(user_id)
  values(p_user_id)
  on conflict(user_id) do nothing;

  insert into public.wallet_shopping_rewards(
    user_id,order_reference,eligible_subtotal_kes,reward_rate,
    reward_amount_kes,approved_by,credit_source
  ) values(
    p_user_id,v_reference,greatest(0,coalesce(p_eligible_subtotal,0)),0,
    round(p_reward_amount,2),null,p_credit_source
  )
  on conflict(user_id,order_reference) do nothing
  returning id into v_reward_id;

  if v_reward_id is null then
    select id into v_reward_id
    from public.wallet_shopping_rewards
    where user_id=p_user_id and order_reference=v_reference;
  end if;

  insert into public.wallet_ledger_entries(
    user_id,entry_type,direction,amount_kes,reward_id,
    external_reference,description
  ) values(
    p_user_id,'shopping_reward','credit',round(p_reward_amount,2),v_reward_id,
    nullif(btrim(coalesce(p_external_reference,'')),''),
    btrim(p_description)
  )
  on conflict(reward_id)
  where reward_id is not null and entry_type='shopping_reward'
  do nothing;

  return v_reward_id;
end
$function$;

revoke execute on function private.credit_fixed_referral_reward(uuid,uuid,numeric,text,numeric,text,text)
  from public,anon,authenticated;

create or replace function private.process_referral_qualification(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_order public.marketplace_orders%rowtype;
  v_settings public.customer_referral_settings%rowtype;
  v_referral public.customer_referrals%rowtype;
  v_rewarded_count bigint:=0;
  v_referrer_reward numeric:=0;
  v_welcome_reward numeric:=0;
  v_referrer_reward_id uuid;
  v_welcome_reward_id uuid;
  v_status text;
begin
  select * into v_order
  from public.marketplace_orders
  where id=p_order_id
  for update;

  if not found then return jsonb_build_object('success',false,'code','order_not_found'); end if;
  if v_order.order_status<>'delivered'
     or v_order.payment_status not in ('verified_paid','cod_paid') then
    return jsonb_build_object('success',false,'code','order_not_qualified');
  end if;

  select * into v_settings
  from public.customer_referral_settings
  where id=1;

  if not coalesce(v_settings.is_enabled,false) then
    return jsonb_build_object('success',false,'code','program_disabled');
  end if;
  if v_order.items_subtotal_kes<coalesce(v_settings.minimum_qualifying_order_kes,0) then
    return jsonb_build_object('success',false,'code','below_referral_threshold');
  end if;

  select * into v_referral
  from public.customer_referrals
  where referred_user_id=v_order.customer_id
    and status='pending'
  for update;

  if not found then
    return jsonb_build_object('success',false,'code','no_pending_referral');
  end if;

  select count(*) into v_rewarded_count
  from public.customer_referrals
  where referrer_user_id=v_referral.referrer_user_id
    and status='rewarded';

  v_welcome_reward:=round(coalesce(v_settings.referred_welcome_reward_kes,0),2);

  if v_rewarded_count>=v_settings.max_rewarded_referrals_per_customer then
    v_status:='limit_reached';
    v_referrer_reward:=0;
  else
    v_status:='rewarded';
    v_referrer_reward:=round(coalesce(v_settings.referrer_reward_kes,0),2);
  end if;

  if v_referrer_reward>0 then
    v_referrer_reward_id:=private.credit_fixed_referral_reward(
      v_referral.referrer_user_id,v_referral.id,v_referrer_reward,'referral_referrer',
      v_order.items_subtotal_kes,v_order.order_reference,
      'Referral Shopping Voucher — referred customer completed first qualifying order'
    );
  end if;

  if v_welcome_reward>0 then
    v_welcome_reward_id:=private.credit_fixed_referral_reward(
      v_referral.referred_user_id,v_referral.id,v_welcome_reward,'referral_welcome',
      v_order.items_subtotal_kes,v_order.order_reference,
      'Referral Welcome Shopping Voucher — first qualifying LEOGO order'
    );
  end if;

  update public.customer_referrals
  set status=v_status,
      qualifying_order_id=v_order.id,
      qualifying_order_reference=v_order.order_reference,
      qualifying_order_subtotal_kes=v_order.items_subtotal_kes,
      referrer_reward_kes=v_referrer_reward,
      referred_welcome_reward_kes=v_welcome_reward,
      qualified_at=now(),
      rewarded_at=case when v_referrer_reward>0 or v_welcome_reward>0 then now() else null end
  where id=v_referral.id;

  if v_referrer_reward>0 then
    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    ) values(
      v_referral.referrer_user_id,'wallet','Referral Shopping Voucher earned',
      'You earned '||trim(to_char(v_referrer_reward,'FM999999990.00'))||
        ' LEOGO Points worth KSh '||trim(to_char(v_referrer_reward,'FM999999990.00'))||
        ' after your referral completed a qualifying LEOGO order.',
      'customer_referral',v_referral.id,'referral_referrer_reward_'||v_referral.id::text,'wallet',
      jsonb_build_object(
        'reward_id',v_referrer_reward_id,
        'points',v_referrer_reward,
        'qualifying_order_reference',v_order.order_reference
      )
    )
    on conflict(user_id,source_type,source_id,event_key)
    where source_id is not null
    do nothing;
  elsif v_status='limit_reached' then
    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    ) values(
      v_referral.referrer_user_id,'wallet','Referral qualified',
      'A referral completed a qualifying order, but your current Admin-set referral reward limit has been reached.',
      'customer_referral',v_referral.id,'referral_limit_reached_'||v_referral.id::text,'wallet',
      jsonb_build_object('qualifying_order_reference',v_order.order_reference)
    )
    on conflict(user_id,source_type,source_id,event_key)
    where source_id is not null
    do nothing;
  end if;

  if v_welcome_reward>0 then
    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    ) values(
      v_referral.referred_user_id,'wallet','Welcome Shopping Voucher earned',
      'You earned '||trim(to_char(v_welcome_reward,'FM999999990.00'))||
        ' LEOGO Points worth KSh '||trim(to_char(v_welcome_reward,'FM999999990.00'))||
        ' after completing your first qualifying LEOGO order.',
      'customer_referral',v_referral.id,'referral_welcome_reward_'||v_referral.id::text,'wallet',
      jsonb_build_object(
        'reward_id',v_welcome_reward_id,
        'points',v_welcome_reward,
        'qualifying_order_reference',v_order.order_reference
      )
    )
    on conflict(user_id,source_type,source_id,event_key)
    where source_id is not null
    do nothing;
  end if;

  return jsonb_build_object(
    'success',true,
    'code',v_status,
    'referral_id',v_referral.id,
    'referrer_reward_kes',v_referrer_reward,
    'referred_welcome_reward_kes',v_welcome_reward
  );
end
$function$;

revoke execute on function private.process_referral_qualification(uuid)
  from public,anon,authenticated;

create or replace function private.auto_process_referral_qualification()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.order_status='delivered'
     and new.payment_status in ('verified_paid','cod_paid')
     and (
       old.order_status is distinct from new.order_status
       or old.payment_status is distinct from new.payment_status
     ) then
    perform private.process_referral_qualification(new.id);
  end if;
  return new;
end
$function$;

drop trigger if exists trg_auto_process_referral_qualification on public.marketplace_orders;
create trigger trg_auto_process_referral_qualification
after update of order_status,payment_status
on public.marketplace_orders
for each row execute function private.auto_process_referral_qualification();

revoke execute on function private.auto_process_referral_qualification()
  from public,anon,authenticated;

create or replace function public.admin_get_referral_rewards_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_settings jsonb;
  v_summary jsonb;
  v_recent jsonb;
begin
  if not private.is_leogo_admin('settings.manage')
     and not private.is_leogo_admin('fees.manage')
     and not private.is_leogo_admin('reports.export') then
    raise exception 'Loyalty & Rewards access required';
  end if;

  select jsonb_build_object(
    'is_enabled',s.is_enabled,
    'referrer_reward_kes',s.referrer_reward_kes,
    'referred_welcome_reward_kes',s.referred_welcome_reward_kes,
    'minimum_qualifying_order_kes',s.minimum_qualifying_order_kes,
    'max_rewarded_referrals_per_customer',s.max_rewarded_referrals_per_customer,
    'updated_at',s.updated_at
  )
  into v_settings
  from public.customer_referral_settings s
  where s.id=1;

  select jsonb_build_object(
    'codes_issued',(select count(*) from public.customer_referral_codes),
    'share_actions',(select coalesce(sum(share_count),0) from public.customer_referral_codes),
    'pending_referrals',(select count(*) from public.customer_referrals where status='pending'),
    'successful_referrals',(select count(*) from public.customer_referrals where status='rewarded'),
    'limit_reached_referrals',(select count(*) from public.customer_referrals where status='limit_reached'),
    'referrer_rewards_issued_kes',(select coalesce(sum(referrer_reward_kes),0) from public.customer_referrals),
    'welcome_rewards_issued_kes',(select coalesce(sum(referred_welcome_reward_kes),0) from public.customer_referrals)
  )
  into v_summary;

  select coalesce(jsonb_agg(row_data order by (row_data->>'claimed_at')::timestamptz desc),'[]'::jsonb)
  into v_recent
  from (
    select jsonb_build_object(
      'id',r.id,
      'referral_code',r.referral_code,
      'status',r.status,
      'referrer_name',coalesce(rp.full_name,'LEOGO Customer'),
      'referred_name',coalesce(np.full_name,'LEOGO Customer'),
      'qualifying_order_reference',r.qualifying_order_reference,
      'qualifying_order_subtotal_kes',r.qualifying_order_subtotal_kes,
      'referrer_reward_kes',r.referrer_reward_kes,
      'referred_welcome_reward_kes',r.referred_welcome_reward_kes,
      'claimed_at',r.claimed_at,
      'qualified_at',r.qualified_at
    ) row_data
    from public.customer_referrals r
    left join public.customer_profiles rp on rp.user_id=r.referrer_user_id
    left join public.customer_profiles np on np.user_id=r.referred_user_id
    order by r.claimed_at desc
    limit 100
  ) q;

  return jsonb_build_object(
    'settings',coalesce(v_settings,'{}'::jsonb),
    'summary',coalesce(v_summary,'{}'::jsonb),
    'recent_referrals',coalesce(v_recent,'[]'::jsonb)
  );
end
$function$;

revoke execute on function public.admin_get_referral_rewards_dashboard() from public,anon;
grant execute on function public.admin_get_referral_rewards_dashboard() to authenticated;

create or replace function public.admin_update_referral_reward_settings(
  p_is_enabled boolean,
  p_referrer_reward_kes numeric,
  p_referred_welcome_reward_kes numeric,
  p_minimum_qualifying_order_kes numeric,
  p_max_rewarded_referrals_per_customer integer
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not private.is_leogo_admin('settings.manage')
     and not private.is_leogo_admin('fees.manage') then
    raise exception 'Loyalty & Rewards settings permission required';
  end if;

  if coalesce(p_referrer_reward_kes,-1)<0 or p_referrer_reward_kes>1000000 then
    raise exception 'Enter a valid referrer Shopping Voucher amount';
  end if;
  if coalesce(p_referred_welcome_reward_kes,-1)<0 or p_referred_welcome_reward_kes>1000000 then
    raise exception 'Enter a valid welcome Shopping Voucher amount';
  end if;
  if coalesce(p_minimum_qualifying_order_kes,-1)<0 or p_minimum_qualifying_order_kes>100000000 then
    raise exception 'Enter a valid minimum qualifying order amount';
  end if;
  if coalesce(p_max_rewarded_referrals_per_customer,0)<1
     or p_max_rewarded_referrals_per_customer>100000 then
    raise exception 'Enter a valid maximum rewarded referrals limit';
  end if;
  if coalesce(p_is_enabled,false) and p_referrer_reward_kes<=0 then
    raise exception 'Set a referrer reward above KSh 0 before enabling Share & Earn';
  end if;

  select to_jsonb(s) into v_before
  from public.customer_referral_settings s
  where id=1;

  update public.customer_referral_settings
  set is_enabled=coalesce(p_is_enabled,false),
      referrer_reward_kes=round(p_referrer_reward_kes,2),
      referred_welcome_reward_kes=round(p_referred_welcome_reward_kes,2),
      minimum_qualifying_order_kes=round(p_minimum_qualifying_order_kes,2),
      max_rewarded_referrals_per_customer=p_max_rewarded_referrals_per_customer,
      updated_by=(select auth.uid()),
      updated_at=now()
  where id=1
  returning to_jsonb(customer_referral_settings.*) into v_after;

  perform private.write_admin_audit(
    'loyalty.referral_settings.updated','customer_referral_settings','1',
    v_before,v_after,null
  );

  return jsonb_build_object('success',true,'settings',v_after);
end
$function$;

revoke execute on function public.admin_update_referral_reward_settings(boolean,numeric,numeric,numeric,integer)
  from public,anon;
grant execute on function public.admin_update_referral_reward_settings(boolean,numeric,numeric,numeric,integer)
  to authenticated;

notify pgrst,'reload schema';
