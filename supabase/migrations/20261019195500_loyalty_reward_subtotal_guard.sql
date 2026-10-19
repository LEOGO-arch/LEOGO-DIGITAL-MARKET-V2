-- Validate loyalty reward subtotal before computing points; no retroactive balance changes.
CREATE OR REPLACE FUNCTION public.admin_credit_wallet_shopping_reward(p_user_id uuid, p_order_reference text, p_eligible_subtotal_kes numeric, p_staff_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_settings public.wallet_settings%rowtype;
  v_reward numeric(14,2);
  v_reward_id uuid;
begin
  if p_user_id is null or p_staff_user_id is null then
    raise exception 'Customer and staff users are required';
  end if;
  if char_length(btrim(coalesce(p_order_reference,''))) not between 3 and 120 then
    raise exception 'Order reference is required';
  end if;
  if p_eligible_subtotal_kes is null or p_eligible_subtotal_kes<=0
     or p_eligible_subtotal_kes>1000000000
     or p_eligible_subtotal_kes<>round(p_eligible_subtotal_kes,2) then
    raise exception 'Eligible reward subtotal must be a positive amount in shillings and cents';
  end if;
  select * into v_settings from public.wallet_settings where id=1;
  if p_eligible_subtotal_kes < v_settings.reward_minimum_spend_kes then
    return jsonb_build_object('success',false,'code','below_threshold','reward_amount_kes',0);
  end if;
  v_reward := round(p_eligible_subtotal_kes*v_settings.reward_rate,2);
  if v_reward<=0 then
    return jsonb_build_object('success',false,'code','zero_reward','reward_amount_kes',0);
  end if;
  insert into public.wallet_accounts(user_id)
  values(p_user_id) on conflict(user_id) do nothing;

  insert into public.wallet_shopping_rewards(
    user_id,order_reference,eligible_subtotal_kes,reward_rate,reward_amount_kes,approved_by
  ) values(
    p_user_id,btrim(p_order_reference),round(p_eligible_subtotal_kes,2),
    v_settings.reward_rate,v_reward,p_staff_user_id
  )
  on conflict(user_id,order_reference) do nothing
  returning id into v_reward_id;

  if v_reward_id is null then
    select id,reward_amount_kes into v_reward_id,v_reward
    from public.wallet_shopping_rewards
    where user_id=p_user_id and order_reference=btrim(p_order_reference);
    return jsonb_build_object(
      'success',true,'code','already_credited','reward_id',v_reward_id,
      'reward_amount_kes',v_reward
    );
  end if;

  insert into public.wallet_ledger_entries(
    user_id,entry_type,direction,amount_kes,reward_id,external_reference,description
  ) values(
    p_user_id,'shopping_reward','credit',v_reward,v_reward_id,
    btrim(p_order_reference),'LEOGO shopping points earned'
  );
  return jsonb_build_object(
    'success',true,'code','credited','reward_id',v_reward_id,
    'reward_amount_kes',v_reward
  );
end;
$function$
;
