CREATE FUNCTION public.seo_branded_catalogue_v3()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT COALESCE(jsonb_agg(e.row || jsonb_build_object(
 'description',left(p.product_details,4000),
 'image_path',CASE WHEN p.main_image_path LIKE p.seller_id::text || '/%' AND EXISTS(SELECT 1 FROM storage.objects o JOIN storage.buckets b ON b.id=o.bucket_id WHERE o.bucket_id='seller-product-media' AND b.public AND o.name=p.main_image_path) THEN p.main_image_path ELSE NULL END,
 'gallery',COALESCE((SELECT jsonb_agg(x.path ORDER BY x.ord) FROM unnest(p.gallery_image_paths) WITH ORDINALITY x(path,ord) WHERE x.ord<=8 AND x.path LIKE p.seller_id::text || '/%' AND EXISTS(SELECT 1 FROM storage.objects o JOIN storage.buckets b ON b.id=o.bucket_id WHERE o.bucket_id='seller-product-media' AND b.public AND o.name=x.path)),'[]'::jsonb),
 'variants',CASE WHEN p.has_variants THEN COALESCE((SELECT jsonb_agg(jsonb_build_object(
 'name',left(v.variant_name,200),
 'price_kes',CASE WHEN COALESCE(v.leogo_price_kes,v.price_kes)>0 THEN CASE WHEN p.flash_sale_requested AND p.flash_sale_status='approved' AND p.flash_sale_starts_at<=now() AND p.flash_sale_ends_at>now() AND p.flash_sale_price_kes>0 AND p.flash_sale_quantity>0 THEN LEAST(COALESCE(v.leogo_price_kes,v.price_kes),LEAST(p.price_kes,p.flash_sale_price_kes)+COALESCE(p.leogo_price_kes,p.price_kes)-p.price_kes) ELSE COALESCE(v.leogo_price_kes,v.price_kes) END ELSE NULL END,
 'available',p.availability_status='available' AND v.quantity_available>0,
 'image_path',CASE WHEN v.image_path LIKE p.seller_id::text || '/%' AND EXISTS(SELECT 1 FROM storage.objects o JOIN storage.buckets b ON b.id=o.bucket_id WHERE o.bucket_id='seller-product-media' AND b.public AND o.name=v.image_path) THEN v.image_path ELSE NULL END
 ) ORDER BY v.display_order,v.created_at,v.id) FROM public.seller_product_variants v WHERE v.product_id=p.id AND v.is_active AND NULLIF(btrim(v.variant_name),'') IS NOT NULL),'[]'::jsonb) ELSE '[]'::jsonb END
 ) ORDER BY p.id),'[]'::jsonb)
 FROM jsonb_array_elements(public.seo_static_catalogue_v2()) e(row)
 JOIN public.seller_products p ON p.id=(e.row->>'id')::uuid;
$$;
REVOKE ALL ON FUNCTION public.seo_branded_catalogue_v3() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seo_branded_catalogue_v3() TO anon,authenticated;
