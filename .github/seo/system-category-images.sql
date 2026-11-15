CREATE TABLE private.system_category_images (
 code text PRIMARY KEY CHECK(code IN ('services','cyber-branding','accommodation','transport','vacant-houses')),
 id uuid NOT NULL UNIQUE,
 image_path text
);
ALTER TABLE private.system_category_images ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.system_category_images FROM PUBLIC,anon,authenticated;
INSERT INTO private.system_category_images(code,id) VALUES
('services','10000000-0000-4000-8000-000000000001'),
('cyber-branding','10000000-0000-4000-8000-000000000002'),
('accommodation','10000000-0000-4000-8000-000000000003'),
('transport','10000000-0000-4000-8000-000000000004'),
('vacant-houses','10000000-0000-4000-8000-000000000005');
CREATE FUNCTION public.admin_system_category_images() RETURNS TABLE(code text,id uuid,image_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT private.is_leogo_admin('products.read') THEN RAISE EXCEPTION 'Admin access required'; END IF;
 RETURN QUERY SELECT s.code,s.id,s.image_path FROM private.system_category_images s ORDER BY s.code;
END;$$;
REVOKE ALL ON FUNCTION public.admin_system_category_images() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_system_category_images() TO authenticated;
CREATE FUNCTION public.admin_set_system_category_image(p_code text,p_image_path text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT private.is_leogo_admin('products.manage') THEN RAISE EXCEPTION 'Admin permission required'; END IF;
 SELECT s.id INTO v_id FROM private.system_category_images s WHERE s.code=p_code;
 IF v_id IS NULL THEN RAISE EXCEPTION 'Unknown system category'; END IF;
 IF p_image_path IS NOT NULL THEN
 IF p_image_path !~ '^categories/[a-f0-9-]{36}/[a-zA-Z0-9_-]+[.]webp$' OR split_part(p_image_path,'/',2)<>v_id::text THEN RAISE EXCEPTION 'Invalid category image'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='category-public-media' AND name=p_image_path) THEN RAISE EXCEPTION 'Image upload not found'; END IF;
 END IF;
 UPDATE private.system_category_images SET image_path=p_image_path WHERE code=p_code;
 RETURN jsonb_build_object('code',p_code,'image_path',p_image_path);
END;$$;
REVOKE ALL ON FUNCTION public.admin_set_system_category_image(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_system_category_image(text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.customer_category_images() RETURNS TABLE(code text,image_path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT c.code,c.image_path FROM public.product_categories c WHERE c.is_active AND c.image_path IS NOT NULL
 UNION ALL SELECT s.code,s.image_path FROM private.system_category_images s WHERE s.image_path IS NOT NULL;
$$;
