
insert into public.partner_notifications(
  user_id,
  partner_type,
  event_type,
  title,
  message,
  source_type,
  source_id,
  action_view,
  metadata
)
select
  r.seller_id,
  'seller',
  'product_review_approved',
  'New approved product review',
  'A customer rated '||p.product_name||
    coalesce(' — '||v.variant_name,'')||
    ' '||r.rating||'/5 from completed order '||
    o.order_reference||'. Open Product Reviews to see the feedback.',
  'marketplace_product_review',
  r.id,
  'reviews',
  jsonb_build_object(
    'review_id',r.id,
    'order_id',r.order_id,
    'order_reference',o.order_reference,
    'product_id',r.product_id,
    'product_name',p.product_name,
    'variant_id',r.variant_id,
    'variant_name',v.variant_name,
    'rating',r.rating,
    'comment',r.comment,
    'verified_purchase',true,
    'backfilled',true
  )
from public.marketplace_product_reviews r
join public.marketplace_orders o on o.id=r.order_id
join public.seller_products p on p.id=r.product_id
left join public.seller_product_variants v on v.id=r.variant_id
where r.moderation_status='approved'
  and o.order_status='delivered'
  and not exists(
    select 1
    from public.partner_notifications n
    where n.user_id=r.seller_id
      and n.partner_type='seller'
      and n.source_type='marketplace_product_review'
      and n.source_id=r.id
      and n.event_type='product_review_approved'
  );
