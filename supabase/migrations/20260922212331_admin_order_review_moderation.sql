alter table public.marketplace_order_reviews
  add column if not exists moderation_status text not null default 'submitted',
  add column if not exists admin_notes text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

alter table public.marketplace_order_reviews
  drop constraint if exists marketplace_order_reviews_moderation_status_check;

alter table public.marketplace_order_reviews
  add constraint marketplace_order_reviews_moderation_status_check
  check (moderation_status in ('submitted','approved','rejected'));

update public.marketplace_order_reviews
set moderation_status='submitted'
where moderation_status is null;

create or replace function public.customer_submit_order_review(
  p_order_id uuid,
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
  v_order public.marketplace_orders%rowtype;
  v_review_id uuid;
begin
  if v_uid is null then raise exception 'Login required'; end if;
  if p_rating not between 1 and 5 then raise exception 'Choose a rating from 1 to 5'; end if;
  if char_length(coalesce(p_comment,''))>1500 then
    raise exception 'Review comment must be 1500 characters or fewer';
  end if;

  select * into v_order
  from public.marketplace_orders
  where id=p_order_id and customer_id=v_uid;

  if not found then raise exception 'Order not found'; end if;
  if v_order.order_status<>'delivered' then
    raise exception 'You can review an order after delivery';
  end if;

  insert into public.marketplace_order_reviews(
    order_id,customer_id,rating,comment,moderation_status,
    admin_notes,reviewed_by,reviewed_at
  )
  values(
    p_order_id,v_uid,p_rating,nullif(btrim(coalesce(p_comment,'')),''),
    'submitted',null,null,null
  )
  on conflict(order_id) do update
  set rating=excluded.rating,
      comment=excluded.comment,
      moderation_status='submitted',
      admin_notes=null,
      reviewed_by=null,
      reviewed_at=null,
      updated_at=now()
  where public.marketplace_order_reviews.customer_id=v_uid
  returning id into v_review_id;

  return jsonb_build_object(
    'ok',true,
    'review_id',v_review_id,
    'rating',p_rating,
    'moderation_status','submitted'
  );
end
$function$;

create or replace function public.admin_list_order_reviews()
returns table(
  review_id uuid,
  order_id uuid,
  order_reference text,
  customer_id uuid,
  customer_name text,
  customer_email text,
  rating smallint,
  comment text,
  moderation_status text,
  admin_notes text,
  created_at timestamptz,
  updated_at timestamptz,
  reviewed_at timestamptz,
  item_count bigint,
  seller_count bigint
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not private.is_leogo_admin('products.read')
     and not private.is_leogo_admin('orders.read') then
    raise exception 'Orders or Products read permission required';
  end if;

  return query
  select
    r.id,r.order_id,o.order_reference,r.customer_id,
    coalesce(cp.full_name,o.receiver_name,'Customer'),
    u.email::text,r.rating,r.comment,r.moderation_status,r.admin_notes,
    r.created_at,r.updated_at,r.reviewed_at,
    (select count(*) from public.marketplace_order_items i where i.order_id=r.order_id),
    (select count(*) from public.marketplace_seller_orders so where so.order_id=r.order_id)
  from public.marketplace_order_reviews r
  join public.marketplace_orders o on o.id=r.order_id
  left join public.customer_profiles cp on cp.user_id=r.customer_id
  left join auth.users u on u.id=r.customer_id
  order by
    case r.moderation_status when 'submitted' then 0 when 'rejected' then 1 else 2 end,
    r.created_at desc;
end
$function$;

create or replace function public.admin_moderate_order_review(
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
  v_review public.marketplace_order_reviews%rowtype;
  v_order public.marketplace_orders%rowtype;
  v_before jsonb;
begin
  if not private.is_leogo_admin('products.manage')
     and not private.is_leogo_admin('orders.manage') then
    raise exception 'Orders or Products management permission required';
  end if;

  if p_action not in ('approved','rejected') then
    raise exception 'Choose approved or rejected';
  end if;

  if p_action='rejected' and char_length(btrim(coalesce(p_admin_notes,'')))<3 then
    raise exception 'Add a clear Admin note before rejecting this review';
  end if;

  select * into v_review
  from public.marketplace_order_reviews
  where id=p_review_id
  for update;

  if not found then raise exception 'Order review not found'; end if;

  select * into v_order
  from public.marketplace_orders
  where id=v_review.order_id;

  v_before:=to_jsonb(v_review);

  update public.marketplace_order_reviews
  set moderation_status=p_action,
      admin_notes=nullif(btrim(coalesce(p_admin_notes,'')),''),
      reviewed_by=(select auth.uid()),
      reviewed_at=now(),
      updated_at=now()
  where id=p_review_id
  returning * into v_review;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  values(
    v_review.customer_id,'orders',
    case when p_action='approved' then 'Order review approved' else 'Order review needs attention' end,
    case when p_action='approved'
      then 'Your review for order '||v_order.order_reference||' was approved by LEOGO.'
      else 'Your review for order '||v_order.order_reference||' was not approved. '||coalesce(v_review.admin_notes,'Please review it and try again.')
    end,
    'marketplace_order_review',v_review.id,'order_review_'||p_action,'orders',
    jsonb_build_object('order_id',v_review.order_id,'order_reference',v_order.order_reference,'moderation_status',p_action)
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
    'order.review.'||p_action,
    'marketplace_order_review',
    v_review.id::text,
    v_before,
    to_jsonb(v_review),
    jsonb_build_object('order_id',v_review.order_id,'order_reference',v_order.order_reference)
  );

  return jsonb_build_object('ok',true,'review_id',v_review.id,'moderation_status',v_review.moderation_status);
end
$function$;

revoke execute on function public.admin_list_order_reviews() from public,anon;
revoke execute on function public.admin_moderate_order_review(uuid,text,text) from public,anon;

grant execute on function public.admin_list_order_reviews() to authenticated;
grant execute on function public.admin_moderate_order_review(uuid,text,text) to authenticated;
