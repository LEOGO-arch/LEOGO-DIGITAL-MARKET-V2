-- Live Admin Loyalty & Rewards dashboard.

create or replace function public.admin_get_loyalty_rewards_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_settings jsonb;
  v_summary jsonb;
  v_rewards jsonb;
  v_redemptions jsonb;
begin
  if not private.is_leogo_admin('settings.manage')
     and not private.is_leogo_admin('fees.manage')
     and not private.is_leogo_admin('reports.export') then
    raise exception 'Loyalty & Rewards access required';
  end if;

  select jsonb_build_object(
    'reward_minimum_spend_kes',s.reward_minimum_spend_kes,
    'reward_rate',s.reward_rate,
    'reward_percent',s.reward_rate*100,
    'conversion','1 point = KSh 1',
    'updated_at',s.updated_at
  )
  into v_settings
  from public.wallet_settings s
  where s.id=1;

  select jsonb_build_object(
    'total_rewards_issued_kes',coalesce((select sum(r.reward_amount_kes) from public.wallet_shopping_rewards r),0),
    'rewarded_customers',coalesce((select count(distinct r.user_id) from public.wallet_shopping_rewards r),0),
    'eligible_spend_kes',coalesce((select sum(r.eligible_subtotal_kes) from public.wallet_shopping_rewards r),0),
    'reward_credit_count',coalesce((select count(*) from public.wallet_shopping_rewards r),0),
    'points_used_historical_kes',coalesce((select sum(x.redeemed_amount_kes) from public.wallet_reward_redemptions x),0),
    'active_points_value_kes',coalesce((
      select sum(greatest(0,u.points_balance))
      from (
        select l.user_id,
          sum(case
            when l.entry_type='shopping_reward' and l.direction='credit' then l.amount_kes
            when l.entry_type='reward_redemption' and l.direction='debit' then -l.amount_kes
            when l.entry_type='reward_redemption_restore' and l.direction='credit' then l.amount_kes
            else 0 end
          ) as points_balance
        from public.wallet_ledger_entries l
        group by l.user_id
      ) u
    ),0)
  )
  into v_summary;

  select coalesce(jsonb_agg(row_data order by (row_data->>'credited_at')::timestamptz desc),'[]'::jsonb)
  into v_rewards
  from (
    select jsonb_build_object(
      'id',r.id,
      'customer_id',r.user_id,
      'customer_name',coalesce(cp.full_name,u.email::text,'LEOGO Customer'),
      'customer_phone',cp.phone,
      'order_reference',r.order_reference,
      'eligible_subtotal_kes',r.eligible_subtotal_kes,
      'reward_rate',r.reward_rate,
      'reward_amount_kes',r.reward_amount_kes,
      'credit_source',r.credit_source,
      'credited_at',r.created_at
    ) row_data
    from public.wallet_shopping_rewards r
    left join public.customer_profiles cp on cp.user_id=r.user_id
    left join auth.users u on u.id=r.user_id
    order by r.created_at desc
    limit 100
  ) q;

  select coalesce(jsonb_agg(row_data order by (row_data->>'applied_at')::timestamptz desc),'[]'::jsonb)
  into v_redemptions
  from (
    select jsonb_build_object(
      'id',x.id,
      'customer_id',x.user_id,
      'customer_name',coalesce(cp.full_name,u.email::text,'LEOGO Customer'),
      'order_reference',x.order_reference,
      'redeemed_amount_kes',x.redeemed_amount_kes,
      'status',x.status,
      'applied_at',x.applied_at,
      'restored_at',x.restored_at
    ) row_data
    from public.wallet_reward_redemptions x
    left join public.customer_profiles cp on cp.user_id=x.user_id
    left join auth.users u on u.id=x.user_id
    order by x.applied_at desc
    limit 100
  ) q;

  return jsonb_build_object(
    'settings',coalesce(v_settings,'{}'::jsonb),
    'summary',coalesce(v_summary,'{}'::jsonb),
    'recent_rewards',coalesce(v_rewards,'[]'::jsonb),
    'recent_redemptions',coalesce(v_redemptions,'[]'::jsonb)
  );
end
$function$;

revoke execute on function public.admin_get_loyalty_rewards_dashboard() from public,anon;
grant execute on function public.admin_get_loyalty_rewards_dashboard() to authenticated;
