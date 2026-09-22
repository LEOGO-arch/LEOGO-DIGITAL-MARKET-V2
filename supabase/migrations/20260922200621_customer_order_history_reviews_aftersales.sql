
create table if not exists public.marketplace_order_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.marketplace_orders(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketplace_order_reviews enable row level security;
revoke all on public.marketplace_order_reviews from anon, authenticated;
grant select on public.marketplace_order_reviews to authenticated;

drop policy if exists "Customers can view own order reviews" on public.marketplace_order_reviews;
create policy "Customers can view own order reviews"
on public.marketplace_order_reviews for select
to authenticated
using (customer_id=(select auth.uid()));

create table if not exists public.marketplace_aftersales_cases (
  id uuid primary key default gen_random_uuid(),
  case_reference text not null unique,
  order_id uuid not null references public.marketplace_orders(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  issue_type text not null,
  preferred_solution text not null,
  details text not null,
  evidence_path text,
  status text not null default 'submitted'
    check (status in ('submitted','in_review','contacted','resolved','rejected','cancelled')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index if not exists marketplace_aftersales_one_open_case_per_order
on public.marketplace_aftersales_cases(order_id)
where status in ('submitted','in_review','contacted');

alter table public.marketplace_aftersales_cases enable row level security;
revoke all on public.marketplace_aftersales_cases from anon, authenticated;
grant select on public.marketplace_aftersales_cases to authenticated;

drop policy if exists "Customers can view own aftersales cases" on public.marketplace_aftersales_cases;
create policy "Customers can view own aftersales cases"
on public.marketplace_aftersales_cases for select
to authenticated
using (customer_id=(select auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'marketplace-aftersales-evidence',
  'marketplace-aftersales-evidence',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Customers upload own aftersales evidence" on storage.objects;
create policy "Customers upload own aftersales evidence"
on storage.objects for insert
to authenticated
with check(
  bucket_id='marketplace-aftersales-evidence'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists "Customers view own aftersales evidence" on storage.objects;
create policy "Customers view own aftersales evidence"
on storage.objects for select
to authenticated
using(
  bucket_id='marketplace-aftersales-evidence'
  and (
    (storage.foldername(name))[1]=(select auth.uid())::text
    or private.is_leogo_admin('orders.read')
  )
);

drop policy if exists "Customers delete own aftersales evidence" on storage.objects;
create policy "Customers delete own aftersales evidence"
on storage.objects for delete
to authenticated
using(
  bucket_id='marketplace-aftersales-evidence'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

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
  if char_length(coalesce(p_comment,''))>1500 then raise exception 'Review comment must be 1500 characters or fewer'; end if;

  select * into v_order
  from public.marketplace_orders
  where id=p_order_id and customer_id=v_uid;

  if not found then raise exception 'Order not found'; end if;
  if v_order.order_status<>'delivered' then raise exception 'You can review an order after delivery'; end if;

  insert into public.marketplace_order_reviews(order_id,customer_id,rating,comment)
  values(p_order_id,v_uid,p_rating,nullif(btrim(coalesce(p_comment,'')),''))
  on conflict(order_id) do update
  set rating=excluded.rating,
      comment=excluded.comment,
      updated_at=now()
  where public.marketplace_order_reviews.customer_id=v_uid
  returning id into v_review_id;

  return jsonb_build_object('ok',true,'review_id',v_review_id,'rating',p_rating);
end
$function$;

create or replace function public.customer_submit_marketplace_aftersales(
  p_order_id uuid,
  p_issue_type text,
  p_preferred_solution text,
  p_details text,
  p_evidence_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_order public.marketplace_orders%rowtype;
  v_case_id uuid;
  v_case_reference text;
begin
  if v_uid is null then raise exception 'Login required'; end if;

  select * into v_order
  from public.marketplace_orders
  where id=p_order_id and customer_id=v_uid;

  if not found then raise exception 'Order not found'; end if;
  if v_order.order_status<>'delivered' then raise exception 'Aftersales can be requested after the order is delivered'; end if;

  if nullif(btrim(coalesce(p_issue_type,'')),'') is null then raise exception 'Choose the aftersales issue'; end if;
  if nullif(btrim(coalesce(p_preferred_solution,'')),'') is null then raise exception 'Choose your preferred solution'; end if;
  if char_length(btrim(coalesce(p_details,'')))<5 then raise exception 'Please explain the issue'; end if;
  if char_length(coalesce(p_details,''))>3000 then raise exception 'Aftersales details must be 3000 characters or fewer'; end if;

  if exists(
    select 1 from public.marketplace_aftersales_cases c
    where c.order_id=p_order_id
      and c.customer_id=v_uid
      and c.status in ('submitted','in_review','contacted')
  ) then
    raise exception 'This order already has an active aftersales case';
  end if;

  v_case_reference='AFS-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

  insert into public.marketplace_aftersales_cases(
    case_reference,order_id,customer_id,issue_type,preferred_solution,details,evidence_path
  )
  values(
    v_case_reference,p_order_id,v_uid,
    btrim(p_issue_type),btrim(p_preferred_solution),btrim(p_details),
    nullif(btrim(coalesce(p_evidence_path,'')),'')
  )
  returning id into v_case_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  values(
    v_uid,'aftersales','Aftersales case submitted',
    'Your aftersales case '||v_case_reference||' for order '||v_order.order_reference||' has been submitted to LEOGO Customer Care.',
    'marketplace_aftersales_case',v_case_id,'aftersales_submitted','aftersales',
    jsonb_build_object('case_reference',v_case_reference,'order_id',p_order_id,'order_reference',v_order.order_reference)
  );

  return jsonb_build_object('ok',true,'case_id',v_case_id,'case_reference',v_case_reference,'status','submitted');
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
        'product_name',i.product_name,
        'variant_name',i.variant_name,
        'variant_id',i.variant_id,
        'variant_image_path',i.variant_image_path,
        'quantity',i.quantity,
        'unit_price_kes',i.unit_price_kes,
        'line_total_kes',i.line_total_kes,
        'seller_id',i.seller_id
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
        'id',c.id,'case_reference',c.case_reference,'status',c.status,
        'issue_type',c.issue_type,'preferred_solution',c.preferred_solution,
        'details',c.details,'created_at',c.created_at,'resolved_at',c.resolved_at
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

revoke execute on function public.customer_submit_order_review(uuid,integer,text) from public,anon;
revoke execute on function public.customer_submit_marketplace_aftersales(uuid,text,text,text,text) from public,anon;
revoke execute on function public.customer_list_marketplace_orders_v2() from public,anon;

grant execute on function public.customer_submit_order_review(uuid,integer,text) to authenticated;
grant execute on function public.customer_submit_marketplace_aftersales(uuid,text,text,text,text) to authenticated;
grant execute on function public.customer_list_marketplace_orders_v2() to authenticated;
