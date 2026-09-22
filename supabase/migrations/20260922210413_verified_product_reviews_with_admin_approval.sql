
create table if not exists public.marketplace_product_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete cascade,
  order_item_id uuid not null references public.marketplace_order_items(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.seller_products(id) on delete cascade,
  variant_id uuid references public.seller_product_variants(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  moderation_status text not null default 'submitted'
    check (moderation_status in ('submitted','approved','rejected')),
  admin_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_item_id,customer_id)
);

create index if not exists marketplace_product_reviews_product_status_idx
  on public.marketplace_product_reviews(product_id,moderation_status,created_at desc);

create index if not exists marketplace_product_reviews_admin_queue_idx
  on public.marketplace_product_reviews(moderation_status,created_at desc);

alter table public.marketplace_product_reviews enable row level security;
revoke all on public.marketplace_product_reviews from anon,authenticated;
grant select on public.marketplace_product_reviews to authenticated;

drop policy if exists "Customer or Admin can read product reviews" on public.marketplace_product_reviews;
create policy "Customer or Admin can read product reviews"
on public.marketplace_product_reviews for select
to authenticated
using (
  customer_id=(select auth.uid())
  or private.is_leogo_admin('products.read')
);

create or replace function public.customer_submit_product_review(
  p_order_item_id uuid,
  p_rating integer,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_item public.marketplace_order_items%rowtype;
  v_order public.marketplace_orders%rowtype;
  v_review public.marketplace_product_reviews%rowtype;
begin
  if v_uid is null then raise exception 'Login required'; end if;
  if p_rating not between 1 and 5 then raise exception 'Choose a rating from 1 to 5'; end if;
  if char_length(coalesce(p_comment,''))>1500 then
    raise exception 'Review comment must be 1500 characters or fewer';
  end if;

  select i.* into v_item
  from public.marketplace_order_items i
  join public.marketplace_orders o on o.id=i.order_id
  where i.id=p_order_item_id
    and o.customer_id=v_uid;

  if not found then raise exception 'Purchased product not found'; end if;

  select * into v_order
  from public.marketplace_orders
  where id=v_item.order_id and customer_id=v_uid;

  if v_order.order_status<>'delivered' then
    raise exception 'You can review this product after the order is delivered';
  end if;

  insert into public.marketplace_product_reviews(
    order_id,order_item_id,customer_id,seller_id,product_id,variant_id,
    rating,comment,moderation_status,admin_notes,reviewed_by,reviewed_at
  )
  values(
    v_item.order_id,v_item.id,v_uid,v_item.seller_id,v_item.product_id,v_item.variant_id,
    p_rating,nullif(btrim(coalesce(p_comment,'')),''),
    'submitted',null,null,null
  )
  on conflict(order_item_id,customer_id) do update
  set rating=excluded.rating,
      comment=excluded.comment,
      moderation_status='submitted',
      admin_notes=null,
      reviewed_by=null,
      reviewed_at=null,
      updated_at=now()
  returning * into v_review;

  return jsonb_build_object(
    'ok',true,
    'review_id',v_review.id,
    'product_id',v_review.product_id,
    'rating',v_review.rating,
    'moderation_status',v_review.moderation_status
  );
end
$function$;

create or replace function public.admin_list_product_reviews()
returns table(
  review_id uuid,
  order_id uuid,
  order_reference text,
  order_item_id uuid,
  customer_id uuid,
  customer_name text,
  seller_id uuid,
  seller_name text,
  product_id uuid,
  product_name text,
  variant_id uuid,
  variant_name text,
  rating smallint,
  comment text,
  moderation_status text,
  admin_notes text,
  created_at timestamptz,
  updated_at timestamptz,
  reviewed_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not private.is_leogo_admin('products.read') then
    raise exception 'Products read permission required';
  end if;

  return query
  select
    r.id,
    r.order_id,
    o.order_reference,
    r.order_item_id,
    r.customer_id,
    coalesce(cp.full_name,o.receiver_name,'Customer'),
    r.seller_id,
    s.business_name,
    r.product_id,
    p.product_name,
    r.variant_id,
    v.variant_name,
    r.rating,
    r.comment,
    r.moderation_status,
    r.admin_notes,
    r.created_at,
    r.updated_at,
    r.reviewed_at
  from public.marketplace_product_reviews r
  join public.marketplace_orders o on o.id=r.order_id
  join public.seller_products p on p.id=r.product_id
  join public.seller_accounts s on s.user_id=r.seller_id
  left join public.seller_product_variants v on v.id=r.variant_id
  left join public.customer_profiles cp on cp.user_id=r.customer_id
  order by
    case r.moderation_status
      when 'submitted' then 0
      when 'rejected' then 1
      else 2
    end,
    r.created_at desc;
end
$function$;

create or replace function public.admin_moderate_product_review(
  p_review_id uuid,
  p_action text,
  p_admin_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_review public.marketplace_product_reviews%rowtype;
  v_order public.marketplace_orders%rowtype;
  v_product public.seller_products%rowtype;
  v_status text;
  v_title text;
  v_message text;
  v_before jsonb;
begin
  if not private.is_leogo_admin('products.manage') then
    raise exception 'Products management permission required';
  end if;

  if p_action not in ('approved','rejected') then
    raise exception 'Review action must be approved or rejected';
  end if;

  if char_length(coalesce(p_admin_notes,''))>1500 then
    raise exception 'Admin notes must be 1500 characters or fewer';
  end if;

  select * into v_review
  from public.marketplace_product_reviews
  where id=p_review_id
  for update;

  if not found then raise exception 'Product review not found'; end if;

  if p_action='rejected' and nullif(btrim(coalesce(p_admin_notes,'')),'') is null then
    raise exception 'Add a reason before rejecting this review';
  end if;

  select * into v_order from public.marketplace_orders where id=v_review.order_id;
  select * into v_product from public.seller_products where id=v_review.product_id;
  v_before=to_jsonb(v_review);

  update public.marketplace_product_reviews
  set moderation_status=p_action,
      admin_notes=nullif(btrim(coalesce(p_admin_notes,'')),''),
      reviewed_by=(select auth.uid()),
      reviewed_at=now(),
      updated_at=now()
  where id=p_review_id
  returning * into v_review;

  if p_action='approved' then
    v_title='Product review approved';
    v_message='Your review for '||v_product.product_name||' from order '||v_order.order_reference||' is now visible on LEOGO.';
  else
    v_title='Product review needs changes';
    v_message='Your review for '||v_product.product_name||' from order '||v_order.order_reference||' was not published. Open My Activity to review the Admin note.';
  end if;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  values(
    v_review.customer_id,'order',v_title,v_message,
    'marketplace_product_review',v_review.id,'product_review_'||p_action,'orders',
    jsonb_build_object(
      'review_id',v_review.id,
      'product_id',v_review.product_id,
      'product_name',v_product.product_name,
      'order_id',v_review.order_id,
      'order_reference',v_order.order_reference,
      'moderation_status',p_action
    )
  )
  on conflict(user_id,source_type,source_id,event_key)
  where source_id is not null
  do update set
    title=excluded.title,
    message=excluded.message,
    metadata=excluded.metadata,
    read_at=null,
    created_at=now();

  perform private.write_admin_audit(
    'product.review.'||p_action,
    'marketplace_product_review',
    v_review.id::text,
    v_before,
    to_jsonb(v_review),
    jsonb_build_object(
      'product_id',v_review.product_id,
      'order_id',v_review.order_id
    )
  );

  return jsonb_build_object(
    'ok',true,
    'review_id',v_review.id,
    'moderation_status',v_review.moderation_status
  );
end
$function$;

create or replace function public.customer_marketplace_catalogue()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_result jsonb;
begin
  select coalesce(jsonb_agg(row_data order by (row_data->>'updated_at')::timestamptz desc),'[]'::jsonb)
  into v_result
  from (
    select
      to_jsonb(p)
      || jsonb_build_object(
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
        ),'[]'::jsonb),
        'rating_average',coalesce((
          select round(avg(r.rating)::numeric,1)
          from public.marketplace_product_reviews r
          where r.product_id=p.id
            and r.moderation_status='approved'
        ),0),
        'review_count',(
          select count(*)
          from public.marketplace_product_reviews r
          where r.product_id=p.id
            and r.moderation_status='approved'
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
            ) as review_row
            from public.marketplace_product_reviews r
            left join public.seller_product_variants v on v.id=r.variant_id
            where r.product_id=p.id
              and r.moderation_status='approved'
            order by r.created_at desc
            limit 8
          ) approved
        ),'[]'::jsonb)
      ) as row_data
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
end
$function$;

