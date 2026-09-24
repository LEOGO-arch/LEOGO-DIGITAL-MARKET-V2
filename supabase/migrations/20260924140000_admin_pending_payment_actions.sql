-- Provide one Admin Dashboard queue for every implemented payment type that
-- is waiting for manual verification.

create or replace function public.admin_list_pending_payment_actions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  if not private.is_leogo_admin('approvals.read')
     and not private.is_leogo_admin('orders.payment_verify') then
    raise exception 'Admin access required';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'kind', q.kind,
        'record_id', q.record_id,
        'title', q.title,
        'detail', q.detail,
        'customer_name', q.customer_name,
        'amount_kes', q.amount_kes,
        'payment_reference', q.payment_reference,
        'submitted_at', q.submitted_at,
        'view', q.view_name,
        'tab', q.tab_name
      )
      order by q.submitted_at desc, q.kind, q.record_id
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      'marketplace_payment'::text as kind,
      o.id as record_id,
      'Marketplace order payment'::text as title,
      o.order_reference || ' · ' || coalesce(o.payment_method,'Payment') as detail,
      coalesce(nullif(o.receiver_name,''),cp.full_name,'Customer') as customer_name,
      o.grand_total_kes::numeric as amount_kes,
      null::text as payment_reference,
      o.created_at as submitted_at,
      'orders'::text as view_name,
      ''::text as tab_name
    from public.marketplace_orders o
    left join public.customer_profiles cp on cp.user_id=o.customer_id
    where o.payment_status='submitted'

    union all

    select
      'wallet_deposit',
      d.id,
      case
        when d.deposit_kind='daily_challenge' then 'Savings challenge payment'
        else 'Wallet deposit payment'
      end,
      'Ref ' || d.payment_reference,
      coalesce(cp.full_name,'Wallet Customer'),
      d.requested_amount_kes::numeric,
      d.payment_reference,
      d.submitted_at,
      'wallet',
      'deposits'
    from public.wallet_deposit_requests d
    left join public.customer_profiles cp on cp.user_id=d.user_id
    where d.request_status='pending'

    union all

    select
      'premium_payment',
      p.id,
      'Premium membership payment',
      p.plan_name || ' · Ref ' || p.payment_reference,
      coalesce(cp.full_name,'Premium Customer'),
      p.amount_kes::numeric,
      p.payment_reference,
      p.submitted_at,
      'premium',
      'subscriptions'
    from public.premium_membership_payments p
    left join public.customer_profiles cp on cp.user_id=p.user_id
    where p.payment_status='pending'

    union all

    select
      'service_payment',
      r.id,
      case
        when r.request_type='direct' then 'Direct service request fee'
        else 'Service quotation fee'
      end,
      r.request_reference || ' · ' || s.service_name || ' · Ref ' || r.payment_reference,
      coalesce(cp.full_name,'Service Customer'),
      case
        when r.request_type='direct' then r.direct_request_fee_kes
        else r.quotation_fee_kes
      end,
      r.payment_reference,
      r.created_at,
      'providers',
      ''
    from public.service_requests r
    join public.service_provider_services s on s.id=r.service_id
    left join public.customer_profiles cp on cp.user_id=r.customer_id
    where r.payment_status='pending_verification'
  ) q;

  return v_rows;
end;
$$;

revoke all on function public.admin_list_pending_payment_actions() from public;
grant execute on function public.admin_list_pending_payment_actions() to authenticated;
