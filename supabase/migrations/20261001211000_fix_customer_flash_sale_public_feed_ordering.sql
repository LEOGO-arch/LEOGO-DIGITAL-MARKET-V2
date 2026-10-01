-- Fix the public customer Flash Sale feed ordering across UNION ALL branches.
-- PostgreSQL compound queries cannot ORDER BY an expression/output alias in this
-- shape reliably. Wrap all partner rows first, then order the wrapper.

create or replace function public.customer_public_partner_flash_sales()
returns table(
  partner_type text,
  item_type text,
  item_id uuid,
  partner_id uuid,
  partner_name text,
  item_name text,
  normal_price_kes numeric,
  flash_price_kes numeric,
  remaining_quantity numeric,
  starts_at timestamptz,
  ends_at timestamptz,
  image_path text,
  media_bucket text,
  category_name text
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.expire_partner_flash_sales();

  return query
    select
      q.partner_type,
      q.item_type,
      q.item_id,
      q.partner_id,
      q.partner_name,
      q.item_name,
      q.normal_price_kes,
      q.flash_price_kes,
      q.remaining_quantity,
      q.starts_at,
      q.ends_at,
      q.image_path,
      q.media_bucket,
      q.category_name
    from (
      select
        'seller'::text as partner_type,
        'product'::text as item_type,
        p.id as item_id,
        p.seller_id as partner_id,
        s.business_name as partner_name,
        p.product_name as item_name,
        p.price_kes as normal_price_kes,
        p.flash_sale_price_kes as flash_price_kes,
        p.flash_sale_quantity as remaining_quantity,
        p.flash_sale_starts_at as starts_at,
        p.flash_sale_ends_at as ends_at,
        p.main_image_path as image_path,
        'seller-product-media'::text as media_bucket,
        c.name as category_name
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
        'service_provider'::text,
        'service'::text,
        v.id,
        v.provider_id,
        a.business_name,
        v.service_name,
        v.price_from_kes,
        v.flash_sale_price_kes,
        null::numeric,
        v.flash_sale_starts_at,
        v.flash_sale_ends_at,
        a.profile_picture_path,
        'service-provider-public-media'::text,
        coalesce(v.category_name,a.primary_service)
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
        'cyber'::text,
        'service'::text,
        c.id,
        c.provider_id,
        a.business_name,
        c.service_name,
        c.price_kes,
        c.flash_sale_price_kes,
        null::numeric,
        c.flash_sale_starts_at,
        c.flash_sale_ends_at,
        a.profile_picture_path,
        'cyber-public-media'::text,
        c.service_category
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
    ) q
    order by q.ends_at asc,q.item_name;
end
$function$;

revoke execute on function public.customer_public_partner_flash_sales() from public;
grant execute on function public.customer_public_partner_flash_sales() to anon,authenticated;
