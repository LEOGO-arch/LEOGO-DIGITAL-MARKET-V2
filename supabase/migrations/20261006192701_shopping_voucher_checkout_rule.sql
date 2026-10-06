-- LEOGO Shopping Voucher checkout rule.
-- Shopping Vouchers remain non-withdrawable wallet rewards.
-- They may cover up to 50% of an eligible marketplace checkout, and
-- the checkout total must be greater than the customer's available voucher balance.

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
      'external_amount_due_kes',v_order.grand_total_kes,
      'shopping_voucher_applied_kes',0
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

  if v_available<=0 then
    return jsonb_build_object(
      'points_redeemed_kes',0,
      'external_amount_due_kes',v_order.grand_total_kes,
      'shopping_voucher_applied_kes',0
    );
  end if;

  if round(v_order.grand_total_kes,2)<=v_available then
    raise exception 'Shopping Voucher can only be used when your checkout total is greater than your available voucher balance of KSh %',
      trim(to_char(v_available,'FM999999990.00'));
  end if;

  v_redeem:=least(
    v_available,
    round(v_order.grand_total_kes*0.50,2)
  );

  if v_redeem<=0 then
    return jsonb_build_object(
      'points_redeemed_kes',0,
      'external_amount_due_kes',v_order.grand_total_kes,
      'shopping_voucher_applied_kes',0
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
    v_order.order_reference,'LEOGO Shopping Voucher used on marketplace order'
  );

  update public.marketplace_orders
  set reward_points_redeemed_kes=v_redeem,
      reward_redemption_id=v_redemption_id,
      updated_at=now()
  where id=v_order.id
  returning * into v_order;

  return jsonb_build_object(
    'points_redeemed_kes',v_redeem,
    'shopping_voucher_applied_kes',v_redeem,
    'external_amount_due_kes',v_order.external_amount_due_kes,
    'reward_redemption_id',v_redemption_id,
    'max_checkout_cover_percent',50
  );
end
$function$;

revoke all on function private.apply_reward_points_to_marketplace_order(uuid,boolean)
from public,anon,authenticated;

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
    'shopping_voucher_balance_kes',v_points,
    'conversion','1 point = KSh 1',
    'max_checkout_cover_percent',50,
    'requires_checkout_above_voucher_balance',true,
    'reward_minimum_spend_kes',v_settings.reward_minimum_spend_kes,
    'reward_rate',v_settings.reward_rate
  );
end
$function$;

revoke all on function public.get_my_reward_points_balance() from public,anon;
grant execute on function public.get_my_reward_points_balance() to authenticated;

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
    'balance',greatest(0,v_cash_balance),
    'cash_balance',greatest(0,v_cash_balance),
    'reserved',greatest(0,v_reserved),
    'withdrawable',greatest(0,v_cash_balance-v_reserved),
    'total_saved',greatest(0,v_total_saved),
    'points',greatest(0,v_points),
    'points_value_kes',greatest(0,v_points),
    'shopping_voucher_balance_kes',greatest(0,v_points),
    'shopping_voucher_checkout_max_percent',50,
    'shopping_voucher_rule','Checkout total must be greater than voucher balance; voucher covers up to 50% of eligible checkout.',
    'points_conversion','1 point = KSh 1',
    'statement_transaction_count',v_transaction_count,
    'statement_fee_per_200_kes',v_statement_fee,
    'statement_download_fee',case when v_transaction_count=0 then 0
      else ceil(v_transaction_count::numeric/200)*v_statement_fee end
  );
end
$function$;

revoke all on function public.get_my_wallet_summary() from public,anon;
grant execute on function public.get_my_wallet_summary() to authenticated;

notify pgrst,'reload schema';
