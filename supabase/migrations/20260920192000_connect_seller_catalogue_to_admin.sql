-- Connect Seller Partner Portal catalogue to Admin Control Center.

create or replace function public.admin_list_catalogue_products()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_result jsonb;
begin
  if not private.is_leogo_admin('products.read') then raise exception 'Admin access required'; end if;
  select coalesce(jsonb_agg(row_data order by (row_data->>'updated_at')::timestamptz desc),'[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id',p.id,'seller_id',p.seller_id,'seller_name',s.business_name,'seller_owner',s.owner_name,
      'seller_status',s.application_status,'seller_email',u.email,'product_name',p.product_name,
      'price_kes',p.price_kes,'availability_status',p.availability_status,'quantity_available',p.quantity_available,
      'measurement_unit',p.measurement_unit,'measurement_unit_other',p.measurement_unit_other,
      'listing_status',p.listing_status,'product_details',p.product_details,'main_image_path',p.main_image_path,
      'gallery_image_paths',p.gallery_image_paths,'has_variants',p.has_variants,'category_id',p.category_id,
      'category_name',coalesce(nullif(p.custom_category_name,''),c.name),'subcategory_id',p.subcategory_id,
      'subcategory_name',coalesce(nullif(p.custom_subcategory_name,''),sc.name),'group_name',p.group_name,
      'accepts_lipa_pole_pole',p.accepts_lipa_pole_pole,
      'lipa_pole_pole_first_deposit_kes',p.lipa_pole_pole_first_deposit_kes,
      'lipa_pole_pole_max_days',p.lipa_pole_pole_max_days,'flash_sale_requested',p.flash_sale_requested,
      'flash_sale_status',p.flash_sale_status,'flash_sale_price_kes',p.flash_sale_price_kes,
      'created_at',p.created_at,'updated_at',p.updated_at,
      'variants',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',v.id,'variant_name',v.variant_name,'price_kes',v.price_kes,
          'quantity_available',v.quantity_available,'image_path',v.image_path,
          'is_active',v.is_active,'display_order',v.display_order
        ) order by v.display_order,v.created_at)
        from public.seller_product_variants v where v.product_id=p.id
      ),'[]'::jsonb)
    ) row_data
    from public.seller_products p
    join public.seller_accounts s on s.user_id=p.seller_id
    left join auth.users u on u.id=p.seller_id
    left join public.product_categories c on c.id=p.category_id
    left join public.product_subcategories sc on sc.id=p.subcategory_id
  ) q;
  return v_result;
end $$;

create or replace function public.admin_list_catalogue_categories()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_result jsonb;
begin
  if not private.is_leogo_admin('products.read') then raise exception 'Admin access required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'code',c.code,'name',c.name,'display_order',c.display_order,'is_active',c.is_active,
    'is_assignable',c.is_assignable,'is_aggregator',c.is_aggregator,'restricted_category',c.restricted_category,
    'product_count',(select count(*) from public.seller_products p where p.category_id=c.id),
    'active_product_count',(select count(*) from public.seller_products p where p.category_id=c.id and p.listing_status='active'),
    'subcategories',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',sc.id,'code',sc.code,'name',sc.name,'display_order',sc.display_order,
        'is_active',sc.is_active,'product_count',(select count(*) from public.seller_products p where p.subcategory_id=sc.id)
      ) order by sc.display_order,sc.name)
      from public.product_subcategories sc where sc.category_id=c.id
    ),'[]'::jsonb)
  ) order by c.display_order,c.name),'[]'::jsonb)
  into v_result
  from public.product_categories c;
  return v_result;
end $$;

revoke execute on function public.admin_list_catalogue_products() from public,anon;
revoke execute on function public.admin_list_catalogue_categories() from public,anon;
grant execute on function public.admin_list_catalogue_products() to authenticated;
grant execute on function public.admin_list_catalogue_categories() to authenticated;
