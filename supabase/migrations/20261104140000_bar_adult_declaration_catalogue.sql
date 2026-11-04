-- Separate, authenticated adult-declared catalogue. General Marketplace still excludes alcohol.
create table public.customer_bar_age_declarations (
 user_id uuid primary key references auth.users(id) on delete cascade,
 declared_at timestamptz not null default now()
);
alter table public.customer_bar_age_declarations enable row level security;
revoke all on public.customer_bar_age_declarations from public,anon,authenticated;

create function public.customer_confirm_bar_adult()
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in before confirming adult status'; end if;
 insert into public.customer_bar_age_declarations(user_id) values(auth.uid())
 on conflict(user_id) do nothing;
end $$;
revoke all on function public.customer_confirm_bar_adult() from public,anon;
grant execute on function public.customer_confirm_bar_adult() to authenticated;

create function public.customer_bar_declaration_status()
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from public.customer_bar_age_declarations d where d.user_id=auth.uid()
 );
$$;
revoke all on function public.customer_bar_declaration_status() from public,anon;
grant execute on function public.customer_bar_declaration_status() to authenticated;

CREATE OR REPLACE FUNCTION public.customer_leogo_bar_catalogue()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
  if auth.uid() is null or not exists(
    select 1 from public.customer_bar_age_declarations d where d.user_id=auth.uid()
  ) then raise exception 'Sign in and confirm you are 18 or older to view LEOGO BAR'; end if;
  perform private.close_expired_group_campaigns();

  select coalesce(jsonb_agg(row_data order by (row_data->>'updated_at')::timestamptz desc),'[]'::jsonb)
  into v_result
  from (
    select (to_jsonb(p) - ARRAY['product_review_notes','product_reviewed_by','product_reviewed_at','flash_sale_admin_notes','flash_sale_reviewed_by','flash_sale_reviewed_at']::text[])||jsonb_build_object(
      'seller_name',s.business_name,
      'category_code',c.code,
      'category_name',coalesce(nullif(p.custom_category_name,''),c.name),
      'category_is_aggregator',c.is_aggregator,
      'category_restricted',c.restricted_category,
      'subcategory_name',coalesce(nullif(p.custom_subcategory_name,''),sc.name),
      'shipping_profile',case when ship.product_id is null then null else to_jsonb(ship)-'seller_id'-'created_at'-'updated_at' end,
      'shipping_defaults',(select to_jsonb(d)-'updated_by'-'updated_at' from public.platform_shipping_defaults d where d.id=1),
      'delivery_rates',(select public.public_get_delivery_rate_settings()),
      'group_campaign',case when go.id is null then null else jsonb_build_object(
        'id',go.id,
        'campaign_reference',go.campaign_reference,
        'minimum_quantity',go.minimum_quantity,
        'maximum_quantity',go.maximum_quantity,
        'customer_unit_price_kes',go.customer_unit_price_kes,
        'opening_at',go.opening_at,
        'closing_at',go.closing_at,
        'expected_dispatch_date',go.expected_dispatch_date,
        'expected_delivery_from',go.expected_delivery_from,
        'expected_delivery_to',go.expected_delivery_to,
        'close_policy',go.close_policy,
        'status',go.status,
        'quantity_committed',go.quantity_committed,
        'participant_count',go.participant_count
      ) end,
      'variants',coalesce((
        select jsonb_agg(to_jsonb(v) order by v.display_order,v.created_at)
        from public.seller_product_variants v
        where v.product_id=p.id and v.is_active
      ),'[]'::jsonb),
      'rating_average',coalesce((
        select round(avg(r.rating)::numeric,1)
        from public.marketplace_product_reviews r
        where r.product_id=p.id and r.moderation_status='approved'
      ),0),
      'review_count',(
        select count(*)
        from public.marketplace_product_reviews r
        where r.product_id=p.id and r.moderation_status='approved'
      ),
      'approved_reviews',coalesce((
        select jsonb_agg(review_row order by (review_row->>'created_at')::timestamptz desc)
        from (
          select jsonb_build_object(
            'review_id',r.id,
            'rating',r.rating,
            'comment',r.comment,
            'variant_name',v.variant_name,
            'created_at',r.created_at,
            'verified_purchase',true
          ) review_row
          from public.marketplace_product_reviews r
          left join public.seller_product_variants v on v.id=r.variant_id
          where r.product_id=p.id and r.moderation_status='approved'
          order by r.created_at desc
          limit 8
        ) approved
      ),'[]'::jsonb)
    ) row_data
    from public.seller_products p
    join public.seller_accounts s on s.user_id=p.seller_id
    join public.product_categories c on c.id=p.category_id
    left join public.product_subcategories sc on sc.id=p.subcategory_id
    left join public.product_shipping_profiles ship on ship.product_id=p.id
    left join lateral(
      select g.*
      from public.group_order_campaigns g
      where g.product_id=p.id
        and g.status in (
          'collecting_orders','paused','moq_reached','order_confirmed',
          'seller_preparing','dispatched_origin','in_transit',
          'arrived_destination','at_sorting_center','out_for_delivery','ready_pickup'
        )
      order by g.created_at desc
      limit 1
    ) go on true
    where s.application_status='approved'
      and private.partner_has_active_subscription(s.user_id,'seller')
      and p.product_approval_status='approved'
      and p.listing_status='active'
      and p.availability_status in ('available','out_of_stock')
      and c.is_active
      and c.code='alcoholic_leogo_bar'
  ) q;

  return v_result;
end
$function$
;
revoke all on function public.customer_leogo_bar_catalogue() from public,anon;
grant execute on function public.customer_leogo_bar_catalogue() to authenticated;
