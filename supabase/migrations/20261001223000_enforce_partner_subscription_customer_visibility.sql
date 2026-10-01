-- LEOGO partner subscription enforcement on customer-facing availability.
-- Approved listings/profiles remain stored and approved, but are hidden from
-- customers while the owning partner has no active subscription. They become
-- visible again automatically when the subscription becomes active.

-- 1) Seller marketplace/catalogue visibility.
create or replace function public.customer_marketplace_catalogue()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  perform private.close_expired_group_campaigns();
  select coalesce(jsonb_agg(row_data order by (row_data->>'updated_at')::timestamptz desc),'[]'::jsonb)
  into v_result
  from (
    select to_jsonb(p)||jsonb_build_object(
      'seller_name',s.business_name,
      'category_code',c.code,
      'category_name',coalesce(nullif(p.custom_category_name,''),c.name),
      'category_is_aggregator',c.is_aggregator,
      'category_restricted',c.restricted_category,
      'subcategory_name',coalesce(nullif(p.custom_subcategory_name,''),sc.name),
      'shipping_profile',case when ship.product_id is null then null else to_jsonb(ship)-'seller_id'-'created_at'-'updated_at' end,
      'shipping_defaults',(select to_jsonb(d)-'updated_by'-'updated_at' from public.platform_shipping_defaults d where d.id=1),
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
      order by g.created_at desc
      limit 1
    ) go on true
    where s.application_status='approved'
      and private.partner_has_active_subscription(s.user_id,'seller')
      and p.product_approval_status='approved'
      and p.listing_status='active'
      and p.availability_status in ('available','out_of_stock')
      and c.is_active
      and c.code<>'alcoholic_leogo_bar'
  ) q;
  return v_result;
end
$function$;

create or replace function public.customer_marketplace_products()
returns table(
  id uuid,
  seller_id uuid,
  seller_name text,
  product_name text,
  price_kes numeric,
  availability_status text,
  quantity_available numeric,
  measurement_unit text,
  accepts_lipa_pole_pole boolean,
  lipa_pole_pole_first_deposit_kes numeric,
  lipa_pole_pole_max_days integer,
  product_details text,
  main_image_path text,
  flash_sale_requested boolean,
  flash_sale_price_kes numeric,
  flash_sale_status text
)
language sql
security definer
set search_path=''
as $function$
  select p.id,p.seller_id,s.business_name,p.product_name,p.price_kes,p.availability_status,p.quantity_available,
    p.measurement_unit,p.accepts_lipa_pole_pole,p.lipa_pole_pole_first_deposit_kes,p.lipa_pole_pole_max_days,
    p.product_details,p.main_image_path,p.flash_sale_requested,p.flash_sale_price_kes,p.flash_sale_status
  from public.seller_products p
  join public.seller_accounts s on s.user_id=p.seller_id
  join public.product_categories c on c.id=p.category_id
  where s.application_status='approved'
    and private.partner_has_active_subscription(s.user_id,'seller')
    and p.product_approval_status='approved'
    and p.listing_status='active'
    and p.availability_status in ('available','out_of_stock')
    and c.is_active
    and not c.restricted_category
  order by random();
$function$;

create or replace function public.customer_nearby_sellers()
returns table(
  seller_id uuid,
  business_name text,
  town text,
  location_details text,
  county text,
  sub_county text,
  proximity text,
  active_product_count bigint
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_county_code text;
  v_subcounty_code text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select p.county_code,p.sub_county_code
  into v_county_code,v_subcounty_code
  from public.customer_profiles p
  where p.user_id=v_uid;

  if v_county_code is null then
    return;
  end if;

  return query
  select
    s.user_id,s.business_name,s.town,s.location_details,s.county,s.sub_county,
    case when s.sub_county_code=v_subcounty_code then 'same_subcounty' else 'same_county' end::text,
    count(p.id) filter (
      where p.listing_status='active'
        and p.availability_status in ('available','out_of_stock')
    )::bigint
  from public.seller_accounts s
  left join public.seller_products p on p.seller_id=s.user_id
  where s.application_status='approved'
    and private.partner_has_active_subscription(s.user_id,'seller')
    and s.county_code=v_county_code
  group by s.user_id,s.business_name,s.town,s.location_details,s.county,s.sub_county,s.sub_county_code
  order by (s.sub_county_code=v_subcounty_code) desc,s.business_name;
end
$function$;

-- Keep direct customer SELECTs consistent with the customer catalogue.
drop policy if exists "Customers read active seller products" on public.seller_products;
create policy "Customers read active seller products"
on public.seller_products
for select
using (
  listing_status='active'
  and availability_status in ('available','out_of_stock')
  and private.partner_has_active_subscription(seller_id,'seller')
  and exists(
    select 1
    from public.seller_accounts s
    where s.user_id=seller_products.seller_id
      and s.application_status='approved'
  )
  and exists(
    select 1
    from public.product_categories c
    where c.id=seller_products.category_id
      and c.is_active
      and not c.restricted_category
  )
);

-- 2) Service Provider public profile/listing visibility.
create or replace function public.customer_public_service_providers()
returns table(
  provider_id uuid,
  business_name text,
  primary_service text,
  service_category text,
  county text,
  sub_county text,
  town text,
  business_description text,
  service_area_notes text,
  profile_picture_path text,
  approved_service_count bigint
)
language sql
security definer
set search_path=''
as $function$
  select
    p.user_id,
    p.business_name,
    p.primary_service,
    p.service_category,
    p.county,
    p.sub_county,
    p.town,
    p.business_description,
    p.service_area_notes,
    p.profile_picture_path,
    count(s.id) filter (where s.approval_status='approved' and s.is_available)::bigint
  from public.service_provider_accounts p
  left join public.service_provider_services s on s.provider_id=p.user_id
  where p.application_status='approved'
    and p.availability_status <> 'offline'
    and private.partner_has_active_subscription(p.user_id,'service_provider')
  group by
    p.user_id,p.business_name,p.primary_service,p.service_category,p.county,p.sub_county,p.town,
    p.business_description,p.service_area_notes,p.profile_picture_path,p.approved_at
  order by p.approved_at desc nulls last,p.business_name;
