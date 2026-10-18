-- LEOGO Seller stability: retain campaign expiry maintenance while isolating failures.
-- The existing product-read RPC is a known campaign-expiry lifecycle entry point.
-- Until an independent expiry worker is proven, do not remove it.
-- Errors in campaign maintenance must not prevent sellers from loading their products.
CREATE OR REPLACE FUNCTION public.seller_list_own_products()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.seller_accounts s
    WHERE s.user_id = v_uid AND s.application_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Approved Seller account required';
  END IF;

  BEGIN
    PERFORM private.close_expired_group_campaigns();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Seller listing: campaign expiry maintenance failed (SQLSTATE %)', SQLSTATE;
  END;

  SELECT COALESCE(
    jsonb_agg(product_row ORDER BY (product_row->>'updated_at')::timestamptz DESC),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT to_jsonb(p) || jsonb_build_object(
      'seller_product_variants', COALESCE(
        (SELECT jsonb_agg(to_jsonb(v) ORDER BY v.display_order, v.created_at)
         FROM public.seller_product_variants v WHERE v.product_id = p.id),
        '[]'::jsonb
      ),
      'shipping_profile',
        (SELECT to_jsonb(s) FROM public.product_shipping_profiles s WHERE s.product_id = p.id),
      'group_campaign',
        (SELECT to_jsonb(g) FROM public.group_order_campaigns g
         WHERE g.product_id = p.id ORDER BY g.created_at DESC LIMIT 1)
    ) AS product_row
    FROM public.seller_products p
    WHERE p.seller_id = v_uid
  ) q;

  RETURN v_result;
END;
$function$;
