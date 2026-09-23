
create or replace function public.seller_list_product_reviews()
returns table(
  review_id uuid,
  order_id uuid,
  order_reference text,
  order_item_id uuid,
  product_id uuid,
  product_name text,
  variant_id uuid,
  variant_name text,
  rating smallint,
  comment text,
  review_created_at timestamptz,
  approved_at timestamptz,
  product_rating_average numeric,
  product_review_count bigint
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
begin
  if v_uid is null then
    raise exception 'Login required';
  end if;

  if not exists(
    select 1
    from public.seller_accounts s
    where s.user_id=v_uid
      and s.application_status='approved'
  ) then
    raise exception 'Approved Seller account required';
  end if;

  return query
  select
    r.id,
    r.order_id,
    o.order_reference,
    r.order_item_id,
    r.product_id,
    p.product_name,
    r.variant_id,
    v.variant_name,
    r.rating,
    r.comment,
    r.created_at,
    r.reviewed_at,
    (
      select round(avg(r2.rating)::numeric,1)
      from public.marketplace_product_reviews r2
      where r2.product_id=r.product_id
        and r2.seller_id=v_uid
        and r2.moderation_status='approved'
    ),
    (
      select count(*)
      from public.marketplace_product_reviews r2
      where r2.product_id=r.product_id
        and r2.seller_id=v_uid
        and r2.moderation_status='approved'
    )
  from public.marketplace_product_reviews r
  join public.marketplace_orders o on o.id=r.order_id
  join public.seller_products p on p.id=r.product_id
  left join public.seller_product_variants v on v.id=r.variant_id
  where r.seller_id=v_uid
    and r.moderation_status='approved'
    and o.order_status='delivered'
  order by coalesce(r.reviewed_at,r.created_at) desc;
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
  v_variant_name text;
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

  if not found then
    raise exception 'Product review not found';
  end if;

  if v_review.moderation_status=p_action then
    return jsonb_build_object(
      'ok',true,
      'review_id',v_review.id,
      'moderation_status',v_review.moderation_status,
      'already_set',true
    );
  end if;

  if p_action='rejected'
     and nullif(btrim(coalesce(p_admin_notes,'')),'') is null then
    raise exception 'Add a reason before rejecting this review';
  end if;

  select * into v_order
  from public.marketplace_orders
  where id=v_review.order_id;

  select * into v_product
  from public.seller_products
  where id=v_review.product_id;

  if v_review.variant_id is not null then
    select v.variant_name into v_variant_name
    from public.seller_product_variants v
    where v.id=v_review.variant_id;
  end if;

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
    v_message='Your review for '||v_product.product_name||
      coalesce(' — '||v_variant_name,'')||
      ' from order '||v_order.order_reference||
      ' is now visible on LEOGO.';
  else
    v_title='Product review needs changes';
    v_message='Your review for '||v_product.product_name||
      coalesce(' — '||v_variant_name,'')||
      ' from order '||v_order.order_reference||
      ' was not published. Open My Activity to review the Admin note.';
  end if;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,
    source_type,source_id,event_key,action_view,metadata
  )
  values(
    v_review.customer_id,'order',v_title,v_message,
    'marketplace_product_review',v_review.id,
    'product_review_'||p_action,'orders',
    jsonb_build_object(
      'review_id',v_review.id,
      'product_id',v_review.product_id,
      'product_name',v_product.product_name,
      'variant_id',v_review.variant_id,
      'variant_name',v_variant_name,
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

  if p_action='approved' then
    perform private.notify_partner(
      v_review.seller_id,
      'seller',
      'product_review_approved',
      'New approved product review',
      'A customer rated '||v_product.product_name||
        coalesce(' — '||v_variant_name,'')||
        ' '||v_review.rating||'/5 from completed order '||
        v_order.order_reference||'. Open Product Reviews to see the feedback.',
      'marketplace_product_review',
      v_review.id,
      'reviews',
      jsonb_build_object(
        'review_id',v_review.id,
        'order_id',v_review.order_id,
        'order_reference',v_order.order_reference,
        'product_id',v_review.product_id,
        'product_name',v_product.product_name,
        'variant_id',v_review.variant_id,
        'variant_name',v_variant_name,
        'rating',v_review.rating,
        'comment',v_review.comment,
        'verified_purchase',true
      )
    );
  end if;

  perform private.write_admin_audit(
    'product.review.'||p_action,
    'marketplace_product_review',
    v_review.id::text,
    v_before,
    to_jsonb(v_review),
    jsonb_build_object(
      'product_id',v_review.product_id,
      'seller_id',v_review.seller_id,
      'order_id',v_review.order_id
    )
  );

  return jsonb_build_object(
    'ok',true,
    'review_id',v_review.id,
    'moderation_status',v_review.moderation_status,
    'seller_notified',p_action='approved'
  );
end
$function$;

revoke execute on function public.seller_list_product_reviews() from public,anon;
grant execute on function public.seller_list_product_reviews() to authenticated;
