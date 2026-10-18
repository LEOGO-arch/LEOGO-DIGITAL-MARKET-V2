-- Read-only Admin view of the same qualifying Seller earnings used in
-- public.partner_get_earnings_report: delivered + verified-paid seller orders.
-- Nairobi local business dates; amounts in KES. No write/settlement effects.
CREATE OR REPLACE FUNCTION public.admin_get_seller_earnings(p_seller_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Africa/Nairobi')::date;
  v_today_net numeric := 0;
  v_last_30_net numeric := 0;
  v_cumulative_net numeric := 0;
  v_settled numeric := 0;
  v_pending numeric := 0;
BEGIN
  IF NOT private.is_leogo_admin('sellers.read') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.seller_accounts WHERE user_id=p_seller_id) THEN
    RAISE EXCEPTION 'Seller not found';
  END IF;
  SELECT
    COALESCE(SUM(so.seller_subtotal_kes) FILTER (
      WHERE (COALESCE(so.delivered_at,o.delivered_at) AT TIME ZONE 'Africa/Nairobi')::date = v_today
    ),0),
    COALESCE(SUM(so.seller_subtotal_kes) FILTER (
      WHERE (COALESCE(so.delivered_at,o.delivered_at) AT TIME ZONE 'Africa/Nairobi')::date BETWEEN v_today-29 AND v_today
    ),0),
    COALESCE(SUM(so.seller_subtotal_kes),0)
  INTO v_today_net,v_last_30_net,v_cumulative_net
  FROM public.marketplace_seller_orders so
  JOIN public.marketplace_orders o ON o.id=so.order_id
  WHERE so.seller_id=p_seller_id
    AND so.fulfilment_status='delivered'
    AND o.payment_status='verified_paid'
    AND COALESCE(so.delivered_at,o.delivered_at) IS NOT NULL;

  SELECT COALESCE(SUM(amount_kes),0) INTO v_settled
  FROM public.seller_settlements
  WHERE seller_id=p_seller_id AND status='paid';

  SELECT COALESCE(SUM(requested_amount_kes),0) INTO v_pending
  FROM public.seller_settlement_requests
  WHERE seller_id=p_seller_id AND status IN ('pending','under_review');

  RETURN jsonb_build_object(
    'today_net_kes',round(v_today_net,2),
    'last_30_days_net_kes',round(v_last_30_net,2),
    'cumulative_net_kes',round(v_cumulative_net,2),
    'settled_total_kes',round(v_settled,2),
    'pending_settlement_kes',round(v_pending,2),
    'report_date',v_today
  );
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_get_seller_earnings(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_get_seller_earnings(uuid) TO authenticated;