$function$;

create or replace function public.customer_public_services()
returns table(
  service_id uuid,
  provider_id uuid,
  service_name text,
  category_name text,
  description text,
  pricing_model text,
  price_from_kes numeric,
  price_to_kes numeric,
  unit_label text,
  service_area text,
  availability_notes text,
  business_name text,
  primary_service text,
  county text,
  sub_county text,
  town text,
  profile_picture_path text,
  rating_average numeric,
  rating_count bigint
)
language sql
security definer
set search_path=''
as $function$
  select
    s.id,s.provider_id,s.service_name,s.category_name,s.description,
    s.pricing_model,s.price_from_kes,s.price_to_kes,s.unit_label,
    s.service_area,s.availability_notes,
    p.business_name,p.primary_service,p.county,p.sub_county,p.town,p.profile_picture_path,
    coalesce((
      select round(avg(r.rating)::numeric,1)
      from public.partner_service_reviews r
      where r.partner_type='service_provider'
        and r.service_id=s.id
        and r.moderation_status='approved'
    ),0::numeric) as rating_average,
    (
      select count(*)
      from public.partner_service_reviews r
      where r.partner_type='service_provider'
        and r.service_id=s.id
        and r.moderation_status='approved'
    )::bigint as rating_count
  from public.service_provider_services s
  join public.service_provider_accounts p on p.user_id=s.provider_id
  where s.approval_status='approved'
    and s.is_available
    and p.application_status='approved'
    and p.availability_status<>'offline'
    and private.partner_has_active_subscription(p.user_id,'service_provider')
  order by s.approved_at desc nulls last,s.service_name;
$function$;

create or replace function public.customer_public_service_flash_sales()
returns table(
  service_id uuid,
  normal_price_kes numeric,
  flash_sale_price_kes numeric,
  flash_sale_starts_at timestamptz,
  flash_sale_ends_at timestamptz
)
language sql
security definer
set search_path=''
as $function$
  select s.id,s.price_from_kes,s.flash_sale_price_kes,s.flash_sale_starts_at,s.flash_sale_ends_at
  from public.service_provider_services s
  join public.service_provider_accounts p on p.user_id=s.provider_id
  where s.approval_status='approved'
    and s.is_available
    and s.pricing_model='fixed'
    and s.flash_sale_requested
    and s.flash_sale_status='approved'
    and s.flash_sale_price_kes>0
    and s.flash_sale_price_kes<s.price_from_kes
    and s.flash_sale_starts_at<=now()
    and s.flash_sale_ends_at>now()
    and p.application_status='approved'
    and p.availability_status<>'offline'
    and private.partner_has_active_subscription(p.user_id,'service_provider');
$function$;

-- 3) Cyber public shop/service/product visibility.
create or replace function public.public_list_cyber_shops()
returns table(
  provider_id uuid,
  business_name text,
  town text,
  county text,
  location_details text,
  shop_latitude numeric,
  shop_longitude numeric,
  shop_map_link text,
  business_description text,
  profile_picture_path text,
  availability_status text,
  service_count bigint,
  product_count bigint
)
language sql
security definer
set search_path=''
as $function$
  select c.user_id,c.business_name,c.town,c.county,c.location_details,c.shop_latitude,c.shop_longitude,
         c.shop_map_link,c.business_description,c.profile_picture_path,c.availability_status,
         (select count(*) from public.cyber_services s where s.provider_id=c.user_id and s.approval_status='approved' and s.is_available),
         (select count(*) from public.cyber_products p where p.provider_id=c.user_id and p.approval_status='approved' and p.availability_status='available' and p.quantity_available>0)
  from public.cyber_provider_accounts c
  where c.application_status='approved'
    and private.partner_has_active_subscription(c.user_id,'cyber')
  order by c.business_name;
