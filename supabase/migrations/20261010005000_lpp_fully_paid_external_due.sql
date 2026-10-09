-- A fully paid Lipa Pole Pole account has no external amount still due when
-- it is converted into the normal marketplace fulfilment workflow.
-- Preserve existing reward-point amount-due behavior for every other payment method.

create or replace function private.sync_marketplace_reward_amount_due()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  new.reward_points_redeemed_kes:=greatest(0,coalesce(new.reward_points_redeemed_kes,0));

  if new.payment_method='lipa_pole_pole' then
    new.external_amount_due_kes:=0;
    return new;
  end if;

  if tg_op='INSERT' then
    new.external_amount_due_kes:=greatest(
      0,
      round(coalesce(new.grand_total_kes,0)-coalesce(new.reward_points_redeemed_kes,0),2)
    );
  elsif new.grand_total_kes is distinct from old.grand_total_kes
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
