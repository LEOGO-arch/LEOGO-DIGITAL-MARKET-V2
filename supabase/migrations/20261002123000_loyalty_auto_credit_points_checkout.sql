-- LEOGO Loyalty & Rewards V2
-- 1) Automatically credit rewards after an eligible marketplace order is both paid and delivered.
-- 2) Allow customers to redeem LEOGO Points at checkout together with Till / Paybill / COD.
-- 3) Keep points non-withdrawable so reward value cannot be spent twice.
-- 4) Restore redeemed points automatically if the marketplace order is cancelled.

alter table public.wallet_shopping_rewards
  alter column approved_by drop not null;

alter table public.wallet_shopping_rewards
  add column if not exists credit_source text not null default 'manual_admin';

alter table public.wallet_shopping_rewards
  drop constraint if exists wallet_shopping_rewards_credit_source_check;

alter table public.wallet_shopping_rewards
  add constraint wallet_shopping_rewards_credit_source_check
  check(credit_source in ('manual_admin','automatic_delivery'));

create table if not exists public.wallet_reward_redemptions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  order_id uuid not null unique references public.marketplace_orders(id) on delete restrict,
  order_reference text not null,
  redeemed_amount_kes numeric(14,2) not null check(redeemed_amount_kes>0),
  status text not null default 'applied' check(status in ('applied','restored')),
  applied_at timestamptz not null default now(),
  restored_at timestamptz
);

create index if not exists wallet_reward_redemptions_user_idx
  on public.wallet_reward_redemptions(user_id,applied_at desc);

alter table public.wallet_reward_redemptions enable row level security;
revoke all on table public.wallet_reward_redemptions from anon,authenticated;
grant all on table public.wallet_reward_redemptions to service_role;

alter table public.wallet_ledger_entries
  add column if not exists reward_redemption_id uuid
  references public.wallet_reward_redemptions(id) on delete restrict;

alter table public.wallet_ledger_entries
  drop constraint if exists wallet_ledger_entries_entry_type_check;

alter table public.wallet_ledger_entries
  add constraint wallet_ledger_entries_entry_type_check
  check(entry_type in (
    'normal_saving','challenge_saving','purchase','refund','withdrawal',
    'loan_disbursement','loan_repayment','admin_adjustment','shopping_reward',
    'reward_redemption','reward_redemption_restore',
    'maintenance_fee','statement_download_fee'
  ));

create unique index if not exists wallet_reward_credit_ledger_unique
  on public.wallet_ledger_entries(reward_id)
  where reward_id is not null and entry_type='shopping_reward';

create unique index if not exists wallet_reward_redemption_debit_unique
  on public.wallet_ledger_entries(reward_redemption_id)
  where reward_redemption_id is not null and entry_type='reward_redemption';

create unique index if not exists wallet_reward_redemption_restore_unique
  on public.wallet_ledger_entries(reward_redemption_id)
  where reward_redemption_id is not null and entry_type='reward_redemption_restore';

alter table public.marketplace_orders
  add column if not exists reward_points_redeemed_kes numeric(14,2) not null default 0;

alter table public.marketplace_orders
  add column if not exists external_amount_due_kes numeric(14,2);

alter table public.marketplace_orders
  add column if not exists reward_redemption_id uuid
  references public.wallet_reward_redemptions(id) on delete restrict;

update public.marketplace_orders
set external_amount_due_kes=greatest(0,grand_total_kes-coalesce(reward_points_redeemed_kes,0))
where external_amount_due_kes is null;

alter table public.marketplace_orders
  alter column external_amount_due_kes set not null;

alter table public.marketplace_orders
  drop constraint if exists marketplace_orders_reward_points_redeemed_check;

alter table public.marketplace_orders
  add constraint marketplace_orders_reward_points_redeemed_check
  check(
    reward_points_redeemed_kes>=0
    and reward_points_redeemed_kes<=grand_total_kes
  );

alter table public.marketplace_orders
  drop constraint if exists marketplace_orders_external_amount_due_check;

