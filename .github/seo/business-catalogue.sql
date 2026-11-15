CREATE FUNCTION public.seo_public_business_v1()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
WITH entries AS (
 SELECT 'services'::text kind,s.service_id id,s.provider_id partner_id,s.service_name title,s.business_name business,s.description description,concat_ws(', ',nullif(s.town,''),nullif(s.county,'')) location,s.price_from_kes price_from,s.price_to_kes price_to,s.pricing_model pricing_model,s.unit_label unit_label,'service-provider-public-media'::text bucket,s.profile_picture_path image_path
 FROM public.customer_public_services() s
 WHERE coalesce(s.category_name,'') !~* '(adult|sexual|alcohol|prescription|medical|health|premium)'
 UNION ALL
 SELECT 'cyber',s.id,s.provider_id,s.service_name,s.provider_name,s.description,concat_ws(', ',nullif(c.town,''),nullif(c.county,'')),s.price_kes,NULL::numeric,s.pricing_model,s.unit_label,'cyber-public-media',c.profile_picture_path
 FROM public.public_list_cyber_services(NULL) s JOIN public.public_list_cyber_shops() c ON c.provider_id=s.provider_id
 WHERE coalesce(c.availability_status,'')<>'offline'
 UNION ALL
 SELECT 'cyber',c.provider_id,c.provider_id,c.business_name,c.business_name,c.business_description,concat_ws(', ',nullif(c.town,''),nullif(c.county,'')),NULL::numeric,NULL::numeric,'quote',NULL::text,'cyber-public-media',c.profile_picture_path
 FROM public.public_list_cyber_shops() c WHERE coalesce(c.availability_status,'')<>'offline' AND (c.service_count>0 OR c.product_count>0)
 UNION ALL
 SELECT 'transport',(v->>'vehicle_id')::uuid,(v->>'provider_id')::uuid,concat_ws(' — ',v->>'provider_name',v->>'vehicle_type'),v->>'provider_name',concat_ws('. ',nullif(v->>'vehicle_type',''),nullif(v->>'make_model',''),nullif(v->>'capacity_description','')),concat_ws(', ',nullif(v->>'town',''),nullif(v->>'county','')),NULL::numeric,NULL::numeric,'quote',NULL::text,'transport-public-media',v->>'vehicle_profile_picture_path'
 FROM jsonb_array_elements(public.public_list_transport_vehicles()) v
 UNION ALL
 SELECT 'properties',p.id,NULL::uuid,p.title,NULL::text,concat_ws('. ',replace(p.house_type,'_',' '),CASE WHEN p.listing_purpose='sale' THEN 'Property for sale' ELSE 'Property for rent' END,p.description),p.county,CASE WHEN p.listing_purpose='sale' THEN p.sale_price_kes ELSE p.monthly_rent_kes END,NULL::numeric,'from',CASE WHEN p.listing_purpose='sale' THEN 'sale price' ELSE 'month' END,'vacant-house-public-media',p.photo_paths[1]
 FROM public.public_list_property_marketplace(NULL,NULL,NULL,NULL,NULL,NULL) p
 UNION ALL
 SELECT 'accommodation',p.id,p.host_id,p.property_name,p.property_name,p.description,concat_ws(', ',nullif(p.town,''),nullif(p.county,'')),(SELECT min(u.nightly_price_kes) FROM public.accommodation_units u WHERE u.property_id=p.id AND u.approval_status='approved' AND u.is_active AND u.nightly_price_kes>0),NULL::numeric,'from','night','accommodation-public-media',CASE WHEN p.cover_image_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/accommodation-public-media/' THEN regexp_replace(p.cover_image_url,'^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/accommodation-public-media/','') ELSE NULL END
 FROM public.accommodation_properties p WHERE p.approval_status='approved' AND p.is_published AND private.accommodation_host_is_public(p.host_id) AND EXISTS(SELECT 1 FROM public.accommodation_units u WHERE u.property_id=p.id AND u.approval_status='approved' AND u.is_active)
 UNION ALL
 SELECT 'sellers',s.user_id,s.user_id,s.business_name,s.business_name,'Browse approved products from this LEOGO seller.',concat_ws(', ',nullif(s.town,''),nullif(s.county,'')),NULL::numeric,NULL::numeric,'catalogue',NULL::text,'seller-product-media',min(r->>'image_path')
 FROM public.seo_branded_catalogue_v3() j CROSS JOIN LATERAL jsonb_array_elements(j) r JOIN public.seller_products p ON p.id=(r->>'id')::uuid JOIN public.seller_accounts s ON s.user_id=p.seller_id
 GROUP BY s.user_id,s.business_name,s.town,s.county
)
SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',e.kind,'id',e.id,'partner_id',e.partner_id,'title',left(e.title,250),'business',left(e.business,200),'description',left(e.description,3000),'location',left(e.location,200),'price_from',CASE WHEN e.price_from>0 THEN e.price_from END,'price_to',CASE WHEN e.price_to>0 THEN e.price_to END,'pricing_model',e.pricing_model,'unit',left(e.unit_label,80),'image_bucket',CASE WHEN o.name IS NOT NULL THEN e.bucket END,'image_path',o.name) ORDER BY e.kind,e.id),'[]'::jsonb)
FROM entries e LEFT JOIN storage.buckets b ON b.id=e.bucket AND b.public LEFT JOIN storage.objects o ON o.bucket_id=b.id AND o.name=e.image_path
WHERE NULLIF(btrim(e.title),'') IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.seo_public_business_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seo_public_business_v1() TO anon,authenticated;