$function$;

create or replace function public.public_list_cyber_services(p_provider_id uuid default null)
returns table(
  id uuid,
  provider_id uuid,
  provider_name text,
  service_name text,
  service_category text,
  description text,
  pricing_model text,
  price_kes numeric,
  unit_label text,
  requires_file_upload boolean,
  accepts_multiple_files boolean
)
language sql
security definer
set search_path=''
as $function$
  select s.id,s.provider_id,c.business_name,s.service_name,s.service_category,s.description,s.pricing_model,
         s.price_kes,s.unit_label,s.requires_file_upload,s.accepts_multiple_files
  from public.cyber_services s
  join public.cyber_provider_accounts c on c.user_id=s.provider_id
  where c.application_status='approved'
    and private.partner_has_active_subscription(c.user_id,'cyber')
    and s.approval_status='approved'
    and s.is_available
    and (p_provider_id is null or s.provider_id=p_provider_id)
  order by c.business_name,s.service_category,s.service_name;
$function$;

create or replace function public.public_list_cyber_products(p_provider_id uuid default null)
returns table(
  id uuid,
  provider_id uuid,
  provider_name text,
  product_name text,
  description text,
  price_kes numeric,
  quantity_available numeric,
  measurement_unit text,
  image_path text
)
language sql
security definer
set search_path=''
as $function$
  select p.id,p.provider_id,c.business_name,p.product_name,p.description,p.price_kes,p.quantity_available,p.measurement_unit,p.image_path
  from public.cyber_products p
  join public.cyber_provider_accounts c on c.user_id=p.provider_id
  where c.application_status='approved'
    and private.partner_has_active_subscription(c.user_id,'cyber')
    and p.approval_status='approved'
    and p.availability_status='available'
    and p.quantity_available>0
    and (p_provider_id is null or p.provider_id=p_provider_id)
  order by c.business_name,p.product_name;
$function$;

create or replace function public.public_list_cyber_service_flash_sales(p_provider_id uuid default null)
returns table(
  service_id uuid,
  flash_sale_price_kes numeric,
  flash_sale_starts_at timestamptz,
  flash_sale_ends_at timestamptz
)
language sql
security definer
set search_path=''
as $function$
  select s.id,s.flash_sale_price_kes,s.flash_sale_starts_at,s.flash_sale_ends_at
  from public.cyber_services s
  join public.cyber_provider_accounts c on c.user_id=s.provider_id
  where c.application_status='approved'
    and private.partner_has_active_subscription(c.user_id,'cyber')
    and s.approval_status='approved'
    and s.is_available=true
    and s.pricing_model<>'quote'
    and s.flash_sale_requested=true
    and s.flash_sale_status='approved'
    and s.flash_sale_price_kes is not null
    and s.flash_sale_starts_at<=now()
    and s.flash_sale_ends_at>now()
    and (p_provider_id is null or s.provider_id=p_provider_id)
  order by s.flash_sale_ends_at;
$function$;

-- 4) Transport public vehicle/provider visibility.
create or replace function public.public_list_transport_vehicles()
returns jsonb
language sql
security definer
set search_path=''
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'vehicle_id',v.id,
    'provider_id',p.user_id,
    'provider_name',p.business_name,
    'provider_type',p.provider_type,
    'county',p.county,
    'sub_county',p.sub_county,
    'town',p.town,
    'services_offered',p.services_offered,
    'vehicle_type',v.vehicle_type,
    'registration_number',v.registration_number,
    'make_model',v.make_model,
    'colour',v.colour,
    'service_types',v.service_types,
    'capacity_description',v.capacity_description,
    'max_weight_kg',v.max_weight_kg,
    'service_area',v.service_area,
    'waiting_point_name',v.waiting_point_name,
    'waiting_point_latitude',v.waiting_point_latitude,
    'waiting_point_longitude',v.waiting_point_longitude,
    'waiting_point_map_link',coalesce(
      nullif(v.waiting_point_map_link,''),
      case when v.waiting_point_latitude is not null and v.waiting_point_longitude is not null
        then 'https://www.google.com/maps?q='||v.waiting_point_latitude::text||','||v.waiting_point_longitude::text
        else null end
    ),
    'vehicle_profile_picture_path',v.vehicle_profile_picture_path,
    'rating_average',coalesce((
      select round(avg(r.rating)::numeric,1)
      from public.partner_service_reviews r
      where r.partner_type='transport'
        and r.provider_id=p.user_id
        and r.vehicle_id=v.id
        and r.moderation_status='approved'
    ),0::numeric),
    'rating_count',(
      select count(*)
      from public.partner_service_reviews r
      where r.partner_type='transport'
        and r.provider_id=p.user_id
        and r.vehicle_id=v.id
        and r.moderation_status='approved'
    )
  ) order by p.business_name,v.vehicle_type),'[]'::jsonb)
  from public.transport_provider_accounts p
  join public.transport_provider_vehicles v on v.provider_id=p.user_id
  where p.application_status='approved'
    and p.availability_status<>'offline'
    and private.partner_has_active_subscription(p.user_id,'transport')
    and v.approval_status='approved'
    and v.is_available=true;