alter table public.marketplace_orders
  add constraint marketplace_orders_external_amount_due_check
  check(
    external_amount_due_kes>=0
    and external_amount_due_kes<=grand_total_kes
  );

alter table public.marketplace_orders
  drop constraint if exists marketplace_orders_payment_method_check;

alter table public.marketplace_orders
  add constraint marketplace_orders_payment_method_check
  check(payment_method in ('till','paybill','cod','points'));

create or replace function private.sync_marketplace_reward_amount_due()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  new.reward_points_redeemed_kes:=greatest(0,coalesce(new.reward_points_redeemed_kes,0));
  if tg_op='INSERT'
     or new.grand_total_kes is distinct from old.grand_total_kes
     or new.reward_points_redeemed_kes is distinct from old.reward_points_redeemed_kes
     or new.external_amount_due_kes is null then
    new.external_amount_due_kes:=greatest(
      0,
      round(coalesce(new.grand_total_kes,0)-coalesce(new.reward_points_redeemed_kes,0),2)
    );
  end if;
  return new;
end
$function$;

drop trigger if exists trg_sync_marketplace_reward_amount_due on public.marketplace_orders;
create trigger trg_sync_marketplace_reward_amount_due
before insert or update of grand_total_kes,reward_points_redeemed_kes
on public.marketplace_orders
for each row execute function private.sync_marketplace_reward_amount_due();

