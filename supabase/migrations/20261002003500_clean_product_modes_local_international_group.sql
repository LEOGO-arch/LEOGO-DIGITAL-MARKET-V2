-- LEOGO V2 — clean per-product Local / International / MOQ / Group Order settings.
-- This keeps the existing ordinary order and Group Order workflows, while
-- separating the Seller's commercial decisions in the product configuration.

alter table public.product_shipping_profiles
  add column if not exists local_available boolean not null default true,
  add column if not exists local_price_kes numeric,
  add column if not exists local_expected_delivery_date date,
  add column if not exists international_order_enabled boolean not null default false,
  add column if not exists international_price_kes numeric,
  add column if not exists international_shipping_fee_to_center_kes numeric,
  add column if not exists distribution_center text,
  add column if not exists international_expected_delivery_date date,
  add column if not exists moq_enabled boolean not null default false,
  add column if not exists moq_minimum_quantity numeric,
  add column if not exists moq_maximum_quantity numeric;

alter table public.product_shipping_profiles
  drop constraint if exists product_shipping_profiles_local_price_check,
  drop constraint if exists product_shipping_profiles_international_price_check,
  drop constraint if exists product_shipping_profiles_international_center_fee_check,
  drop constraint if exists product_shipping_profiles_moq_min_check,
  drop constraint if exists product_shipping_profiles_moq_max_check;

alter table public.product_shipping_profiles
  add constraint product_shipping_profiles_local_price_check
    check(local_price_kes is null or local_price_kes>=0),
  add constraint product_shipping_profiles_international_price_check
    check(international_price_kes is null or international_price_kes>=0),
  add constraint product_shipping_profiles_international_center_fee_check
    check(international_shipping_fee_to_center_kes is null or international_shipping_fee_to_center_kes>=0),
  add constraint product_shipping_profiles_moq_min_check
    check(moq_minimum_quantity is null or moq_minimum_quantity>0),
  add constraint product_shipping_profiles_moq_max_check
    check(moq_maximum_quantity is null or moq_minimum_quantity is null or moq_maximum_quantity>=moq_minimum_quantity);

-- Preserve sensible meaning for any legacy Shipping / MOQ profiles.
update public.product_shipping_profiles s
set
  local_available=case when p.fulfilment_type='normal' then true else false end,
  local_price_kes=case when p.fulfilment_type='normal' then coalesce(s.local_price_kes,p.price_kes) else s.local_price_kes end,
  international_order_enabled=case
    when p.fulfilment_type in ('preorder','group_order') or s.origin_type='international' then true
    else s.international_order_enabled
  end,
  international_price_kes=case
    when p.fulfilment_type in ('preorder','group_order') or s.origin_type='international'
      then coalesce(s.international_price_kes,p.price_kes)
    else s.international_price_kes
  end,
  international_expected_delivery_date=coalesce(s.international_expected_delivery_date,s.expected_delivery_from,s.expected_delivery_to),
  moq_enabled=case when g.id is not null then true else s.moq_enabled end,
  moq_minimum_quantity=coalesce(s.moq_minimum_quantity,g.minimum_quantity),
  moq_maximum_quantity=coalesce(s.moq_maximum_quantity,g.maximum_quantity),
  distribution_center=coalesce(nullif(s.distribution_center,''),'LEOGO Distribution Center — Nairobi')
from public.seller_products p
left join lateral(
  select x.id,x.minimum_quantity,x.maximum_quantity
  from public.group_order_campaigns x
  where x.product_id=p.id
  order by x.created_at desc
  limit 1
) g on true
where p.id=s.product_id;

-- The Seller may leave the dispatch date blank until MOQ is reached.
alter table public.group_order_campaigns
  alter column expected_dispatch_date drop not null;

