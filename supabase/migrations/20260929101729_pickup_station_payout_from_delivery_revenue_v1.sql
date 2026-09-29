CREATE OR REPLACE FUNCTION public.admin_production_dashboard(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_from timestamptz := coalesce(p_from, date_trunc('day', now()));
  v_to timestamptz := coalesce(p_to, now());
  v_pending_approvals bigint;
  v_premium_revenue numeric;
  v_statement_revenue numeric;
  v_missing_assignments bigint;
  v_inactive_assignments bigint;

  v_orders bigint;
  v_gross_sales numeric;
  v_platform_fees numeric;
  v_delivery_fees numeric;
  v_pickup_fees numeric;
  v_pickup_station_payouts numeric:=0;
  v_active_deliveries bigint;
begin
  if not private.is_leogo_admin('dashboard.read') then
    raise exception 'Admin access required';
  end if;
  if v_to <= v_from then raise exception 'Invalid reporting range'; end if;

  select
    (select count(*) from public.premium_customers where application_status in ('submitted','under_review')) +
    (select count(*) from public.premium_profiles where application_status in ('submitted','under_review')) +
    (select count(*) from public.premium_membership_payments where payment_status='pending') +
    (select count(*) from public.wallet_deposit_requests where request_status='pending') +
    (select count(*) from public.wallet_loan_applications where application_status in ('pending','under_review')) +
    (select count(*) from public.wallet_withdrawal_requests where request_status in ('pending_call','approved_processing')) +
    (select count(*) from public.accommodation_hosts where verification_status in ('pending','under_review')) +
    (select count(*) from public.accommodation_properties where approval_status in ('submitted','under_review'))
  into v_pending_approvals;

  select coalesce(sum(amount_kes),0) into v_premium_revenue
  from public.premium_membership_payments
  where payment_status in ('confirmed','approved')
    and reviewed_at >= v_from and reviewed_at < v_to;

  select coalesce(sum(fee_amount_kes),0) into v_statement_revenue
  from public.wallet_statement_downloads
  where requested_at >= v_from and requested_at < v_to;

  select
    count(*),
    coalesce(sum(case when o.order_status <> 'cancelled' then o.grand_total_kes else 0 end),0),
    coalesce(sum(case when o.order_status <> 'cancelled' then o.service_fee_kes else 0 end),0),
    coalesce(sum(case when o.order_status <> 'cancelled' then o.delivery_fee_kes else 0 end),0),
    coalesce(sum(case when o.order_status <> 'cancelled' then o.pickup_fee_kes else 0 end),0)
  into v_orders,v_gross_sales,v_platform_fees,v_delivery_fees,v_pickup_fees
  from public.marketplace_orders o
  where o.created_at >= v_from and o.created_at < v_to;

  select coalesce(sum(p.earnings_amount_kes),0)
  into v_pickup_station_payouts
  from public.pickup_station_parcels p
  where p.status='handed_over'
    and p.earning_source='delivery_fee'
    and p.handed_over_at >= v_from and p.handed_over_at < v_to;

  select count(*) into v_active_deliveries
  from public.marketplace_delivery_jobs d
  where d.status in (
    'awaiting_assignment','assigned','picked_up',
    'arrived_sorting_center','sorting_received',
    'ready_for_dispatch','on_the_way','ready_for_pickup'
  );

  select count(*) into v_missing_assignments
  from unnest(array[
    'wallet_sacco_deposits','savings_challenge','loan_repayment','marketplace_orders',
    'lipa_pole_pole','premium_payments','accommodation_payments','service_payments',
    'transport_payments'
  ]) f(code)
  where not exists (
    select 1 from public.payment_account_assignments a
    where a.function_code=f.code
  );

  select count(*) into v_inactive_assignments
  from public.payment_account_assignments a
  join public.payment_accounts p on p.id=a.account_id
  where p.status <> 'active';

  return jsonb_build_object(
    'range',jsonb_build_object('from',v_from,'to',v_to),

    'top',jsonb_build_object(
      'orders',jsonb_build_object('supported',true,'value',v_orders),
      'gross_sales',jsonb_build_object('supported',true,'value',v_gross_sales),
      'leogo_revenue',jsonb_build_object(
        'supported',true,
        'value',v_platform_fees+v_delivery_fees+v_pickup_fees+v_premium_revenue+v_statement_revenue-v_pickup_station_payouts
      ),
      'pending_approvals',jsonb_build_object('supported',true,'value',v_pending_approvals),
      'active_deliveries',jsonb_build_object('supported',true,'value',v_active_deliveries)
    ),

    'revenue',jsonb_build_object(
      'gross_order_sales',jsonb_build_object('supported',true,'value',v_gross_sales),
      'platform_fees',jsonb_build_object('supported',true,'value',v_platform_fees),
      'delivery_fees',jsonb_build_object('supported',true,'value',v_delivery_fees-v_pickup_station_payouts),
      'delivery_fees_gross',jsonb_build_object('supported',true,'value',v_delivery_fees),
      'pickup_station_partner_payouts',jsonb_build_object('supported',true,'value',v_pickup_station_payouts),
      'pickup_fees',jsonb_build_object('supported',true,'value',v_pickup_fees),
      'premium',jsonb_build_object('supported',true,'value',v_premium_revenue),
      'service_commission',jsonb_build_object('supported',false,'value',null),
      'accommodation_commission',jsonb_build_object('supported',false,'value',null),
      'other',jsonb_build_object('supported',true,'value',v_statement_revenue),
      'total_leogo',v_platform_fees+v_delivery_fees+v_pickup_fees+v_premium_revenue+v_statement_revenue-v_pickup_station_payouts
    ),

    'wallet',jsonb_build_object(
      'deposits',(select coalesce(sum(requested_amount_kes),0) from public.wallet_deposit_requests where submitted_at>=v_from and submitted_at<v_to),
      'withdrawals',(select coalesce(sum(requested_amount_kes),0) from public.wallet_withdrawal_requests where submitted_at>=v_from and submitted_at<v_to),
      'savings_deposits',(select coalesce(sum(requested_amount_kes),0) from public.wallet_deposit_requests where deposit_kind='challenge' and submitted_at>=v_from and submitted_at<v_to),
      'pending_deposits',(select count(*) from public.wallet_deposit_requests where request_status='pending'),
      'pending_withdrawals',(select count(*) from public.wallet_withdrawal_requests where request_status in ('pending_call','approved_processing')),
      'active_challenges',(select count(*) from public.wallet_challenges where challenge_status='active'),
      'loan_applications',(select count(*) from public.wallet_loan_applications where application_status in ('pending','under_review')),
      'active_loans',jsonb_build_object('supported',false,'value',null),
      'overdue_loans',jsonb_build_object('supported',false,'value',null),
      'loan_repayments',jsonb_build_object('supported',false,'value',null)
    ),

    'network',jsonb_build_object(
      'customers',jsonb_build_object('supported',true,'value',(select count(*) from public.customer_profiles)),
      'sellers',jsonb_build_object('supported',true,'value',(select count(*) from public.seller_accounts where application_status='approved')),
      'service_providers',jsonb_build_object('supported',true,'value',(select count(*) from public.service_provider_accounts where application_status='approved')),
      'transport_providers',jsonb_build_object('supported',false,'value',null),
      'premium_profiles',jsonb_build_object('supported',true,'value',(select count(*) from public.premium_profiles where application_status='approved')),
      'accommodation_providers',jsonb_build_object('supported',true,'value',(select count(*) from public.accommodation_hosts where verification_status='approved')),
      'products',jsonb_build_object('supported',true,'value',(select count(*) from public.seller_products where product_approval_status='approved' and listing_status='active')),
      'pickup_stations',jsonb_build_object('supported',true,'value',(select count(*) from public.pickup_stations where is_active))
    ),

    'delivery',jsonb_build_object(
      'supported',true,
      'awaiting_assignment',(select count(*) from public.marketplace_delivery_jobs where status='awaiting_assignment'),
      'assigned',(select count(*) from public.marketplace_delivery_jobs where status='assigned'),
      'picked_up',(select count(*) from public.marketplace_delivery_jobs where status='picked_up'),
      'sorting_center',(
        select count(*) from public.marketplace_delivery_jobs
        where status in ('arrived_sorting_center','sorting_received')
      ),
      'ready_for_dispatch',(select count(*) from public.marketplace_delivery_jobs where status='ready_for_dispatch'),
      'on_the_way',(select count(*) from public.marketplace_delivery_jobs where status='on_the_way'),
      'delivered',(select count(*) from public.marketplace_delivery_jobs where status='delivered'),
      'problems',(select count(*) from public.marketplace_delivery_jobs where status in ('failed','cancelled'))
    ),

    'recent_orders',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',x.id,
          'order_reference',x.order_reference,
          'customer',x.receiver_name,
          'amount',x.grand_total_kes,
          'payment_status',x.payment_status,
          'order_status',x.order_status,
          'delivery_status',x.delivery_status,
          'created_at',x.created_at
        )
        order by x.created_at desc
      )
      from (
        select
          o.id,o.order_reference,o.receiver_name,o.grand_total_kes,
          o.payment_status,o.order_status,o.created_at,d.status as delivery_status
        from public.marketplace_orders o
        left join public.marketplace_delivery_jobs d on d.order_id=o.id
        order by o.created_at desc
        limit 8
      ) x
    ),'[]'::jsonb),

    'alerts',coalesce((
      select jsonb_agg(alert)
      from (values
        (case when v_missing_assignments>0 then jsonb_build_object(
          'level','warning','title','Payment functions need accounts',
          'detail',v_missing_assignments||' payment function(s) have no assigned account.',
          'view','settings','tab','assignments'
        ) end),
        (case when v_inactive_assignments>0 then jsonb_build_object(
          'level','danger','title','Inactive payment destination assigned',
          'detail',v_inactive_assignments||' function assignment(s) point to an inactive account.',
          'view','settings','tab','assignments'
        ) end)
      ) a(alert)
      where alert is not null
    ),'[]'::jsonb),

    'recent_admin_activity',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',x.id,'admin',coalesce(x.actor_email,'System'),
          'action',x.action,'entity',x.entity_type,
          'reference',x.entity_id,'created_at',x.created_at
        )
        order by x.created_at desc
      )
      from (
        select * from public.admin_audit_log
        order by created_at desc
        limit 8
      ) x
    ),'[]'::jsonb),

    'generated_at',now()
  );
end;
$function$;
