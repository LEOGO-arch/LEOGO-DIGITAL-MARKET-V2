-- Thumbnail-only backfill for previously uploaded public seller product images.
-- Does not change product records, prices, approvals, or original files.
CREATE OR REPLACE FUNCTION public.admin_list_missing_product_thumbnails(p_limit integer DEFAULT 100)
RETURNS TABLE(source_path text, thumbnail_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT private.is_leogo_admin('products.manage')
 THEN RAISE EXCEPTION 'Admin permission required'; END IF;
 IF p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid batch size'; END IF;
 RETURN QUERY
 WITH sources AS (
  SELECT p.main_image_path AS src FROM public.seller_products p
  UNION ALL
  SELECT unnest(p.gallery_image_paths) FROM public.seller_products p
  UNION ALL
  SELECT v.image_path FROM public.seller_product_variants v
 ), paths AS (
  SELECT DISTINCT src,CASE WHEN src LIKE '%-opt.webp'
   THEN regexp_replace(src,'-opt\.webp$','-thumb.webp')
   ELSE src||'-thumb.webp' END dest
  FROM sources WHERE src IS NOT NULL AND src ~ '^[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9_.-]+\.(jpg|jpeg|png|webp)$'
 )
 SELECT x.src,x.dest FROM paths x
 JOIN storage.objects original ON original.bucket_id='seller-product-media' AND original.name=x.src
 LEFT JOIN storage.objects thumb ON thumb.bucket_id='seller-product-media' AND thumb.name=x.dest
 WHERE thumb.name IS NULL ORDER BY x.src LIMIT p_limit;
END; $$;
REVOKE ALL ON FUNCTION public.admin_list_missing_product_thumbnails(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_list_missing_product_thumbnails(integer) TO authenticated;
CREATE POLICY "LEOGO admin add derived product thumbnails" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
 bucket_id='seller-product-media'
 AND private.is_leogo_admin('products.manage')
 AND name ~ '^[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9_.-]+-thumb\.webp$'
 AND EXISTS (
  SELECT 1 FROM public.seller_products p
  WHERE (
   CASE WHEN p.main_image_path LIKE '%-opt.webp' THEN regexp_replace(p.main_image_path,'-opt\.webp$','-thumb.webp')
        ELSE p.main_image_path||'-thumb.webp' END
  )=name OR EXISTS (
   SELECT 1 FROM unnest(p.gallery_image_paths) g
   WHERE (CASE WHEN g LIKE '%-opt.webp' THEN regexp_replace(g,'-opt\.webp$','-thumb.webp') ELSE g||'-thumb.webp' END)=name)
 )
 OR EXISTS (SELECT 1 FROM public.seller_product_variants v WHERE
  (CASE WHEN v.image_path LIKE '%-opt.webp' THEN regexp_replace(v.image_path,'-opt\.webp$','-thumb.webp') ELSE v.image_path||'-thumb.webp' END)=name)
 )
);
