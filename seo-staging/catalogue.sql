-- STAGING ONLY. Remove synthetic category before production review.
CREATE FUNCTION public.seo_public_catalogue_v1()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
 'id',p.id,'name',p.product_name,'description',p.product_details,
 'category',c.code,'category_name',c.name,'image_path',p.main_image_path,
 'price_kes',CASE WHEN p.flash_sale_requested AND p.flash_sale_status='approved'
 AND p.flash_sale_starts_at<=now() AND p.flash_sale_ends_at>now()
 AND p.flash_sale_price_kes>0 AND p.flash_sale_quantity>0
 THEN LEAST(COALESCE(p.leogo_price_kes,p.price_kes),LEAST(p.price_kes,p.flash_sale_price_kes)+COALESCE(p.leogo_price_kes,p.price_kes)-p.price_kes)
 ELSE COALESCE(p.leogo_price_kes,p.price_kes) END,
 'available',p.availability_status='available' AND p.quantity_available>0
 ) ORDER BY p.id),'[]'::jsonb)
 FROM public.seller_products p JOIN public.seller_accounts s ON s.user_id=p.seller_id
 JOIN public.product_categories c ON c.id=p.category_id
 LEFT JOIN public.product_shipping_profiles sp ON sp.product_id=p.id
 WHERE s.application_status='approved' AND private.partner_has_active_subscription(s.user_id,'seller')
 AND p.product_approval_status='approved' AND p.listing_status='active'
 AND p.availability_status IN ('available','out_of_stock') AND c.is_active
 AND c.restricted_category IS FALSE AND c.is_aggregator IS FALSE
 AND c.code IN ('phase1_artificial','food_drinks','groceries','dry_goods','bookshop','hardware','garments_clothes_footwear','jewelry','electronics_bcfe08f')
 AND p.fulfilment_type='normal' AND p.has_variants IS FALSE
 AND COALESCE(sp.local_available,true) AND NOT COALESCE(sp.international_order_enabled,false)
 AND NOT COALESCE(sp.moq_enabled,false)
 AND (sp.local_price_kes IS NULL OR sp.local_price_kes=COALESCE(p.leogo_price_kes,p.price_kes))
 AND COALESCE(p.leogo_price_kes,p.price_kes)>0
 AND NULLIF(btrim(p.product_name),'') IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.seo_public_catalogue_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seo_public_catalogue_v1() TO anon,authenticated;
