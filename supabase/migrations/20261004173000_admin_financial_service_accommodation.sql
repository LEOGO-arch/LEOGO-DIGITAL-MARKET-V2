-- Connect Service Provider and Accommodation earnings to the Admin Financial Overview
-- without changing the existing marketplace/order dashboard RPC.

create or replace function public.admin_financial_overview_service_accommodation(
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := coalesce(p_from, date_trunc('day', now()));
  v_to timestamptz := coalesce(p_to, now());
  v_service_rate numeric := 0.10;
  v_service_request_fees numeric := 0;
  v_service_commission numeric := 0;
  v_accommodation_hotel_commission numeric := 0;
  v_accommodation_service_fees numeric := 0;
  v_accommodation_revenue numeric := 0;
begin
  if not private.is_leogo_admin('dashboard.read') then
    raise exception 'Admin access required';
  end if;
  if v_to <= v_from then
    raise exception 'Invalid reporting range';
  end if;

  select coalesce(referral_commission_rate,0.10)
  into v_service_rate
  from public.service_marketplace_settings
  where id=1;
  v_service_rate := coalesce(v_service_rate,0.10);

  -- Direct-request / quotation fees become LEOGO revenue only after Admin
  -- has verified the submitted service payment.
  select coalesce(sum(
    coalesce(r.direct_request_fee_kes,0) + coalesce(r.quotation_fee_kes,0)
  ),0)
  into v_service_request_fees
  from public.service_requests r
  where r.payment_status='verified'
    and r.payment_verified_at is not null
    and r.payment_verified_at >= v_from
    and r.payment_verified_at < v_to;

  -- Referral commission is earned when the provider completes the job.
  -- This intentionally mirrors the existing Service Provider earnings logic.
  select coalesce(sum(
    round(coalesce(r.provider_labour_kes,r.provider_quote_kes,0) * v_service_rate,2)
  ),0)
  into v_service_commission
  from public.service_requests r
  where r.request_status='completed'
    and r.completed_at is not null
    and coalesce(r.provider_labour_kes,r.provider_quote_kes,0) > 0
    and r.completed_at >= v_from
    and r.completed_at < v_to;

  -- Accommodation bookings already snapshot the Admin-controlled hotel
  -- commission and customer service fee at booking time. Pending/rejected/
  -- cancelled bookings are excluded from recognized dashboard revenue.
  select
    coalesce(sum(b.hotel_commission_kes),0),
    coalesce(sum(b.customer_service_fee_kes),0),
    coalesce(sum(b.leogo_revenue_kes),0)
  into
    v_accommodation_hotel_commission,
    v_accommodation_service_fees,
    v_accommodation_revenue
  from public.accommodation_bookings b
  where b.booking_status in ('accepted','completed')
    and b.created_at >= v_from
    and b.created_at < v_to;

  return jsonb_build_object(
    'range',jsonb_build_object('from',v_from,'to',v_to),
    'service',jsonb_build_object(
      'supported',true,
      'request_fees_kes',round(v_service_request_fees,2),
      'referral_commission_kes',round(v_service_commission,2),
      'referral_commission_rate',v_service_rate,
      'leogo_revenue_kes',round(v_service_request_fees+v_service_commission,2)
    ),
    'accommodation',jsonb_build_object(
      'supported',true,
      'hotel_commission_kes',round(v_accommodation_hotel_commission,2),
      'customer_service_fee_kes',round(v_accommodation_service_fees,2),
      'leogo_revenue_kes',round(v_accommodation_revenue,2)
    ),
    'total_additional_leogo_revenue_kes',
      round(v_service_request_fees+v_service_commission+v_accommodation_revenue,2)
  );
end;
$$;

revoke all on function public.admin_financial_overview_service_accommodation(timestamptz,timestamptz) from public;
revoke all on function public.admin_financial_overview_service_accommodation(timestamptz,timestamptz) from anon;
grant execute on function public.admin_financial_overview_service_accommodation(timestamptz,timestamptz) to authenticated;

notify pgrst, 'reload schema';