create or replace function private.available_reward_points(p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path=''
as $function$
  select greatest(
    0,
    coalesce(sum(
      case
        when l.entry_type='shopping_reward' and l.direction='credit' then l.amount_kes
        when l.entry_type='reward_redemption' and l.direction='debit' then -l.amount_kes
        when l.entry_type='reward_redemption_restore' and l.direction='credit' then l.amount_kes
        else 0
      end
    ),0)
  )
  from public.wallet_ledger_entries l
  where l.user_id=p_user_id;
$function$;

revoke execute on function private.available_reward_points(uuid) from public,anon,authenticated;

create or replace function public.get_my_reward_points_balance()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_points numeric(14,2):=0;
  v_settings public.wallet_settings%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('success',false,'code','authentication_required');
  end if;

  v_points:=round(private.available_reward_points(v_uid),2);
  select * into v_settings from public.wallet_settings where id=1;

  return jsonb_build_object(
    'success',true,
    'points',v_points,
    'points_value_kes',v_points,
    'conversion','1 point = KSh 1',
    'reward_minimum_spend_kes',v_settings.reward_minimum_spend_kes,
    'reward_rate',v_settings.reward_rate
  );
end
$function$;

revoke execute on function public.get_my_reward_points_balance() from public,anon;
grant execute on function public.get_my_reward_points_balance() to authenticated;

create or replace function private.apply_reward_points_to_marketplace_order(
  p_order_id uuid,
  p_use_points boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_order public.marketplace_orders%rowtype;
  v_available numeric(14,2):=0;
  v_redeem numeric(14,2):=0;
  v_redemption_id uuid;
begin
  select * into v_order
  from public.marketplace_orders
  where id=p_order_id
  for update;

  if not found then raise exception 'Order not found'; end if;
  if v_uid is null or v_order.customer_id<>v_uid then
    raise exception 'Customer order access required';
  end if;

  if not coalesce(p_use_points,false) then
    return jsonb_build_object(
      'points_redeemed_kes',0,
      'external_amount_due_kes',v_order.grand_total_kes
    );
  end if;

  insert into public.wallet_accounts(user_id)
  values(v_uid)
  on conflict(user_id) do nothing;

  perform 1
  from public.wallet_accounts
  where user_id=v_uid
  for update;

  v_available:=round(private.available_reward_points(v_uid),2);
  v_redeem:=least(v_available,round(v_order.grand_total_kes,2));

  if v_redeem<=0 then
    return jsonb_build_object(
      'points_redeemed_kes',0,
      'external_amount_due_kes',v_order.grand_total_kes
    );
  end if;

  insert into public.wallet_reward_redemptions(
    user_id,order_id,order_reference,redeemed_amount_kes
  ) values(
    v_uid,v_order.id,v_order.order_reference,v_redeem
  )
  returning id into v_redemption_id;

  insert into public.wallet_ledger_entries(
    user_id,entry_type,direction,amount_kes,reward_redemption_id,
    external_reference,description
  ) values(
    v_uid,'reward_redemption','debit',v_redeem,v_redemption_id,
    v_order.order_reference,'LEOGO Points used on marketplace order'
  );

  update public.marketplace_orders
  set reward_points_redeemed_kes=v_redeem,
      reward_redemption_id=v_redemption_id,
      payment_method=case when round(grand_total_kes-v_redeem,2)<=0 then 'points' else payment_method end,
      payment_status=case when round(grand_total_kes-v_redeem,2)<=0 then 'verified_paid' else payment_status end,
      payment_message=case when round(grand_total_kes-v_redeem,2)<=0 then 'Paid fully with LEOGO Points' else payment_message end,
      payment_verified_at=case when round(grand_total_kes-v_redeem,2)<=0 then now() else payment_verified_at end,
      payment_verified_by=case when round(grand_total_kes-v_redeem,2)<=0 then null else payment_verified_by end,
      updated_at=now()
  where id=v_order.id
  returning * into v_order;

  return jsonb_build_object(
    'points_redeemed_kes',v_redeem,
    'external_amount_due_kes',v_order.external_amount_due_kes,
    'reward_redemption_id',v_redemption_id
  );
end
$function$;

revoke execute on function private.apply_reward_points_to_marketplace_order(uuid,boolean)
  from public,anon,authenticated;

create or replace function public.customer_create_marketplace_order_v2(
  p_items jsonb,
  p_receiver_name text,
  p_contact_number text,
  p_delivery_zone text,
  p_county text default null,
  p_sub_county text default null,
  p_estate text default null,
  p_landmark text default null,
  p_location_link text default null,
  p_pickup_station_id uuid default null,
  p_payment_method text default null,
  p_payment_message text default null,
  p_use_reward_points boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_result jsonb;
  v_points jsonb;
  v_order public.marketplace_orders%rowtype;
  v_order_id uuid;
  v_call_method text;
begin
  if not coalesce(p_use_reward_points,false) and p_payment_method is null then
    raise exception 'Choose a payment method';
  end if;

  if p_payment_method is not null and p_payment_method not in ('till','paybill','cod') then
    raise exception 'Choose Till, Paybill or Cash on Delivery';
  end if;

  -- The existing locked order workflow remains the source of truth for product
  -- validation, stock reservation, fees, Seller sub-orders and notifications.
  -- If points may cover the full total, Till is used only as a temporary internal
  -- placeholder; the order is changed to payment_method=points atomically below.
  v_call_method:=coalesce(p_payment_method,'till');

  v_result:=public.customer_create_marketplace_order(
    p_items,
    p_receiver_name,
    p_contact_number,
    p_delivery_zone,
    p_county,
    p_sub_county,
    p_estate,
    p_landmark,
    p_location_link,
    p_pickup_station_id,
    v_call_method,
    p_payment_message
  );

  v_order_id:=(v_result->>'order_id')::uuid;
  v_points:=private.apply_reward_points_to_marketplace_order(
    v_order_id,
    coalesce(p_use_reward_points,false)
  );

  select * into v_order
  from public.marketplace_orders
  where id=v_order_id
  for update;

  if v_order.external_amount_due_kes>0 and p_payment_method is null then
    raise exception 'Your LEOGO Points do not cover the full order. Choose another payment method for the remaining KSh %',
      v_order.external_amount_due_kes;
  end if;

  if v_order.external_amount_due_kes>0
     and p_payment_method in ('till','paybill','cod')
     and char_length(btrim(coalesce(p_payment_message,'')))<3 then
    raise exception 'Add the required payment confirmation for the remaining amount';
  end if;

  return v_result || jsonb_build_object(
    'reward_points_redeemed_kes',v_order.reward_points_redeemed_kes,
    'external_amount_due_kes',v_order.external_amount_due_kes,
    'payment_method',v_order.payment_method,
    'payment_status',v_order.payment_status
  );
end
$function$;

revoke execute on function public.customer_create_marketplace_order_v2(
  jsonb,text,text,text,text,text,text,text,text,uuid,text,text,boolean
) from public,anon;
grant execute on function public.customer_create_marketplace_order_v2(
  jsonb,text,text,text,text,text,text,text,text,uuid,text,text,boolean
) to authenticated;

create or replace function private.restore_cancelled_marketplace_reward_points()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_redemption public.wallet_reward_redemptions%rowtype;
begin
  if new.order_status<>'cancelled' or old.order_status='cancelled' then
    return new;
  end if;

  select * into v_redemption
  from public.wallet_reward_redemptions r
  where r.order_id=new.id
    and r.status='applied'
  for update;

  if not found then return new; end if;

  insert into public.wallet_ledger_entries(
    user_id,entry_type,direction,amount_kes,reward_redemption_id,
    external_reference,description
  ) values(
    v_redemption.user_id,'reward_redemption_restore','credit',
    v_redemption.redeemed_amount_kes,v_redemption.id,
    new.order_reference,'LEOGO Points restored after marketplace order cancellation'
  )
  on conflict(reward_redemption_id)
  where reward_redemption_id is not null and entry_type='reward_redemption_restore'
  do nothing;

  update public.wallet_reward_redemptions
  set status='restored',restored_at=coalesce(restored_at,now())
  where id=v_redemption.id;

  perform private.assisted_shopping_notify_customer(
    new.customer_id,
    coalesce((select a.id from public.assisted_shopping_requests a where a.marketplace_order_id=new.id),new.id),
    'reward_points_restored_'||new.id::text,
    'LEOGO Points restored',
    'KSh '||trim(to_char(v_redemption.redeemed_amount_kes,'FM999999990.00'))||
      ' in LEOGO Points was restored after order '||new.order_reference||' was cancelled.'
  );

  return new;
exception
  when undefined_function then
    insert into public.customer_notifications(
      user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
    ) values(
      new.customer_id,'wallet','LEOGO Points restored',
      'KSh '||trim(to_char(v_redemption.redeemed_amount_kes,'FM999999990.00'))||
        ' in LEOGO Points was restored after order '||new.order_reference||' was cancelled.',
      'marketplace_order',new.id,'reward_points_restored_'||new.id::text,'wallet',
      jsonb_build_object('reward_points_restored_kes',v_redemption.redeemed_amount_kes)
    )
    on conflict(user_id,source_type,source_id,event_key)
    where source_id is not null
    do nothing;
    return new;
end
$function$;

-- Replace the restore helper above with a simple marketplace notification that
-- does not depend on the Assisted Shopping module.
create or replace function private.restore_cancelled_marketplace_reward_points()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_redemption public.wallet_reward_redemptions%rowtype;
begin
  if new.order_status<>'cancelled' or old.order_status='cancelled' then
    return new;
  end if;

  select * into v_redemption
  from public.wallet_reward_redemptions r
  where r.order_id=new.id
    and r.status='applied'
  for update;

  if not found then return new; end if;

  insert into public.wallet_ledger_entries(
    user_id,entry_type,direction,amount_kes,reward_redemption_id,
    external_reference,description
  ) values(
    v_redemption.user_id,'reward_redemption_restore','credit',
    v_redemption.redeemed_amount_kes,v_redemption.id,
    new.order_reference,'LEOGO Points restored after marketplace order cancellation'
  )
  on conflict(reward_redemption_id)
  where reward_redemption_id is not null and entry_type='reward_redemption_restore'
  do nothing;

  update public.wallet_reward_redemptions
  set status='restored',restored_at=coalesce(restored_at,now())
  where id=v_redemption.id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    new.customer_id,'wallet','LEOGO Points restored',
    'KSh '||trim(to_char(v_redemption.redeemed_amount_kes,'FM999999990.00'))||
      ' in LEOGO Points was restored after order '||new.order_reference||' was cancelled.',
    'marketplace_order',new.id,'reward_points_restored_'||new.id::text,'wallet',
    jsonb_build_object('reward_points_restored_kes',v_redemption.redeemed_amount_kes)
  )
  on conflict(user_id,source_type,source_id,event_key)
  where source_id is not null
  do update set
    title=excluded.title,
    message=excluded.message,
    metadata=excluded.metadata,
    read_at=null,
    created_at=now();

  return new;
end
$function$;

drop trigger if exists trg_restore_cancelled_marketplace_reward_points on public.marketplace_orders;
create trigger trg_restore_cancelled_marketplace_reward_points
after update of order_status on public.marketplace_orders
for each row execute function private.restore_cancelled_marketplace_reward_points();

create or replace function private.credit_marketplace_order_reward(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_order public.marketplace_orders%rowtype;
  v_settings public.wallet_settings%rowtype;
  v_reward numeric(14,2):=0;
  v_reward_id uuid;
begin
  select * into v_order
  from public.marketplace_orders
  where id=p_order_id
  for update;

  if not found then return jsonb_build_object('success',false,'code','order_not_found'); end if;
  if v_order.order_status<>'delivered'
     or v_order.payment_status not in ('verified_paid','cod_paid') then
    return jsonb_build_object('success',false,'code','not_paid_and_delivered');
  end if;

  select * into v_settings
  from public.wallet_settings
  where id=1;

  if v_order.items_subtotal_kes<v_settings.reward_minimum_spend_kes then
    return jsonb_build_object('success',false,'code','below_threshold');
  end if;

  v_reward:=round(v_order.items_subtotal_kes*v_settings.reward_rate,2);
  if v_reward<=0 then
    return jsonb_build_object('success',false,'code','zero_reward');
  end if;

  insert into public.wallet_accounts(user_id)
  values(v_order.customer_id)
  on conflict(user_id) do nothing;

  insert into public.wallet_shopping_rewards(
    user_id,order_reference,eligible_subtotal_kes,reward_rate,
    reward_amount_kes,approved_by,credit_source
  ) values(
    v_order.customer_id,v_order.order_reference,round(v_order.items_subtotal_kes,2),
    v_settings.reward_rate,v_reward,null,'automatic_delivery'
  )
  on conflict(user_id,order_reference) do nothing
  returning id into v_reward_id;

  if v_reward_id is null then
    select id,reward_amount_kes into v_reward_id,v_reward
    from public.wallet_shopping_rewards
    where user_id=v_order.customer_id
      and order_reference=v_order.order_reference;

    return jsonb_build_object(
      'success',true,'code','already_credited',
      'reward_id',v_reward_id,'reward_amount_kes',v_reward
    );
  end if;

  insert into public.wallet_ledger_entries(
    user_id,entry_type,direction,amount_kes,reward_id,
    external_reference,description
  ) values(
    v_order.customer_id,'shopping_reward','credit',v_reward,v_reward_id,
    v_order.order_reference,'LEOGO Points earned from delivered marketplace order'
  );

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  ) values(
    v_order.customer_id,'wallet','LEOGO Points earned',
    'You earned '||trim(to_char(v_reward,'FM999999990.00'))||
      ' LEOGO Points worth KSh '||trim(to_char(v_reward,'FM999999990.00'))||
      ' from order '||v_order.order_reference||'.',
    'marketplace_order',v_order.id,'reward_credited_'||v_reward_id::text,'wallet',
    jsonb_build_object(
      'reward_id',v_reward_id,
      'points',v_reward,
      'points_value_kes',v_reward,
      'eligible_subtotal_kes',v_order.items_subtotal_kes,
      'reward_rate',v_settings.reward_rate
    )
  )
  on conflict(user_id,source_type,source_id,event_key)
  where source_id is not null
  do nothing;

  return jsonb_build_object(
    'success',true,'code','credited',
    'reward_id',v_reward_id,'reward_amount_kes',v_reward
  );
end
$function$;

revoke execute on function private.credit_marketplace_order_reward(uuid)
  from public,anon,authenticated;

create or replace function private.auto_credit_marketplace_reward()
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
    perform private.credit_marketplace_order_reward(new.id);
  end if;
  return new;
end
$function$;

drop trigger if exists trg_auto_credit_marketplace_reward on public.marketplace_orders;
create trigger trg_auto_credit_marketplace_reward
after update of order_status,payment_status
on public.marketplace_orders
for each row execute function private.auto_credit_marketplace_reward();

create or replace function public.get_my_wallet_summary()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_cash_balance numeric(14,2) := 0;
  v_points numeric(14,2) := 0;
  v_reserved numeric(14,2) := 0;
  v_total_saved numeric(14,2) := 0;
  v_transaction_count integer := 0;
  v_statement_fee numeric(14,2) := 0;
begin
  if v_user_id is null then
    return jsonb_build_object('success',false,'code','authentication_required');
  end if;

  select
    coalesce(sum(
      case
        when entry_type in ('shopping_reward','reward_redemption','reward_redemption_restore') then 0
        when direction='credit' then amount_kes
        else -amount_kes
      end
    ),0),
    coalesce(sum(
      case
        when entry_type='shopping_reward' and direction='credit' then amount_kes
        when entry_type='reward_redemption' and direction='debit' then -amount_kes
        when entry_type='reward_redemption_restore' and direction='credit' then amount_kes
        else 0
      end
    ),0),
    coalesce(sum(
      case when direction='credit' and entry_type in ('normal_saving','challenge_saving')
      then amount_kes else 0 end
    ),0),
    count(*) filter(where entry_type<>'statement_download_fee')
  into v_cash_balance,v_points,v_total_saved,v_transaction_count
  from public.wallet_ledger_entries
  where user_id=v_user_id;

  select coalesce(sum(requested_amount_kes),0)
  into v_reserved
  from public.wallet_withdrawal_requests
  where user_id=v_user_id and request_status='pending_call';

  select statement_fee_per_200_kes
  into v_statement_fee
  from public.wallet_settings
  where id=1;

  return jsonb_build_object(
    'success',true,
    'balance',greatest(0,v_cash_balance+v_points),
    'cash_balance',greatest(0,v_cash_balance),
    'reserved',greatest(0,v_reserved),
    'withdrawable',greatest(0,v_cash_balance-v_reserved),
    'total_saved',greatest(0,v_total_saved),
    'points',greatest(0,v_points),
    'points_value_kes',greatest(0,v_points),
    'points_conversion','1 point = KSh 1',
    'statement_transaction_count',v_transaction_count,
    'statement_fee_per_200_kes',v_statement_fee,
    'statement_download_fee',case when v_transaction_count=0 then 0
      else ceil(v_transaction_count::numeric/200)*v_statement_fee end
  );
end
$function$;

revoke execute on function public.get_my_wallet_summary() from public,anon;
grant execute on function public.get_my_wallet_summary() to authenticated;

do $block$
declare
  v_def text;
  v_old text := $old$
  select coalesce(sum(case when direction='credit' then amount_kes else -amount_kes end),0)
  into v_balance from public.wallet_ledger_entries where user_id=v_user_id;
$old$;
  v_new text := $new$
  select coalesce(sum(case when direction='credit' then amount_kes else -amount_kes end),0)
  into v_balance
  from public.wallet_ledger_entries
  where user_id=v_user_id
    and entry_type not in ('shopping_reward','reward_redemption','reward_redemption_restore');
$new$;
begin
  select pg_get_functiondef(
    'private.submit_wallet_withdrawal(numeric,text,text,text,uuid,text)'::regprocedure
  ) into v_def;

  if position(v_old in v_def)=0 then
    raise exception 'Wallet withdrawal balance anchor not found';
  end if;

  execute replace(v_def,v_old,v_new);
end
$block$;

create or replace function public.rider_list_delivery_jobs_v4()
returns table(
  delivery_job_id uuid,
  order_id uuid,
  order_reference text,
  customer_name text,
  customer_phone text,
  delivery_zone text,
  county text,
  sub_county text,
  estate text,
  landmark text,
  location_link text,
  status text,
  payment_method text,
  payment_status text,
  grand_total_kes numeric,
  reward_points_redeemed_kes numeric,
  external_amount_due_kes numeric,
  admin_notes text,
  rider_notes text,
  cod_payment_required boolean,
  assigned_at timestamptz,
  picked_up_at timestamptz,
  arrived_sorting_center_at timestamptz,
  sorting_received_at timestamptz,
  ready_for_dispatch_at timestamptz,
  on_the_way_at timestamptz,
  delivered_at timestamptz,
  seller_pickups jsonb
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not exists(
    select 1 from public.leogo_staff ls
    where ls.user_id=(select auth.uid())
      and ls.staff_role='rider'
      and ls.status='active'
  ) then
    raise exception 'Active LEOGO Rider account required';
  end if;

  return query
  select
    d.id,o.id,o.order_reference,o.receiver_name,o.contact_number,o.delivery_zone,
    o.county,o.sub_county,o.estate,o.landmark,o.location_link,
    d.status,o.payment_method,o.payment_status,o.grand_total_kes,
    o.reward_points_redeemed_kes,o.external_amount_due_kes,
    d.admin_notes,d.rider_notes,
    (o.payment_method='cod' and o.payment_status not in ('cod_paid','verified_paid')) as cod_payment_required,
    d.assigned_at,d.picked_up_at,d.arrived_sorting_center_at,d.sorting_received_at,
    d.ready_for_dispatch_at,d.on_the_way_at,d.delivered_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'seller_id',so.seller_id,
        'seller_name',s.business_name,
        'seller_phone',s.phone,
        'seller_location',concat_ws(', ',
          nullif(s.location_details,''),
          nullif(s.town,''),
          nullif(s.sub_county,''),
          nullif(s.county,'')
        ),
        'seller_latitude',s.shop_latitude,
        'seller_longitude',s.shop_longitude,
        'seller_map_link',coalesce(
          nullif(s.shop_map_link,''),
          case when s.shop_latitude is not null and s.shop_longitude is not null
            then 'https://www.google.com/maps?q='||s.shop_latitude::text||','||s.shop_longitude::text
            else null end
        ),
        'fulfilment_status',so.fulfilment_status,
        'seller_subtotal_kes',so.seller_subtotal_kes,
        'items',coalesce((
          select jsonb_agg(jsonb_build_object(
            'product_id',i.product_id,
            'product_name',i.product_name,
            'variant_name',i.variant_name,
            'quantity',i.quantity,
            'measurement_unit',sp.measurement_unit
          ) order by i.created_at)
          from public.marketplace_order_items i
          left join public.seller_products sp on sp.id=i.product_id
          where i.order_id=o.id and i.seller_id=so.seller_id
        ),'[]'::jsonb)
      ) order by s.business_name)
      from public.marketplace_seller_orders so
      join public.seller_accounts s on s.user_id=so.seller_id
      where so.order_id=o.id
    ),'[]'::jsonb)
  from public.marketplace_delivery_jobs d
  join public.marketplace_orders o on o.id=d.order_id
  where d.rider_id=(select auth.uid())
  order by
    case d.status
      when 'assigned' then 0
      when 'picked_up' then 1
      when 'arrived_sorting_center' then 2
      when 'sorting_received' then 3
      when 'ready_for_dispatch' then 4
      when 'on_the_way' then 5
      when 'delivered_to_pickup_station' then 6
      when 'ready_for_pickup' then 7
      else 8
    end,
    o.created_at desc;
end
$function$;

revoke execute on function public.rider_list_delivery_jobs_v4() from public,anon;
grant execute on function public.rider_list_delivery_jobs_v4() to authenticated;

-- Backfill currently delivered + paid eligible marketplace orders exactly once.
select private.credit_marketplace_order_reward(o.id)
from public.marketplace_orders o
where o.order_status='delivered'
  and o.payment_status in ('verified_paid','cod_paid');