$function$;

-- 5) Accommodation public RLS already routes through this helper, so adding
-- subscription eligibility here hides properties, units and rates together.
create or replace function private.accommodation_host_is_public(p_host_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists (
    select 1
    from public.accommodation_hosts h
    where h.id=p_host_id
      and h.verification_status='approved'
      and private.partner_has_active_subscription(h.user_id,'accommodation')
  );
$function$;

-- 6) Unified customer Flash Sale feed must also obey each partner subscription.
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
        and private.partner_has_active_subscription(s.user_id,'seller')
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
        and private.partner_has_active_subscription(a.user_id,'service_provider')
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
        and private.partner_has_active_subscription(a.user_id,'cyber')
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

-- 7) Server-side insert guards prevent stale pages/direct RPC calls from
-- creating new customer business against an inactive subscription.
create or replace function private.require_active_partner_subscription(
  p_user_id uuid,
  p_partner_type text
)
returns void
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if p_user_id is null
     or not private.partner_has_active_subscription(p_user_id,p_partner_type) then
    raise exception 'This % partner is temporarily unavailable because the subscription is inactive. Please choose another active LEOGO partner.',
      replace(p_partner_type,'_',' ');
  end if;
end
$function$;

revoke execute on function private.require_active_partner_subscription(uuid,text)
from public,anon,authenticated;

create or replace function private.guard_marketplace_order_item_partner_subscription()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.require_active_partner_subscription(new.seller_id,'seller');
  return new;
end
$function$;

create or replace function private.guard_group_order_partner_subscription()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare v_seller_id uuid;
begin
  select seller_id into v_seller_id
  from public.group_order_campaigns
  where id=new.campaign_id;

  perform private.require_active_partner_subscription(v_seller_id,'seller');
  return new;
end
$function$;

create or replace function private.guard_service_request_partner_subscription()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.require_active_partner_subscription(new.provider_id,'service_provider');
  return new;
end
$function$;

create or replace function private.guard_cyber_order_partner_subscription()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.require_active_partner_subscription(new.provider_id,'cyber');
  return new;
end
$function$;

create or replace function private.guard_transport_request_partner_subscription()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.requested_provider_id is not null then
    perform private.require_active_partner_subscription(new.requested_provider_id,'transport');
  end if;
  return new;
end
$function$;

create or replace function private.guard_accommodation_booking_partner_subscription()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare v_user_id uuid;
begin
  select h.user_id
  into v_user_id
  from public.accommodation_properties p
  join public.accommodation_hosts h on h.id=p.host_id
  where p.id=new.property_id;

  perform private.require_active_partner_subscription(v_user_id,'accommodation');
  return new;
end
$function$;

drop trigger if exists marketplace_order_items_partner_subscription_guard on public.marketplace_order_items;
create trigger marketplace_order_items_partner_subscription_guard
before insert on public.marketplace_order_items
for each row execute function private.guard_marketplace_order_item_partner_subscription();

drop trigger if exists group_order_partner_subscription_guard on public.group_order_participations;
create trigger group_order_partner_subscription_guard
before insert on public.group_order_participations
for each row execute function private.guard_group_order_partner_subscription();

drop trigger if exists service_request_partner_subscription_guard on public.service_requests;
create trigger service_request_partner_subscription_guard
before insert on public.service_requests
for each row execute function private.guard_service_request_partner_subscription();

drop trigger if exists cyber_order_partner_subscription_guard on public.cyber_orders;
create trigger cyber_order_partner_subscription_guard
before insert on public.cyber_orders
for each row execute function private.guard_cyber_order_partner_subscription();

drop trigger if exists transport_request_partner_subscription_guard on public.transport_requests;
create trigger transport_request_partner_subscription_guard
before insert on public.transport_requests
for each row execute function private.guard_transport_request_partner_subscription();

drop trigger if exists accommodation_booking_partner_subscription_guard on public.accommodation_bookings;
create trigger accommodation_booking_partner_subscription_guard
before insert on public.accommodation_bookings
for each row execute function private.guard_accommodation_booking_partner_subscription();
