CREATE OR REPLACE FUNCTION public.customer_public_partner_flash_sales()
 RETURNS TABLE(partner_type text, item_type text, item_id uuid, partner_id uuid, partner_name text, item_name text, normal_price_kes numeric, flash_price_kes numeric, remaining_quantity numeric, starts_at timestamp with time zone, ends_at timestamp with time zone, image_path text, media_bucket text, category_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.expire_partner_flash_sales();

  return query
    select
      'seller'::text,'product'::text,p.id,p.seller_id,s.business_name,p.product_name,
      p.price_kes,p.flash_sale_price_kes,p.flash_sale_quantity,p.flash_sale_starts_at,p.flash_sale_ends_at,
      p.main_image_path,'seller-product-media'::text,c.name
    from public.seller_products p
    join public.seller_accounts s on s.user_id=p.seller_id
    join public.product_categories c on c.id=p.category_id
    where s.application_status='approved'
      and p.product_approval_status='approved'
      and p.listing_status='active'
      and p.availability_status='available'
      and c.is_active
      and not c.restricted_category
      and c.code<>'alcoholic_leogo_bar'
      and p.fulfilment_type<>'group_order'
      and p.flash_sale_requested
      and p.flash_sale_status='approved'
      and p.flash_sale_price_kes>0
      and p.flash_sale_starts_at<=now()
      and p.flash_sale_ends_at>now()
      and coalesce(p.flash_sale_quantity,0)>0

    union all

    select
      'service_provider'::text,'service'::text,v.id,v.provider_id,a.business_name,v.service_name,
      v.price_from_kes,v.flash_sale_price_kes,null::numeric,v.flash_sale_starts_at,v.flash_sale_ends_at,
      a.profile_picture_path,'service-provider-public-media'::text,coalesce(v.category_name,a.primary_service)
    from public.service_provider_services v
    join public.service_provider_accounts a on a.user_id=v.provider_id
    where a.application_status='approved'
      and a.availability_status<>'offline'
      and v.approval_status='approved'
      and v.is_available
      and v.pricing_model='fixed'
      and v.flash_sale_requested
      and v.flash_sale_status='approved'
      and v.flash_sale_price_kes>0
      and v.flash_sale_price_kes<v.price_from_kes
      and v.flash_sale_starts_at<=now()
      and v.flash_sale_ends_at>now()

    union all

    select
      'cyber'::text,'service'::text,c.id,c.provider_id,a.business_name,c.service_name,
      c.price_kes,c.flash_sale_price_kes,null::numeric,c.flash_sale_starts_at,c.flash_sale_ends_at,
      a.profile_picture_path,'cyber-public-media'::text,c.service_category
    from public.cyber_services c
    join public.cyber_provider_accounts a on a.user_id=c.provider_id
    where a.application_status='approved'
      and a.availability_status<>'offline'
      and c.approval_status='approved'
      and c.is_available
      and c.flash_sale_requested
      and c.flash_sale_status='approved'
      and c.flash_sale_price_kes>0
      and c.flash_sale_price_kes<c.price_kes
      and c.flash_sale_starts_at<=now()
      and c.flash_sale_ends_at>now()

    order by ends_at asc,item_name;
end
$function$