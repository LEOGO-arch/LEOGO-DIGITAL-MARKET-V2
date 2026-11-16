-- Read-only public optimized media manifest plus admin-only historical derivative generation.
-- Product and variant image paths are not rewritten. Original files remain intact.
CREATE FUNCTION private.is_catalogue_optimized_target(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
WITH sources AS (
 SELECT p.main_image_path path FROM public.seller_products p
 UNION ALL SELECT unnest(p.gallery_image_paths) FROM public.seller_products p
 UNION ALL SELECT v.image_path FROM public.seller_product_variants v
)
SELECT EXISTS(
 SELECT 1 FROM sources WHERE path IS NOT NULL
 AND path ~ '^[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9_.-]+\.(jpg|jpeg|png|webp)$'
 AND path NOT LIKE '%-opt.webp'
 AND path||'-opt.webp'=p_name
);
$$;
REVOKE ALL ON FUNCTION private.is_catalogue_optimized_target(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_catalogue_optimized_target(text) TO authenticated;
CREATE POLICY "LEOGO admin add derived optimized product media" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
 bucket_id='seller-product-media'
 AND private.is_leogo_admin('products.manage')
 AND name ~ '^[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9_.-]+\.(jpg|jpeg|png|webp)-opt\.webp$'
 AND private.is_catalogue_optimized_target(name)
);
CREATE FUNCTION public.admin_list_missing_product_media_derivatives(p_limit integer DEFAULT 100)
RETURNS TABLE(source_path text, optimized_path text, thumbnail_path text, needs_optimized boolean, needs_thumbnail boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT private.is_leogo_admin('products.manage')
 THEN RAISE EXCEPTION 'Admin permission required'; END IF;
 IF p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid batch size'; END IF;
 RETURN QUERY
 WITH sources AS (
  SELECT p.main_image_path src FROM public.seller_products p
  UNION ALL SELECT unnest(p.gallery_image_paths) FROM public.seller_products p
  UNION ALL SELECT v.image_path FROM public.seller_product_variants v
 ), paths AS (
  SELECT DISTINCT src,CASE WHEN src LIKE '%-opt.webp' THEN src ELSE src||'-opt.webp' END detail,
   CASE WHEN src LIKE '%-opt.webp' THEN regexp_replace(src,'-opt\.webp$','-thumb.webp') ELSE src||'-thumb.webp' END thumb
  FROM sources WHERE src IS NOT NULL AND src ~ '^[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9_.-]+\.(jpg|jpeg|png|webp)$'
 )
 SELECT x.src,x.detail,x.thumb,
   (x.detail<>x.src AND detail.name IS NULL),
   (thumb.name IS NULL)
 FROM paths x
 JOIN storage.objects original ON original.bucket_id='seller-product-media' AND original.name=x.src
 LEFT JOIN storage.objects detail ON detail.bucket_id='seller-product-media' AND detail.name=x.detail
 LEFT JOIN storage.objects thumb ON thumb.bucket_id='seller-product-media' AND thumb.name=x.thumb
 WHERE (x.detail<>x.src AND detail.name IS NULL) OR thumb.name IS NULL
 ORDER BY x.src LIMIT p_limit;
END;$$;
REVOKE ALL ON FUNCTION public.admin_list_missing_product_media_derivatives(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_list_missing_product_media_derivatives(integer) TO authenticated;
CREATE FUNCTION public.public_catalogue_image_derivatives()
RETURNS TABLE(source_path text, optimized_path text, thumbnail_path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
WITH eligible AS (
 SELECT p.id,p.main_image_path,p.gallery_image_paths
 FROM public.seller_products p
 JOIN public.seller_accounts s ON s.user_id=p.seller_id
 JOIN public.product_categories c ON c.id=p.category_id
 WHERE s.application_status='approved'
 AND private.partner_has_active_subscription(s.user_id,'seller')
 AND p.product_approval_status='approved' AND p.listing_status='active'
 AND c.is_active AND c.restricted_category IS FALSE
), sources AS (
 SELECT e.main_image_path AS src FROM eligible e
 UNION ALL SELECT unnest(e.gallery_image_paths) FROM eligible e
 UNION ALL SELECT v.image_path FROM public.seller_product_variants v JOIN eligible e ON e.id=v.product_id WHERE v.is_active
), paths AS (
 SELECT DISTINCT src,CASE WHEN src LIKE '%-opt.webp' THEN src ELSE src||'-opt.webp' END detail,
 CASE WHEN src LIKE '%-opt.webp' THEN regexp_replace(src,'-opt\.webp$','-thumb.webp') ELSE src||'-thumb.webp' END thumb
 FROM sources WHERE src IS NOT NULL AND src ~ '^[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9_.-]+\.(jpg|jpeg|png|webp)$'
)
SELECT x.src,
 CASE WHEN d.name IS NOT NULL THEN x.detail END,
 CASE WHEN t.name IS NOT NULL THEN x.thumb END
FROM paths x
JOIN storage.objects o ON o.bucket_id='seller-product-media' AND o.name=x.src
LEFT JOIN storage.objects d ON d.bucket_id='seller-product-media' AND d.name=x.detail
LEFT JOIN storage.objects t ON t.bucket_id='seller-product-media' AND t.name=x.thumb
ORDER BY x.src;
$$;
REVOKE ALL ON FUNCTION public.public_catalogue_image_derivatives() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_catalogue_image_derivatives() TO anon,authenticated;