create or replace function public.seller_save_product_shipping(
  p_product_id uuid,
  p_shipping jsonb,
  p_campaign jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_product public.seller_products%rowtype;
  v_campaign public.group_order_campaigns%rowtype;
  v_campaign_id uuid;
  v_legacy_type text:=nullif(p_shipping->>'fulfilment_type','');
  v_local boolean;
  v_international boolean;
  v_moq boolean;
  v_group boolean;
  v_local_price numeric;
  v_international_price numeric;
  v_center_fee numeric:=coalesce(nullif(p_shipping->>'international_shipping_fee_to_center_kes','')::numeric,0);
  v_moq_min numeric;
  v_moq_max numeric;
  v_group_price numeric:=nullif(p_campaign->>'customer_unit_price_kes','')::numeric;
  v_opening timestamptz:=nullif(p_campaign->>'opening_at','')::timestamptz;
  v_closing timestamptz:=nullif(p_campaign->>'closing_at','')::timestamptz;
  v_dispatch date:=nullif(p_campaign->>'expected_dispatch_date','')::date;
  v_delivery date;
  v_primary_price numeric;
  v_type text;
  v_participants integer:=0;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  select *
  into v_product
  from public.seller_products
  where id=p_product_id and seller_id=v_uid
  for update;

  if not found then raise exception 'Seller product not found'; end if;

  -- New clients send independent switches. Legacy clients that still send
  -- fulfilment_type continue to work during deployment/cache rollover.
  v_local:=case
    when p_shipping ? 'local_available'
      then coalesce(nullif(p_shipping->>'local_available','')::boolean,true)
    when v_legacy_type in ('preorder','group_order')
      then false
    else true
  end;

  v_international:=case
    when p_shipping ? 'international_order_enabled'
      then coalesce(nullif(p_shipping->>'international_order_enabled','')::boolean,false)
    when v_legacy_type in ('preorder','group_order') or coalesce(p_shipping->>'origin_type','')='international'
      then true
    else false
  end;

  v_group:=case
    when p_campaign is not null and p_campaign ? 'enabled'
      then coalesce(nullif(p_campaign->>'enabled','')::boolean,false)
    when v_legacy_type='group_order' and p_campaign is not null
      then true
    else false
  end;

  v_moq:=case
    when p_shipping ? 'moq_enabled'
      then coalesce(nullif(p_shipping->>'moq_enabled','')::boolean,false)
    when v_group and p_campaign is not null and nullif(p_campaign->>'minimum_quantity','') is not null
      then true
    else false
  end;

  v_local_price:=coalesce(
    nullif(p_shipping->>'local_price_kes','')::numeric,
    case when v_local then v_product.price_kes else null end
  );
  v_international_price:=coalesce(
    nullif(p_shipping->>'international_price_kes','')::numeric,
    case when v_international then v_product.price_kes else null end
  );
  v_moq_min:=coalesce(
    nullif(p_shipping->>'moq_minimum_quantity','')::numeric,
    nullif(p_campaign->>'minimum_quantity','')::numeric
  );
  v_moq_max:=coalesce(
    nullif(p_shipping->>'moq_maximum_quantity','')::numeric,
    nullif(p_campaign->>'maximum_quantity','')::numeric
  );
  v_delivery:=coalesce(
    nullif(p_campaign->>'expected_delivery_date','')::date,
    nullif(p_campaign->>'expected_delivery_from','')::date,
    nullif(p_shipping->>'international_expected_delivery_date','')::date,
    nullif(p_shipping->>'expected_delivery_from','')::date,
    nullif(p_shipping->>'local_expected_delivery_date','')::date
  );

  if not v_local and not v_international then
    raise exception 'Choose at least Local availability or International order for this product';
  end if;

  if v_local then
    if v_local_price is null or v_local_price<0 then
      raise exception 'Enter the local selling price';
    end if;
  end if;

  if v_international then
    if v_international_price is null or v_international_price<0 then
      raise exception 'Enter the international item price';
    end if;
    if v_center_fee<0 then
      raise exception 'Enter a valid shipping fee to the LEOGO Distribution Center';
    end if;
    if nullif(btrim(coalesce(p_shipping->>'origin_country','')),'') is null then
      raise exception 'Enter the international origin country';
    end if;
    if coalesce(
      nullif(p_shipping->>'international_expected_delivery_date','')::date,
      nullif(p_shipping->>'expected_delivery_from','')::date,
      nullif(p_campaign->>'expected_delivery_from','')::date
    ) is null then
      raise exception 'Choose the expected international delivery date';
    end if;
  end if;

  if v_moq then
    if coalesce(v_moq_min,0)<=0 then raise exception 'MOQ must be greater than zero'; end if;
    if v_moq_max is not null and v_moq_max<v_moq_min then
      raise exception 'Maximum MOQ quantity cannot be below the minimum MOQ';
    end if;
  end if;

  if v_group then
    if not v_moq then raise exception 'Enable MOQ before sending this product to Group / Global Orders'; end if;
    if v_opening is null or v_closing is null then
      raise exception 'Set the Group Order payment opening and closing date/time';
    end if;
    if v_closing<=v_opening then
      raise exception 'Group Order payment closing time must be after the opening time';
    end if;
    if coalesce(v_group_price,-1)<0 then
      raise exception 'Enter the Group Order customer price per unit';
    end if;
    if v_delivery is null then
      raise exception 'Choose the expected delivery date before sending the product to Group Orders';
    end if;
  end if;

  -- Save the independent product modes first. Legacy estimate fields remain
  -- available for backward compatibility, but customer local delivery fees are
  -- governed by the platform delivery-rate settings rather than Seller input.
  insert into public.product_shipping_profiles(
    product_id,seller_id,origin_type,origin_country,origin_county_region,origin_town_city,dispatch_details,
    same_town_min,same_town_max,same_town_unit,
    same_county_min,same_county_max,same_county_unit,
    inter_county_min,inter_county_max,inter_county_unit,
    international_min,international_max,international_unit,
    expected_dispatch_date,expected_delivery_from,expected_delivery_to,
    local_available,local_price_kes,local_expected_delivery_date,
    international_order_enabled,international_price_kes,international_shipping_fee_to_center_kes,
    distribution_center,international_expected_delivery_date,
    moq_enabled,moq_minimum_quantity,moq_maximum_quantity,
    updated_at
  )
  values(
    p_product_id,v_uid,
    case when v_international then 'international' else 'local' end,
    nullif(btrim(coalesce(p_shipping->>'origin_country','')),''),
    nullif(btrim(coalesce(p_shipping->>'origin_county_region','')),''),
    nullif(btrim(coalesce(p_shipping->>'origin_town_city','')),''),
    nullif(btrim(coalesce(p_shipping->>'dispatch_details','')),''),
    nullif(p_shipping->>'same_town_min','')::numeric,
    nullif(p_shipping->>'same_town_max','')::numeric,
    nullif(p_shipping->>'same_town_unit',''),
    nullif(p_shipping->>'same_county_min','')::numeric,
    nullif(p_shipping->>'same_county_max','')::numeric,
    nullif(p_shipping->>'same_county_unit',''),
    nullif(p_shipping->>'inter_county_min','')::numeric,
    nullif(p_shipping->>'inter_county_max','')::numeric,
    nullif(p_shipping->>'inter_county_unit',''),
    nullif(p_shipping->>'international_min','')::numeric,
    nullif(p_shipping->>'international_max','')::numeric,
    nullif(p_shipping->>'international_unit',''),
    v_dispatch,
    coalesce(
      nullif(p_shipping->>'international_expected_delivery_date','')::date,
      nullif(p_shipping->>'expected_delivery_from','')::date,
      nullif(p_shipping->>'local_expected_delivery_date','')::date
    ),
    null,
    v_local,v_local_price,
    coalesce(
      nullif(p_shipping->>'local_expected_delivery_date','')::date,
      case when v_local and not v_international then nullif(p_shipping->>'expected_delivery_from','')::date else null end
    ),
    v_international,v_international_price,v_center_fee,
    coalesce(nullif(btrim(coalesce(p_shipping->>'distribution_center','')),''),'LEOGO Distribution Center — Nairobi'),
    coalesce(
      nullif(p_shipping->>'international_expected_delivery_date','')::date,
      case when v_international then nullif(p_shipping->>'expected_delivery_from','')::date else null end,
      case when v_international then nullif(p_campaign->>'expected_delivery_from','')::date else null end
    ),
    v_moq,v_moq_min,v_moq_max,
    now()
  )
  on conflict(product_id) do update set
    origin_type=excluded.origin_type,
    origin_country=excluded.origin_country,
    origin_county_region=excluded.origin_county_region,
    origin_town_city=excluded.origin_town_city,
    dispatch_details=excluded.dispatch_details,
    same_town_min=coalesce(excluded.same_town_min,public.product_shipping_profiles.same_town_min),
    same_town_max=coalesce(excluded.same_town_max,public.product_shipping_profiles.same_town_max),
    same_town_unit=coalesce(excluded.same_town_unit,public.product_shipping_profiles.same_town_unit),
    same_county_min=coalesce(excluded.same_county_min,public.product_shipping_profiles.same_county_min),
    same_county_max=coalesce(excluded.same_county_max,public.product_shipping_profiles.same_county_max),
    same_county_unit=coalesce(excluded.same_county_unit,public.product_shipping_profiles.same_county_unit),
    inter_county_min=coalesce(excluded.inter_county_min,public.product_shipping_profiles.inter_county_min),
    inter_county_max=coalesce(excluded.inter_county_max,public.product_shipping_profiles.inter_county_max),
    inter_county_unit=coalesce(excluded.inter_county_unit,public.product_shipping_profiles.inter_county_unit),
    international_min=coalesce(excluded.international_min,public.product_shipping_profiles.international_min),
    international_max=coalesce(excluded.international_max,public.product_shipping_profiles.international_max),
    international_unit=coalesce(excluded.international_unit,public.product_shipping_profiles.international_unit),
    expected_dispatch_date=excluded.expected_dispatch_date,
    expected_delivery_from=excluded.expected_delivery_from,
    expected_delivery_to=excluded.expected_delivery_to,
    local_available=excluded.local_available,
    local_price_kes=excluded.local_price_kes,
    local_expected_delivery_date=excluded.local_expected_delivery_date,
    international_order_enabled=excluded.international_order_enabled,
    international_price_kes=excluded.international_price_kes,
    international_shipping_fee_to_center_kes=excluded.international_shipping_fee_to_center_kes,
    distribution_center=excluded.distribution_center,
    international_expected_delivery_date=excluded.international_expected_delivery_date,
    moq_enabled=excluded.moq_enabled,
    moq_minimum_quantity=excluded.moq_minimum_quantity,
    moq_maximum_quantity=excluded.moq_maximum_quantity,
    updated_at=now();

  select *
  into v_campaign
  from public.group_order_campaigns
  where product_id=p_product_id
    and status in (
      'collecting_orders','paused','moq_reached','order_confirmed',
      'seller_preparing','dispatched_origin','in_transit',
      'arrived_destination','at_sorting_center','out_for_delivery','ready_pickup'
    )
  order by created_at desc
  limit 1
  for update;

  if found then
    v_campaign_id:=v_campaign.id;
    select count(*)::integer into v_participants
    from public.group_order_participations
    where campaign_id=v_campaign.id;
  end if;

  if v_group then
    if v_campaign_id is null then
      insert into public.group_order_campaigns(
        campaign_reference,product_id,seller_id,
        minimum_quantity,maximum_quantity,customer_unit_price_kes,
        opening_at,closing_at,expected_dispatch_date,
        expected_delivery_from,expected_delivery_to,close_policy
      )
      values(
        private.group_campaign_reference(),p_product_id,v_uid,
        v_moq_min,v_moq_max,v_group_price,
        v_opening,v_closing,v_dispatch,
        v_delivery,null,
        coalesce(nullif(p_campaign->>'close_policy',''),'deadline')
      )
      returning id into v_campaign_id;
    else
      update public.group_order_campaigns
      set
        minimum_quantity=v_moq_min,
        maximum_quantity=v_moq_max,
        customer_unit_price_kes=v_group_price,
        opening_at=v_opening,
        closing_at=v_closing,
        expected_dispatch_date=v_dispatch,
        expected_delivery_from=v_delivery,
        expected_delivery_to=null,
        close_policy=coalesce(nullif(p_campaign->>'close_policy',''),'deadline'),
        updated_at=now()
      where id=v_campaign_id;
    end if;

    v_type:='group_order';
  else
    if v_campaign_id is not null then
      if v_participants>0 then
        raise exception 'Customers have already joined this Group Order. LEOGO Admin must close or cancel it before you remove the product from Group Orders.';
      end if;
      if v_campaign.status not in ('collecting_orders','paused') then
        raise exception 'This Group Order has already progressed. LEOGO Admin must close or cancel it before removal.';
      end if;

      update public.group_order_campaigns
      set status='cancelled',closed_at=now(),updated_at=now()
      where id=v_campaign_id;

      insert into public.group_order_shipment_events(
        campaign_id,status,event_note,actor_user_id,actor_role
      )
      values(
        v_campaign_id,'cancelled','Seller removed product from Group / Global Orders',v_uid,'seller'
      );
    end if;

    v_campaign_id:=null;
    v_type:=case when v_international and not v_local then 'preorder' else 'normal' end;
  end if;

  -- Keep the core price compatible with the already-stable ordinary checkout:
  -- Local price is primary when local stock exists; otherwise international
  -- landed price (item + freight to the Distribution Center) is primary.
  v_primary_price:=case
    when v_local then v_local_price
    when v_international then v_international_price+v_center_fee
    else v_product.price_kes
  end;

  update public.seller_products
  set fulfilment_type=v_type,
      price_kes=v_primary_price,
      updated_at=now()
  where id=p_product_id;

  return jsonb_build_object(
    'ok',true,
    'product_id',p_product_id,
    'fulfilment_type',v_type,
    'campaign_id',v_campaign_id,
    'local_available',v_local,
    'international_order_enabled',v_international,
    'moq_enabled',v_moq,
    'group_enabled',v_group
  );
end
$function$;

-- A Group Order can be removed by the Seller only before any customer joins.
create or replace function public.seller_remove_product_from_group(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  c public.group_order_campaigns%rowtype;
  s public.product_shipping_profiles%rowtype;
  v_type text:='normal';
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(
    select 1 from public.seller_products p
    where p.id=p_product_id and p.seller_id=v_uid
  ) then
    raise exception 'Seller product not found';
  end if;

  select * into c
  from public.group_order_campaigns
  where product_id=p_product_id
    and seller_id=v_uid
    and status in (
      'collecting_orders','paused','moq_reached','order_confirmed',
      'seller_preparing','dispatched_origin','in_transit',
      'arrived_destination','at_sorting_center','out_for_delivery','ready_pickup'
    )
  order by created_at desc
  limit 1
  for update;

  if found then
    if exists(select 1 from public.group_order_participations p where p.campaign_id=c.id) then
      raise exception 'Customers have already joined this Group Order. LEOGO Admin must close or cancel it.';
    end if;
    if c.status not in ('collecting_orders','paused') then
      raise exception 'This Group Order has progressed beyond Seller removal. LEOGO Admin must close or cancel it.';
    end if;

    update public.group_order_campaigns
    set status='cancelled',closed_at=now(),updated_at=now()
    where id=c.id;

    insert into public.group_order_shipment_events(
      campaign_id,status,event_note,actor_user_id,actor_role
    )
    values(c.id,'cancelled','Seller removed product from Group / Global Orders',v_uid,'seller');
  end if;

  select * into s
  from public.product_shipping_profiles
  where product_id=p_product_id;

  v_type:=case
    when coalesce(s.international_order_enabled,false) and not coalesce(s.local_available,true) then 'preorder'
    else 'normal'
  end;

  update public.seller_products
  set fulfilment_type=v_type,updated_at=now()
  where id=p_product_id and seller_id=v_uid;

  return jsonb_build_object('ok',true,'product_id',p_product_id,'fulfilment_type',v_type);
end
$function$;

-- MOQ terms remain protected after the first customer joins. The expected
-- dispatch date is intentionally allowed to be set/updated once MOQ has closed.
create or replace function private.guard_group_campaign_seller_term_edits()
returns trigger
language plpgsql
set search_path=''
as $function$
begin
  if (select auth.uid())=old.seller_id
     and not private.is_leogo_admin('orders.manage')
     and exists (
       select 1
       from public.group_order_participations p
       where p.campaign_id=old.id
     )
     and (
       new.minimum_quantity is distinct from old.minimum_quantity
       or new.maximum_quantity is distinct from old.maximum_quantity
       or new.customer_unit_price_kes is distinct from old.customer_unit_price_kes
       or new.opening_at is distinct from old.opening_at
       or new.closing_at is distinct from old.closing_at
       or (
         new.expected_dispatch_date is distinct from old.expected_dispatch_date
         and old.status not in ('moq_reached','order_confirmed','seller_preparing')
       )
       or new.expected_delivery_from is distinct from old.expected_delivery_from
       or new.expected_delivery_to is distinct from old.expected_delivery_to
       or new.close_policy is distinct from old.close_policy
     )
  then
    raise exception 'Group Order terms are locked after the first customer joins. Only the expected dispatch date can be updated after MOQ closes.';
  end if;
  return new;
end
$function$;

create or replace function public.seller_update_group_dispatch_date(
  p_campaign_id uuid,
  p_expected_dispatch_date date,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  c public.group_order_campaigns%rowtype;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if p_expected_dispatch_date is null then raise exception 'Choose the expected dispatch date'; end if;
  if p_expected_dispatch_date<current_date then raise exception 'Dispatch date cannot be in the past'; end if;

  select * into c
  from public.group_order_campaigns
  where id=p_campaign_id and seller_id=v_uid
  for update;

  if not found then raise exception 'Seller Group Order not found'; end if;
  if c.status not in ('moq_reached','order_confirmed','seller_preparing') then
    raise exception 'The dispatch date can be set after MOQ closes and before the order is dispatched';
  end if;

  update public.group_order_campaigns
  set expected_dispatch_date=p_expected_dispatch_date,updated_at=now()
  where id=c.id;

  insert into public.group_order_shipment_events(
    campaign_id,status,event_note,actor_user_id,actor_role
  )
  values(
    c.id,'dispatch_date_updated',
    coalesce(nullif(btrim(coalesce(p_note,'')),''),
      'Expected dispatch date updated to '||to_char(p_expected_dispatch_date,'DD Mon YYYY')),
    v_uid,'seller'
  );

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  select distinct
    customer_id,
    'group_order',
    'Group Order dispatch date updated',
    'Expected dispatch date for '||c.campaign_reference||' is now '||
      to_char(p_expected_dispatch_date,'DD Mon YYYY')||'.',
    'group_order_campaign',
    c.id,
    'group_order_dispatch_'||extract(epoch from now())::bigint,
    'orders',
    jsonb_build_object(
      'campaign_reference',c.campaign_reference,
      'expected_dispatch_date',p_expected_dispatch_date
    )
  from public.group_order_participations
  where campaign_id=c.id
    and payment_status not in ('rejected','refunded');

  return jsonb_build_object(
    'ok',true,
    'campaign_id',c.id,
    'expected_dispatch_date',p_expected_dispatch_date
  );
end
$function$;

-- Local + Group is a supported dual mode. The ordinary checkout remains
-- available only for the Local offer; Group-only products still use Join Group.
do $block$
declare
  v_def text;
  v_old text:='if v_product.fulfilment_type=''group_order'' then raise exception ''Use Join Group Order for MOQ products''; end if;';
  v_new text:='if v_product.fulfilment_type=''group_order'' and not coalesce((select s.local_available from public.product_shipping_profiles s where s.product_id=v_product.id),false) then raise exception ''Use Join Group Order for MOQ products''; end if;';
begin
  select pg_get_functiondef(
    'public.customer_create_marketplace_order(jsonb,text,text,text,text,text,text,text,text,uuid,text,text)'::regprocedure
  ) into v_def;
  if position(v_old in v_def)=0 then
    raise exception 'Marketplace Group Order validation anchor was not found';
  end if;
  execute replace(v_def,v_old,v_new);
end
$block$;

-- Include active campaign + platform local delivery rules in the public product
-- payload. This is display data only; checkout continues to calculate fees from
-- the existing delivery-rate workflow.
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
      and c.code<>'alcoholic_leogo_bar'
  ) q;

  return v_result;
end
$function$;

revoke execute on function public.seller_remove_product_from_group(uuid) from public,anon;
grant execute on function public.seller_remove_product_from_group(uuid) to authenticated;

revoke execute on function public.seller_update_group_dispatch_date(uuid,date,text) from public,anon;
grant execute on function public.seller_update_group_dispatch_date(uuid,date,text) to authenticated;
