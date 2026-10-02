-- Keep LEOGO Points separate from withdrawable / savings cash presentation.
-- Points remain spendable at checkout at 1 point = KSh 1, but "wallet balance"
-- represents cash/savings only to avoid treating rewards as withdrawable money.

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
