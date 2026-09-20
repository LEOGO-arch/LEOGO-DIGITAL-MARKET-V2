-- Customer-side live product categories and approved Seller catalogue.

create or replace function public.customer_product_categories()
returns table(
  id uuid,code text,name text,display_order integer,is_assignable boolean,
  is_aggregator boolean,restricted_category boolean,public_product_count bigint
)
language sql
security definer
set search_path=''
as $$
  select
    c.id,c.code,c.name,c.display_order,c.is_assignable,c.is_aggregator,c.restricted_category,
    (
      select count(*)
      from public.seller_products p
      join public.seller_accounts s on s.user_id=p.seller_id
      where p.category_id=c.id
        and s.application_status='approved'
        and p.product_approval_status='approved'
        and p.listing_status='active'
        and p.availability_status in ('available','out_of_stock')
    )::bigint
  from public.product_categories c
  where c.is_active
  order by c.display_order,c.name;
$$;

create or replace function public.customer_marketplace_catalogue()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_result jsonb;
begin
  select coalesce(jsonb_agg(row_data order by (row_data->>'updated_at')::timestamptz desc),'[]'::jsonb)
  into v_result
  from (
    select to_jsonb(p) || jsonb_build_object(
      'seller_name',s.business_name,
      'category_code',c.code,
      'category_name',coalesce(nullif(p.custom_category_name,''),c.name),
      'category_is_aggregator',c.is_aggregator,
      'category_restricted',c.restricted_category,
      'subcategory_name',coalesce(nullif(p.custom_subcategory_name,''),sc.name),
      'variants',coalesce((
        select jsonb_agg(to_jsonb(v) order by v.display_order,v.created_at)
        from public.seller_product_variants v
        where v.product_id=p.id and v.is_active
      ),'[]'::jsonb)
    ) row_data
    from public.seller_products p
    join public.seller_accounts s on s.user_id=p.seller_id
    join public.product_categories c on c.id=p.category_id
    left join public.product_subcategories sc on sc.id=p.subcategory_id
    where s.application_status='approved'
      and p.product_approval_status='approved'
      and p.listing_status='active'
      and p.availability_status in ('available','out_of_stock')
      and c.is_active
      and c.code <> 'alcoholic_leogo_bar'
  ) q;
  return v_result;
end $$;

revoke execute on function public.customer_product_categories() from public;
revoke execute on function public.customer_marketplace_catalogue() from public;
grant execute on function public.customer_product_categories() to anon,authenticated;
grant execute on function public.customer_marketplace_catalogue() to anon,authenticated;
