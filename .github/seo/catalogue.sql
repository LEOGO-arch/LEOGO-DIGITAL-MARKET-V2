CREATE FUNCTION public.seo_static_catalogue_v2()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
 'id',p.id,'name',p.product_name,'category',c.code,'category_name',c.name,
 'regular_price_kes',CASE WHEN p.has_variants IS FALSE AND NOT COALESCE(sp.international_order_enabled,false) AND NOT COALESCE(sp.moq_enabled,false) AND (sp.local_price_kes IS NULL OR sp.local_price_kes=COALESCE(p.leogo_price_kes,p.price_kes)) AND COALESCE(p.leogo_price_kes,p.price_kes)>0 THEN COALESCE(p.leogo_price_kes,p.price_kes) ELSE NULL END,
 'current_price_kes',CASE WHEN p.has_variants IS FALSE AND NOT COALESCE(sp.international_order_enabled,false) AND NOT COALESCE(sp.moq_enabled,false) AND (sp.local_price_kes IS NULL OR sp.local_price_kes=COALESCE(p.leogo_price_kes,p.price_kes)) AND COALESCE(p.leogo_price_kes,p.price_kes)>0 THEN CASE WHEN p.flash_sale_requested AND p.flash_sale_status='approved' AND p.flash_sale_starts_at<=now() AND p.flash_sale_ends_at>now() AND p.flash_sale_price_kes>0 AND p.flash_sale_quantity>0 THEN LEAST(COALESCE(p.leogo_price_kes,p.price_kes),LEAST(p.price_kes,p.flash_sale_price_kes)+COALESCE(p.leogo_price_kes,p.price_kes)-p.price_kes) ELSE COALESCE(p.leogo_price_kes,p.price_kes) END ELSE NULL END,
 'availability',CASE WHEN p.availability_status='out_of_stock' THEN 'out_of_stock' WHEN p.has_variants IS FALSE AND p.quantity_available>0 THEN 'available' ELSE 'check_live' END
 ) ORDER BY p.id),'[]'::jsonb)
 FROM public.seller_products p JOIN public.seller_accounts s ON s.user_id=p.seller_id
 JOIN public.product_categories c ON c.id=p.category_id LEFT JOIN public.product_shipping_profiles sp ON sp.product_id=p.id
 WHERE s.application_status='approved' AND private.partner_has_active_subscription(s.user_id,'seller')
 AND p.product_approval_status='approved' AND p.listing_status='active'
 AND p.availability_status IN ('available','out_of_stock') AND c.is_active
 AND c.restricted_category IS FALSE AND c.is_aggregator IS FALSE
 AND c.code IN ('food_drinks','groceries','dry_goods','bookshop','hardware','garments_clothes_footwear','jewelry','electronics_bcfe08f')
 AND p.fulfilment_type='normal' AND COALESCE(sp.local_available,true)
 AND NULLIF(btrim(p.product_name),'') IS NOT NULL
 AND length(p.product_name)<=250;
$$;
REVOKE ALL ON FUNCTION public.seo_static_catalogue_v2() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seo_static_catalogue_v2() TO anon,authenticated;