create or replace function public.customer_list_marketplace_orders_v2()
returns table(
  id uuid,
  order_reference text,
  created_at timestamptz,
  receiver_name text,
  delivery_zone text,
  county text,
  sub_county text,
  estate text,
  landmark text,
  items_subtotal_kes numeric,
  service_fee_kes numeric,
  pickup_fee_kes numeric,
  delivery_fee_kes numeric,
  grand_total_kes numeric,
  payment_method text,
  payment_status text,
  payment_verified_at timestamptz,
  order_status text,
  delivered_at timestamptz,
  items jsonb,
  seller_fulfilments jsonb,
  delivery_status text,
  rider_name text,
  rider_phone text,
  delivery_assigned_at timestamptz,
  delivery_picked_up_at timestamptz,
  arrived_sorting_center_at timestamptz,
  sorting_received_at timestamptz,
  ready_for_dispatch_at timestamptz,
  on_the_way_at timestamptz,
  delivery_delivered_at timestamptz,
  review jsonb,
  aftersales_case jsonb
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  return query
  select
    o.id,o.order_reference,o.created_at,o.receiver_name,o.delivery_zone,o.county,o.sub_county,o.estate,o.landmark,
    o.items_subtotal_kes,o.service_fee_kes,o.pickup_fee_kes,o.delivery_fee_kes,o.grand_total_kes,
    o.payment_method,o.payment_status,o.payment_verified_at,o.order_status,o.delivered_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'order_item_id',i.id,
        'product_id',i.product_id,
        'product_name',i.product_name,
        'variant_name',i.variant_name,
        'variant_id',i.variant_id,
        'variant_image_path',i.variant_image_path,
        'quantity',i.quantity,
        'unit_price_kes',i.unit_price_kes,
        'line_total_kes',i.line_total_kes,
        'seller_id',i.seller_id,
        'review',(
          select jsonb_build_object(
            'review_id',r.id,
            'rating',r.rating,
            'comment',r.comment,
            'moderation_status',r.moderation_status,
            'admin_notes',r.admin_notes,
            'created_at',r.created_at,
            'updated_at',r.updated_at,
            'reviewed_at',r.reviewed_at
          )
          from public.marketplace_product_reviews r
          where r.order_item_id=i.id
            and r.customer_id=(select auth.uid())
        )
      ) order by i.created_at)
      from public.marketplace_order_items i
      where i.order_id=o.id
    ),'[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'seller_id',so.seller_id,
        'seller_name',s.business_name,
        'fulfilment_status',so.fulfilment_status,
        'seller_subtotal_kes',so.seller_subtotal_kes,
        'received_at',so.received_at,
        'packed_ready_at',so.packed_ready_at,
        'handed_to_rider_at',so.handed_to_rider_at,
        'delivered_at',so.delivered_at
      ) order by s.business_name)
      from public.marketplace_seller_orders so
      join public.seller_accounts s on s.user_id=so.seller_id
      where so.order_id=o.id
    ),'[]'::jsonb),
    d.status,rs.display_name,rs.phone,
    d.assigned_at,d.picked_up_at,d.arrived_sorting_center_at,d.sorting_received_at,
    d.ready_for_dispatch_at,d.on_the_way_at,d.delivered_at,
    (
      select jsonb_build_object(
        'id',r.id,'rating',r.rating,'comment',r.comment,
        'created_at',r.created_at,'updated_at',r.updated_at
      )
      from public.marketplace_order_reviews r
      where r.order_id=o.id and r.customer_id=(select auth.uid())
    ),
    (
      select jsonb_build_object(
        'id',c.id,
        'case_reference',c.case_reference,
        'status',c.status,
        'issue_type',c.issue_type,
        'preferred_solution',c.preferred_solution,
        'details',c.details,
        'admin_notes',c.admin_notes,
        'created_at',c.created_at,
        'updated_at',c.updated_at,
        'resolved_at',c.resolved_at
      )
      from public.marketplace_aftersales_cases c
      where c.order_id=o.id and c.customer_id=(select auth.uid())
      order by c.created_at desc
      limit 1
    )
  from public.marketplace_orders o
  left join public.marketplace_delivery_jobs d on d.order_id=o.id
  left join public.leogo_staff rs on rs.user_id=d.rider_id
  where o.customer_id=(select auth.uid())
  order by o.created_at desc;
end
$function$;

revoke execute on function public.customer_submit_product_review(uuid,integer,text) from public,anon;
revoke execute on function public.admin_list_product_reviews() from public,anon;
revoke execute on function public.admin_moderate_product_review(uuid,text,text) from public,anon;

grant execute on function public.customer_submit_product_review(uuid,integer,text) to authenticated;
grant execute on function public.admin_list_product_reviews() to authenticated;
grant execute on function public.admin_moderate_product_review(uuid,text,text) to authenticated;
