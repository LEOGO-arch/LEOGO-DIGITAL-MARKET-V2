-- LEOGO V2 — additive product shipping profiles and Group / Global Orders (MOQ).
-- Ordinary products and marketplace orders retain their existing tables and workflow.

alter table public.seller_products
  add column if not exists fulfilment_type text not null default 'normal';

alter table public.seller_products drop constraint if exists seller_products_fulfilment_type_check;
alter table public.seller_products add constraint seller_products_fulfilment_type_check
  check (fulfilment_type in ('normal','preorder','group_order'));

-- Group Orders never enter the ordinary cart/order RPC, including crafted API calls.
do $block$
declare v_def text; v_anchor text := 'if not found then raise exception ''A product in your cart is no longer approved or available''; end if;';
begin
  select pg_get_functiondef('public.customer_create_marketplace_order(jsonb,text,text,text,text,text,text,text,text,uuid,text,text)'::regprocedure) into v_def;
  if position(v_anchor in v_def)=0 then raise exception 'Marketplace product validation anchor was not found'; end if;
  v_def:=replace(v_def,v_anchor,v_anchor||chr(10)||'    if v_product.fulfilment_type=''group_order'' then raise exception ''Use Join Group Order for MOQ products''; end if;');
  execute v_def;
end $block$;

create table if not exists public.product_shipping_profiles (
  product_id uuid primary key references public.seller_products(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  origin_type text not null default 'domestic' check (origin_type in ('local','domestic','international')),
  origin_country text,
  origin_county_region text,
  origin_town_city text,
  dispatch_details text,
  same_town_min numeric check (same_town_min is null or same_town_min >= 0),
  same_town_max numeric check (same_town_max is null or same_town_max >= same_town_min),
  same_town_unit text check (same_town_unit is null or same_town_unit in ('minutes','hours','days')),
  same_county_min numeric check (same_county_min is null or same_county_min >= 0),
  same_county_max numeric check (same_county_max is null or same_county_max >= same_county_min),
  same_county_unit text check (same_county_unit is null or same_county_unit in ('minutes','hours','days')),
  inter_county_min numeric check (inter_county_min is null or inter_county_min >= 0),
  inter_county_max numeric check (inter_county_max is null or inter_county_max >= inter_county_min),
  inter_county_unit text check (inter_county_unit is null or inter_county_unit in ('minutes','hours','days')),
  international_min numeric check (international_min is null or international_min >= 0),
  international_max numeric check (international_max is null or international_max >= international_min),
  international_unit text check (international_unit is null or international_unit in ('minutes','hours','days')),
  expected_dispatch_date date,
  expected_delivery_from date,
  expected_delivery_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expected_delivery_to is null or expected_delivery_from is null or expected_delivery_to >= expected_delivery_from)
);
create index if not exists product_shipping_profiles_seller_idx on public.product_shipping_profiles(seller_id,updated_at desc);
alter table public.product_shipping_profiles enable row level security;

create table if not exists public.platform_shipping_defaults (
  id smallint primary key default 1 check (id=1),
  local_min numeric not null default 30,
  local_max numeric not null default 60,
  local_unit text not null default 'minutes' check (local_unit in ('minutes','hours','days')),
  same_county_min numeric not null default 1,
  same_county_max numeric not null default 2,
  same_county_unit text not null default 'days' check (same_county_unit in ('minutes','hours','days')),
  inter_county_min numeric not null default 2,
  inter_county_max numeric not null default 3,
  inter_county_unit text not null default 'days' check (inter_county_unit in ('minutes','hours','days')),
  international_min numeric not null default 20,
  international_max numeric not null default 25,
  international_unit text not null default 'days' check (international_unit in ('minutes','hours','days')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (local_min>=0 and local_max>=local_min and same_county_min>=0 and same_county_max>=same_county_min and inter_county_min>=0 and inter_county_max>=inter_county_min and international_min>=0 and international_max>=international_min)
);
insert into public.platform_shipping_defaults(id) values(1) on conflict(id) do nothing;
alter table public.platform_shipping_defaults enable row level security;

create table if not exists public.group_order_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_reference text not null unique,
  product_id uuid not null references public.seller_products(id) on delete restrict,
  seller_id uuid not null references auth.users(id) on delete restrict,
  minimum_quantity numeric not null check (minimum_quantity > 0),
  maximum_quantity numeric check (maximum_quantity is null or maximum_quantity >= minimum_quantity),
  customer_unit_price_kes numeric not null check (customer_unit_price_kes >= 0),
  opening_at timestamptz not null,
  closing_at timestamptz not null,
  expected_dispatch_date date not null,
  expected_delivery_from date not null,
  expected_delivery_to date,
  close_policy text not null default 'deadline' check (close_policy in ('moq','deadline')),
  status text not null default 'collecting_orders' check (status in (
    'collecting_orders','moq_reached','order_confirmed','seller_preparing','dispatched_origin','in_transit',
    'arrived_destination','at_sorting_center','out_for_delivery','ready_pickup','delivered_collected',
    'moq_failed_closed','cancelled','refund_pending','refunded','paused'
  )),
  quantity_committed numeric not null default 0 check (quantity_committed >= 0),
  participant_count integer not null default 0 check (participant_count >= 0),
  amount_committed_kes numeric not null default 0 check (amount_committed_kes >= 0),
  amount_paid_kes numeric not null default 0 check (amount_paid_kes >= 0),
  moq_reached_at timestamptz,
  confirmed_at timestamptz,
  closed_at timestamptz,
  refund_status text not null default 'not_required' check (refund_status in ('not_required','resolution_required','in_progress','completed')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closing_at > opening_at),
  check (expected_delivery_to is null or expected_delivery_to >= expected_delivery_from)
);
create unique index if not exists group_order_one_open_product_idx on public.group_order_campaigns(product_id)
  where status in ('collecting_orders','moq_reached','order_confirmed','seller_preparing','dispatched_origin','in_transit','arrived_destination','at_sorting_center','out_for_delivery','ready_pickup','paused');
create index if not exists group_order_campaigns_seller_idx on public.group_order_campaigns(seller_id,updated_at desc);
create index if not exists group_order_campaigns_status_deadline_idx on public.group_order_campaigns(status,closing_at);
alter table public.group_order_campaigns enable row level security;

create table if not exists public.group_order_participations (
  id uuid primary key default gen_random_uuid(),
  participation_reference text not null unique,
  campaign_id uuid not null references public.group_order_campaigns(id) on delete restrict,
  customer_id uuid not null references auth.users(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  unit_price_kes numeric not null check (unit_price_kes >= 0),
  amount_kes numeric not null check (amount_kes >= 0),
  payment_method text not null check (payment_method in ('till','paybill','bank','wallet','cod')),
  payment_reference text,
  payment_status text not null default 'submitted' check (payment_status in ('submitted','verified_paid','rejected','refunded')),
  settlement_status text not null default 'held' check (settlement_status in ('held','eligible','settled','blocked_refund')),
  refund_status text not null default 'not_required' check (refund_status in ('not_required','pending','processing','refunded','rejected')),
  refund_reference text,
  admin_notes text,
  joined_at timestamptz not null default now(),
  payment_verified_at timestamptz,
  payment_verified_by uuid references auth.users(id) on delete set null,
  refunded_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists group_order_participations_campaign_idx on public.group_order_participations(campaign_id,joined_at);
create index if not exists group_order_participations_customer_idx on public.group_order_participations(customer_id,joined_at desc);
alter table public.group_order_participations enable row level security;

create table if not exists public.group_order_shipment_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.group_order_campaigns(id) on delete cascade,
  status text not null,
  event_note text,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('seller','admin','system')),
  created_at timestamptz not null default now()
);
create index if not exists group_order_shipment_events_campaign_idx on public.group_order_shipment_events(campaign_id,created_at);
alter table public.group_order_shipment_events enable row level security;

revoke all on public.product_shipping_profiles,public.platform_shipping_defaults,public.group_order_campaigns,public.group_order_participations,public.group_order_shipment_events from anon,authenticated;

create or replace function private.group_campaign_reference()
returns text language sql volatile set search_path='' as $$
  select 'GRP-'||to_char(clock_timestamp() at time zone 'Africa/Nairobi','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
$$;

create or replace function private.refresh_group_campaign_totals(p_campaign_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_total numeric; v_people int; v_amount numeric; v_paid numeric;
begin
  select coalesce(sum(quantity),0),count(distinct customer_id),coalesce(sum(amount_kes),0),
    coalesce(sum(amount_kes) filter(where payment_status='verified_paid'),0)
  into v_total,v_people,v_amount,v_paid
  from public.group_order_participations
  where campaign_id=p_campaign_id and payment_status not in ('rejected','refunded');
  update public.group_order_campaigns set quantity_committed=v_total,participant_count=v_people,
    amount_committed_kes=v_amount,amount_paid_kes=v_paid,updated_at=now() where id=p_campaign_id;
end $$;

create or replace function private.close_expired_group_campaigns()
returns void language plpgsql security definer set search_path='' as $$
declare c record;
begin
  for c in select * from public.group_order_campaigns
    where status in ('collecting_orders','paused') and closing_at<=now() for update skip locked
  loop
    if c.quantity_committed < c.minimum_quantity then
      update public.group_order_campaigns set status='moq_failed_closed',closed_at=now(),refund_status=case when amount_paid_kes>0 then 'resolution_required' else 'not_required' end,updated_at=now() where id=c.id;
      update public.group_order_participations set settlement_status='blocked_refund',refund_status=case when payment_status='verified_paid' then 'pending' else refund_status end,updated_at=now() where campaign_id=c.id and payment_status not in ('rejected','refunded');
      insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
      select distinct customer_id,'group_order','Group order MOQ was not reached','The campaign closed below its MOQ. LEOGO Admin will resolve any verified payment safely.','group_order_campaign',c.id,'group_order_failed_'||c.id::text,'orders',jsonb_build_object('campaign_reference',c.campaign_reference)
      from public.group_order_participations where campaign_id=c.id on conflict do nothing;
      insert into public.partner_notifications(user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata)
      values(c.seller_id,'seller','group_order_moq_failed','Group order MOQ was not reached','The campaign closed below MOQ and has been sent to Admin for resolution.','group_order_campaign',c.id,'group_orders',jsonb_build_object('campaign_reference',c.campaign_reference));
    elsif c.quantity_committed>=c.minimum_quantity then
      update public.group_order_campaigns set status='moq_reached',moq_reached_at=coalesce(moq_reached_at,now()),closed_at=now(),updated_at=now() where id=c.id;
    end if;
  end loop;
end $$;

create or replace function public.admin_get_shipping_defaults()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.is_leogo_admin('settings.manage') and not private.is_leogo_admin('fees.manage') then raise exception 'Admin settings access required'; end if;
  return (select to_jsonb(d) from public.platform_shipping_defaults d where id=1);
end $$;

create or replace function public.admin_save_shipping_defaults(p_settings jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_before jsonb; v_after jsonb;
begin
  if not private.is_leogo_admin('settings.manage') then raise exception 'Admin settings permission required'; end if;
  select to_jsonb(d) into v_before from public.platform_shipping_defaults d where id=1;
  update public.platform_shipping_defaults set
    local_min=(p_settings->>'local_min')::numeric,local_max=(p_settings->>'local_max')::numeric,local_unit=p_settings->>'local_unit',
    same_county_min=(p_settings->>'same_county_min')::numeric,same_county_max=(p_settings->>'same_county_max')::numeric,same_county_unit=p_settings->>'same_county_unit',
    inter_county_min=(p_settings->>'inter_county_min')::numeric,inter_county_max=(p_settings->>'inter_county_max')::numeric,inter_county_unit=p_settings->>'inter_county_unit',
    international_min=(p_settings->>'international_min')::numeric,international_max=(p_settings->>'international_max')::numeric,international_unit=p_settings->>'international_unit',
    updated_by=(select auth.uid()),updated_at=now() where id=1;
  select to_jsonb(d) into v_after from public.platform_shipping_defaults d where id=1;
  perform private.write_admin_audit('shipping.defaults.updated','platform_shipping_defaults','1',v_before,v_after,'{}'::jsonb);
  return v_after;
end $$;

create or replace function public.customer_shipping_defaults()
returns jsonb language sql security definer set search_path='' as $$
  select to_jsonb(d)-'updated_by' from public.platform_shipping_defaults d where id=1;
$$;

create or replace function public.seller_save_product_shipping(p_product_id uuid,p_shipping jsonb,p_campaign jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid()); v_product public.seller_products%rowtype; v_campaign_id uuid; v_type text;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select * into v_product from public.seller_products where id=p_product_id and seller_id=v_uid for update;
  if not found then raise exception 'Seller product not found'; end if;
  v_type:=coalesce(nullif(p_shipping->>'fulfilment_type',''),'normal');
  if v_type not in ('normal','preorder','group_order') then raise exception 'Invalid order type'; end if;
  update public.seller_products set fulfilment_type=v_type,updated_at=now() where id=p_product_id;
  insert into public.product_shipping_profiles(product_id,seller_id,origin_type,origin_country,origin_county_region,origin_town_city,dispatch_details,
    same_town_min,same_town_max,same_town_unit,same_county_min,same_county_max,same_county_unit,inter_county_min,inter_county_max,inter_county_unit,
    international_min,international_max,international_unit,expected_dispatch_date,expected_delivery_from,expected_delivery_to,updated_at)
  values(p_product_id,v_uid,coalesce(nullif(p_shipping->>'origin_type',''),'domestic'),nullif(btrim(coalesce(p_shipping->>'origin_country','')),''),
    nullif(btrim(coalesce(p_shipping->>'origin_county_region','')),''),nullif(btrim(coalesce(p_shipping->>'origin_town_city','')),''),nullif(btrim(coalesce(p_shipping->>'dispatch_details','')),''),
    nullif(p_shipping->>'same_town_min','')::numeric,nullif(p_shipping->>'same_town_max','')::numeric,nullif(p_shipping->>'same_town_unit',''),
    nullif(p_shipping->>'same_county_min','')::numeric,nullif(p_shipping->>'same_county_max','')::numeric,nullif(p_shipping->>'same_county_unit',''),
    nullif(p_shipping->>'inter_county_min','')::numeric,nullif(p_shipping->>'inter_county_max','')::numeric,nullif(p_shipping->>'inter_county_unit',''),
    nullif(p_shipping->>'international_min','')::numeric,nullif(p_shipping->>'international_max','')::numeric,nullif(p_shipping->>'international_unit',''),
    nullif(p_shipping->>'expected_dispatch_date','')::date,nullif(p_shipping->>'expected_delivery_from','')::date,nullif(p_shipping->>'expected_delivery_to','')::date,now())
  on conflict(product_id) do update set origin_type=excluded.origin_type,origin_country=excluded.origin_country,origin_county_region=excluded.origin_county_region,
    origin_town_city=excluded.origin_town_city,dispatch_details=excluded.dispatch_details,same_town_min=excluded.same_town_min,same_town_max=excluded.same_town_max,
    same_town_unit=excluded.same_town_unit,same_county_min=excluded.same_county_min,same_county_max=excluded.same_county_max,same_county_unit=excluded.same_county_unit,
    inter_county_min=excluded.inter_county_min,inter_county_max=excluded.inter_county_max,inter_county_unit=excluded.inter_county_unit,
    international_min=excluded.international_min,international_max=excluded.international_max,international_unit=excluded.international_unit,
    expected_dispatch_date=excluded.expected_dispatch_date,expected_delivery_from=excluded.expected_delivery_from,expected_delivery_to=excluded.expected_delivery_to,updated_at=now();
  if v_type='group_order' then
    if p_campaign is null then raise exception 'Group order settings are required'; end if;
    if coalesce((p_campaign->>'minimum_quantity')::numeric,0)<=0 then raise exception 'MOQ must be greater than zero'; end if;
    select id into v_campaign_id from public.group_order_campaigns where product_id=p_product_id and status in ('collecting_orders','paused','moq_reached') order by created_at desc limit 1 for update;
    if v_campaign_id is null then
      insert into public.group_order_campaigns(campaign_reference,product_id,seller_id,minimum_quantity,maximum_quantity,customer_unit_price_kes,opening_at,closing_at,expected_dispatch_date,expected_delivery_from,expected_delivery_to,close_policy)
      values(private.group_campaign_reference(),p_product_id,v_uid,(p_campaign->>'minimum_quantity')::numeric,nullif(p_campaign->>'maximum_quantity','')::numeric,
        (p_campaign->>'customer_unit_price_kes')::numeric,(p_campaign->>'opening_at')::timestamptz,(p_campaign->>'closing_at')::timestamptz,
        (p_campaign->>'expected_dispatch_date')::date,(p_campaign->>'expected_delivery_from')::date,nullif(p_campaign->>'expected_delivery_to','')::date,
        coalesce(nullif(p_campaign->>'close_policy',''),'deadline')) returning id into v_campaign_id;
    else
      if exists(select 1 from public.group_order_participations where campaign_id=v_campaign_id) then
        update public.group_order_campaigns set closing_at=(p_campaign->>'closing_at')::timestamptz,expected_dispatch_date=(p_campaign->>'expected_dispatch_date')::date,
          expected_delivery_from=(p_campaign->>'expected_delivery_from')::date,expected_delivery_to=nullif(p_campaign->>'expected_delivery_to','')::date,
          maximum_quantity=nullif(p_campaign->>'maximum_quantity','')::numeric,close_policy=coalesce(nullif(p_campaign->>'close_policy',''),'deadline'),updated_at=now() where id=v_campaign_id;
      else
        update public.group_order_campaigns set minimum_quantity=(p_campaign->>'minimum_quantity')::numeric,maximum_quantity=nullif(p_campaign->>'maximum_quantity','')::numeric,
          customer_unit_price_kes=(p_campaign->>'customer_unit_price_kes')::numeric,opening_at=(p_campaign->>'opening_at')::timestamptz,closing_at=(p_campaign->>'closing_at')::timestamptz,
          expected_dispatch_date=(p_campaign->>'expected_dispatch_date')::date,expected_delivery_from=(p_campaign->>'expected_delivery_from')::date,
          expected_delivery_to=nullif(p_campaign->>'expected_delivery_to','')::date,close_policy=coalesce(nullif(p_campaign->>'close_policy',''),'deadline'),updated_at=now() where id=v_campaign_id;
      end if;
    end if;
  end if;
  return jsonb_build_object('ok',true,'product_id',p_product_id,'campaign_id',v_campaign_id);
end $$;

create or replace function public.customer_join_group_order(p_campaign_id uuid,p_quantity numeric,p_payment_method text,p_payment_reference text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid()); c public.group_order_campaigns%rowtype; v_id uuid; v_ref text; v_new_qty numeric; v_moq_new boolean:=false;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'Quantity must be greater than zero'; end if;
  if p_payment_method not in ('till','paybill','bank','wallet','cod') then raise exception 'Choose a supported LEOGO payment method'; end if;
  if p_payment_method in ('till','paybill','bank') and char_length(btrim(coalesce(p_payment_reference,'')))<3 then raise exception 'Enter the payment reference'; end if;
  perform private.close_expired_group_campaigns();
  select * into c from public.group_order_campaigns where id=p_campaign_id for update;
  if not found then raise exception 'Group order not found'; end if;
  if c.status not in ('collecting_orders','moq_reached') then raise exception 'This campaign is not accepting new orders'; end if;
  if now()<c.opening_at then raise exception 'This campaign has not opened yet'; end if;
  if now()>=c.closing_at then raise exception 'This campaign has closed'; end if;
  if c.close_policy='moq' and c.quantity_committed>=c.minimum_quantity then raise exception 'This campaign closed when MOQ was reached'; end if;
  v_new_qty:=c.quantity_committed+p_quantity;
  if c.maximum_quantity is not null and v_new_qty>c.maximum_quantity then raise exception 'Only % units remain available',greatest(c.maximum_quantity-c.quantity_committed,0); end if;
  v_ref:='JOIN-'||to_char(clock_timestamp() at time zone 'Africa/Nairobi','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.group_order_participations(participation_reference,campaign_id,customer_id,quantity,unit_price_kes,amount_kes,payment_method,payment_reference,payment_status)
  values(v_ref,c.id,v_uid,p_quantity,c.customer_unit_price_kes,round(p_quantity*c.customer_unit_price_kes,2),p_payment_method,nullif(btrim(coalesce(p_payment_reference,'')),''),case when p_payment_method='cod' then 'submitted' else 'submitted' end)
  returning id into v_id;
  perform private.refresh_group_campaign_totals(c.id);
  select * into c from public.group_order_campaigns where id=c.id;
  if c.quantity_committed>=c.minimum_quantity and c.status='collecting_orders' then
    v_moq_new:=true;
    update public.group_order_campaigns set status='moq_reached',moq_reached_at=now(),closed_at=case when close_policy='moq' then now() else closed_at end,updated_at=now() where id=c.id;
    insert into public.partner_notifications(user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata)
    values(c.seller_id,'seller','group_order_moq_reached','Group order MOQ reached','Your campaign reached its MOQ. You may begin preparation after Admin confirms the order.','group_order_campaign',c.id,'group_orders',jsonb_build_object('campaign_reference',c.campaign_reference));
    insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
    select distinct customer_id,'group_order','Group order MOQ reached','The MOQ target has been reached. Follow shipment progress in My Activity.','group_order_campaign',c.id,'group_order_moq_'||c.id::text,'orders',jsonb_build_object('campaign_reference',c.campaign_reference)
    from public.group_order_participations where campaign_id=c.id on conflict do nothing;
  end if;
  insert into public.partner_notifications(user_id,partner_type,event_type,title,message,source_type,source_id,action_view,metadata)
  values(c.seller_id,'seller','group_order_joined','Customer joined group order','A customer committed '||p_quantity||' unit(s) to '||c.campaign_reference||'.','group_order_campaign',c.id,'group_orders',jsonb_build_object('participation_id',v_id,'quantity',p_quantity));
  return jsonb_build_object('ok',true,'participation_id',v_id,'participation_reference',v_ref,'campaign_id',c.id,'quantity_committed',c.quantity_committed,'minimum_quantity',c.minimum_quantity,'moq_reached_now',v_moq_new);
end $$;

create or replace function public.customer_list_group_orders()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid()); v_result jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  perform private.close_expired_group_campaigns();
  select coalesce(jsonb_agg(jsonb_build_object('participation_id',p.id,'participation_reference',p.participation_reference,'quantity',p.quantity,'amount_kes',p.amount_kes,
    'payment_method',p.payment_method,'payment_status',p.payment_status,'settlement_status',p.settlement_status,'refund_status',p.refund_status,'refund_reference',p.refund_reference,'joined_at',p.joined_at,
    'campaign_id',c.id,'campaign_reference',c.campaign_reference,'status',c.status,'quantity_committed',c.quantity_committed,'minimum_quantity',c.minimum_quantity,'maximum_quantity',c.maximum_quantity,
    'participant_count',c.participant_count,'closing_at',c.closing_at,'expected_dispatch_date',c.expected_dispatch_date,'expected_delivery_from',c.expected_delivery_from,'expected_delivery_to',c.expected_delivery_to,
    'product_id',sp.id,'product_name',sp.product_name,'main_image_path',sp.main_image_path,'origin',to_jsonb(ship),
    'shipment_events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.group_order_shipment_events e where e.campaign_id=c.id),'[]'::jsonb)) order by p.joined_at desc),'[]'::jsonb)
  into v_result from public.group_order_participations p join public.group_order_campaigns c on c.id=p.campaign_id join public.seller_products sp on sp.id=c.product_id left join public.product_shipping_profiles ship on ship.product_id=sp.id where p.customer_id=v_uid;
  return v_result;
end $$;

create or replace function public.seller_list_group_orders()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid()); v_result jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  perform private.close_expired_group_campaigns();
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'campaign_reference',c.campaign_reference,'product_id',c.product_id,'product_name',p.product_name,'status',c.status,
    'minimum_quantity',c.minimum_quantity,'maximum_quantity',c.maximum_quantity,'quantity_committed',c.quantity_committed,'quantity_remaining',greatest(c.minimum_quantity-c.quantity_committed,0),
    'progress_percent',least(round(c.quantity_committed/nullif(c.minimum_quantity,0)*100,1),100),'participant_count',c.participant_count,'amount_committed_kes',c.amount_committed_kes,'amount_paid_kes',c.amount_paid_kes,
    'opening_at',c.opening_at,'closing_at',c.closing_at,'expected_dispatch_date',c.expected_dispatch_date,'expected_delivery_from',c.expected_delivery_from,'expected_delivery_to',c.expected_delivery_to,
    'close_policy',c.close_policy,'refund_status',c.refund_status,'origin',to_jsonb(s),'shipment_events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.group_order_shipment_events e where e.campaign_id=c.id),'[]'::jsonb)) order by c.updated_at desc),'[]'::jsonb)
  into v_result from public.group_order_campaigns c join public.seller_products p on p.id=c.product_id left join public.product_shipping_profiles s on s.product_id=p.id where c.seller_id=v_uid;
  return v_result;
end $$;

create or replace function public.seller_update_group_order_status(p_campaign_id uuid,p_status text,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid()); c public.group_order_campaigns%rowtype;
begin
  select * into c from public.group_order_campaigns where id=p_campaign_id and seller_id=v_uid for update;
  if not found then raise exception 'Seller campaign not found'; end if;
  if p_status not in ('seller_preparing','dispatched_origin','in_transit','arrived_destination') then raise exception 'Seller cannot set that campaign status'; end if;
  if c.status in ('moq_failed_closed','cancelled','refund_pending','refunded') then raise exception 'Closed campaigns cannot be updated by Seller'; end if;
  if p_status='seller_preparing' and c.status not in ('moq_reached','order_confirmed') then raise exception 'MOQ must be reached and confirmed first'; end if;
  update public.group_order_campaigns set status=p_status,updated_at=now() where id=c.id;
  insert into public.group_order_shipment_events(campaign_id,status,event_note,actor_user_id,actor_role) values(c.id,p_status,nullif(btrim(coalesce(p_note,'')),''),v_uid,'seller');
  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  select distinct customer_id,'group_order','Group order update',replace(initcap(p_status),'_',' ')||coalesce(': '||nullif(btrim(coalesce(p_note,'')),''),''),'group_order_campaign',c.id,'group_order_'||p_status||'_'||extract(epoch from now())::bigint,'orders',jsonb_build_object('campaign_reference',c.campaign_reference)
  from public.group_order_participations where campaign_id=c.id and payment_status not in ('rejected','refunded');
  return jsonb_build_object('ok',true,'status',p_status);
end $$;

create or replace function public.admin_list_group_orders()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if not private.is_leogo_admin('orders.read') then raise exception 'Admin order access required'; end if;
  perform private.close_expired_group_campaigns();
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'campaign_reference',c.campaign_reference,'seller_id',c.seller_id,'seller_name',sa.business_name,'product_id',c.product_id,'product_name',p.product_name,
    'status',c.status,'minimum_quantity',c.minimum_quantity,'maximum_quantity',c.maximum_quantity,'quantity_committed',c.quantity_committed,'remaining_quantity',greatest(c.minimum_quantity-c.quantity_committed,0),
    'progress_percent',least(round(c.quantity_committed/nullif(c.minimum_quantity,0)*100,1),100),'participant_count',c.participant_count,'amount_committed_kes',c.amount_committed_kes,'amount_paid_kes',c.amount_paid_kes,
    'opening_at',c.opening_at,'closing_at',c.closing_at,'expected_dispatch_date',c.expected_dispatch_date,'expected_delivery_from',c.expected_delivery_from,'expected_delivery_to',c.expected_delivery_to,'refund_status',c.refund_status,
    'origin',to_jsonb(s),'participants',coalesce((select jsonb_agg(jsonb_build_object('id',gp.id,'customer_id',gp.customer_id,'customer_name',cp.full_name,'quantity',gp.quantity,'amount_kes',gp.amount_kes,'payment_method',gp.payment_method,'payment_reference',gp.payment_reference,'payment_status',gp.payment_status,'refund_status',gp.refund_status,'joined_at',gp.joined_at) order by gp.joined_at) from public.group_order_participations gp left join public.customer_profiles cp on cp.user_id=gp.customer_id where gp.campaign_id=c.id),'[]'::jsonb),
    'shipment_events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.group_order_shipment_events e where e.campaign_id=c.id),'[]'::jsonb)) order by c.updated_at desc),'[]'::jsonb)
  into v_result from public.group_order_campaigns c join public.seller_products p on p.id=c.product_id join public.seller_accounts sa on sa.user_id=c.seller_id left join public.product_shipping_profiles s on s.product_id=p.id;
  return v_result;
end $$;

create or replace function public.admin_manage_group_order(p_campaign_id uuid,p_action text,p_value text default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.group_order_campaigns%rowtype; v_before jsonb; v_after jsonb; v_status text;
begin
  if not private.is_leogo_admin('orders.manage') then raise exception 'Admin order management permission required'; end if;
  select * into c from public.group_order_campaigns where id=p_campaign_id for update;
  if not found then raise exception 'Campaign not found'; end if;
  v_before:=to_jsonb(c);
  if p_action='pause' then v_status:='paused';
  elsif p_action='resume' then v_status:=case when c.quantity_committed>=c.minimum_quantity then 'moq_reached' else 'collecting_orders' end;
  elsif p_action='extend' then
    if p_value is null or p_value::timestamptz<=now() then raise exception 'Choose a future closing date'; end if;
    update public.group_order_campaigns set closing_at=p_value::timestamptz,closed_at=null,updated_at=now(),admin_notes=nullif(btrim(coalesce(p_notes,'')),'') where id=c.id;
  elsif p_action='close' then v_status:=case when c.quantity_committed>=c.minimum_quantity then 'moq_reached' else 'moq_failed_closed' end;
  elsif p_action='confirm' then if c.quantity_committed<c.minimum_quantity then raise exception 'MOQ has not been reached'; end if; v_status:='order_confirmed';
  elsif p_action='cancel' then v_status:='cancelled';
  elsif p_action='start_refund' then v_status:='refund_pending';
  elsif p_action in ('arrived_destination','at_sorting_center','out_for_delivery','ready_pickup','delivered_collected') then v_status:=p_action;
  else raise exception 'Unsupported Admin action'; end if;
  if v_status is not null then
    update public.group_order_campaigns set status=v_status,closed_at=case when v_status in ('moq_failed_closed','cancelled') then now() else closed_at end,
      confirmed_at=case when v_status='order_confirmed' then now() else confirmed_at end,
      refund_status=case when v_status in ('moq_failed_closed','cancelled','refund_pending') and amount_paid_kes>0 then case when v_status='refund_pending' then 'in_progress' else 'resolution_required' end else refund_status end,
      admin_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now() where id=c.id;
    if v_status in ('moq_failed_closed','cancelled','refund_pending') then update public.group_order_participations set settlement_status='blocked_refund',refund_status=case when payment_status='verified_paid' then 'pending' else refund_status end,updated_at=now() where campaign_id=c.id and payment_status not in ('rejected','refunded'); end if;
    if v_status='delivered_collected' then update public.group_order_participations set settlement_status='eligible',updated_at=now() where campaign_id=c.id and payment_status='verified_paid' and settlement_status='held'; end if;
    insert into public.group_order_shipment_events(campaign_id,status,event_note,actor_user_id,actor_role) values(c.id,v_status,nullif(btrim(coalesce(p_notes,'')),''),(select auth.uid()),'admin');
  end if;
  select to_jsonb(x) into v_after from public.group_order_campaigns x where id=c.id;
  perform private.write_admin_audit('group_order.'||p_action,'group_order_campaign',c.id::text,v_before,v_after,jsonb_build_object('value',p_value,'notes',p_notes));
  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  select distinct customer_id,'group_order','Group order status updated','Campaign '||c.campaign_reference||' is now '||replace(coalesce(v_status,'updated'),'_',' ')||'.','group_order_campaign',c.id,'group_order_admin_'||p_action||'_'||extract(epoch from now())::bigint,'orders',jsonb_build_object('campaign_reference',c.campaign_reference)
  from public.group_order_participations where campaign_id=c.id;
  return v_after;
end $$;

create or replace function public.admin_review_group_order_payment(p_participation_id uuid,p_decision text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.group_order_participations%rowtype; v_before jsonb; v_after jsonb;
begin
  if not private.is_leogo_admin('orders.payment_verify') then raise exception 'Payment verification permission required'; end if;
  if p_decision not in ('verify','reject') then raise exception 'Unsupported payment decision'; end if;
  select * into p from public.group_order_participations where id=p_participation_id for update;
  if not found then raise exception 'Participation not found'; end if;
  if p.payment_status<>'submitted' then raise exception 'Payment has already been reviewed'; end if;
  v_before:=to_jsonb(p);
  update public.group_order_participations set payment_status=case when p_decision='verify' then 'verified_paid' else 'rejected' end,
    payment_verified_at=now(),payment_verified_by=(select auth.uid()),admin_notes=nullif(btrim(coalesce(p_notes,'')),''),
    settlement_status=case when p_decision='reject' then 'blocked_refund' else 'held' end,updated_at=now() where id=p.id;
  perform private.refresh_group_campaign_totals(p.campaign_id);
  select to_jsonb(x) into v_after from public.group_order_participations x where id=p.id;
  perform private.write_admin_audit('group_order.payment.'||p_decision,'group_order_participation',p.id::text,v_before,v_after,jsonb_build_object('campaign_id',p.campaign_id,'notes',p_notes));
  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(p.customer_id,'group_order',case when p_decision='verify' then 'Group order payment verified' else 'Group order payment rejected' end,
    case when p_decision='verify' then 'Your group order payment is verified and remains safely held until campaign conditions are met.' else 'Your group order payment proof was rejected. Open My Activity for details.' end,
    'group_order_participation',p.id,'group_order_payment_'||p_decision,'orders',jsonb_build_object('campaign_id',p.campaign_id));
  return v_after;
end $$;

create or replace function public.admin_complete_group_order_refund(p_participation_id uuid,p_reference text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.group_order_participations%rowtype; v_before jsonb; v_after jsonb;
begin
  if not private.is_leogo_admin('orders.manage') and not private.is_leogo_admin('settlements.manage') then raise exception 'Refund management permission required'; end if;
  if char_length(btrim(coalesce(p_reference,'')))<3 then raise exception 'Refund reference is required'; end if;
  select * into p from public.group_order_participations where id=p_participation_id for update;
  if not found then raise exception 'Participation not found'; end if;
  if p.payment_status<>'verified_paid' or p.refund_status not in ('pending','processing') then raise exception 'Participation is not eligible for refund completion'; end if;
  v_before:=to_jsonb(p);
  update public.group_order_participations set payment_status='refunded',settlement_status='blocked_refund',refund_status='refunded',refund_reference=btrim(p_reference),refunded_at=now(),admin_notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now() where id=p.id;
  perform private.refresh_group_campaign_totals(p.campaign_id);
  if not exists(select 1 from public.group_order_participations where campaign_id=p.campaign_id and payment_status='verified_paid' and refund_status in ('pending','processing')) then update public.group_order_campaigns set refund_status='completed',status='refunded',updated_at=now() where id=p.campaign_id and status='refund_pending'; end if;
  select to_jsonb(x) into v_after from public.group_order_participations x where id=p.id;
  perform private.write_admin_audit('group_order.refund.completed','group_order_participation',p.id::text,v_before,v_after,jsonb_build_object('reference',btrim(p_reference),'notes',p_notes));
  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
  values(p.customer_id,'group_order','Group order refund completed','LEOGO completed your refund. Reference: '||btrim(p_reference)||'.','group_order_participation',p.id,'group_order_refunded','orders',jsonb_build_object('refund_reference',btrim(p_reference)));
  return v_after;
end $$;

-- Customer catalogue stays public but returns only public shipping/campaign fields.
create or replace function public.customer_marketplace_catalogue()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform private.close_expired_group_campaigns();
  select coalesce(jsonb_agg(row_data order by (row_data->>'updated_at')::timestamptz desc),'[]'::jsonb) into v_result from (
    select to_jsonb(p)||jsonb_build_object('seller_name',s.business_name,'category_code',c.code,'category_name',coalesce(nullif(p.custom_category_name,''),c.name),'category_is_aggregator',c.is_aggregator,'category_restricted',c.restricted_category,
      'subcategory_name',coalesce(nullif(p.custom_subcategory_name,''),sc.name),'shipping_profile',case when ship.product_id is null then null else to_jsonb(ship)-'seller_id'-'created_at'-'updated_at' end,
      'shipping_defaults',(select to_jsonb(d)-'updated_by'-'updated_at' from public.platform_shipping_defaults d where d.id=1),
      'group_campaign',case when go.id is null then null else jsonb_build_object('id',go.id,'campaign_reference',go.campaign_reference,'minimum_quantity',go.minimum_quantity,'maximum_quantity',go.maximum_quantity,'customer_unit_price_kes',go.customer_unit_price_kes,'opening_at',go.opening_at,'closing_at',go.closing_at,'expected_dispatch_date',go.expected_dispatch_date,'expected_delivery_from',go.expected_delivery_from,'expected_delivery_to',go.expected_delivery_to,'close_policy',go.close_policy,'status',go.status,'quantity_committed',go.quantity_committed,'participant_count',go.participant_count) end,
      'variants',coalesce((select jsonb_agg(to_jsonb(v) order by v.display_order,v.created_at) from public.seller_product_variants v where v.product_id=p.id and v.is_active),'[]'::jsonb),
      'rating_average',coalesce((select round(avg(r.rating)::numeric,1) from public.marketplace_product_reviews r where r.product_id=p.id and r.moderation_status='approved'),0),
      'review_count',(select count(*) from public.marketplace_product_reviews r where r.product_id=p.id and r.moderation_status='approved'),
      'approved_reviews',coalesce((select jsonb_agg(review_row order by (review_row->>'created_at')::timestamptz desc) from (select jsonb_build_object('review_id',r.id,'rating',r.rating,'comment',r.comment,'variant_name',v.variant_name,'created_at',r.created_at,'verified_purchase',true) review_row from public.marketplace_product_reviews r left join public.seller_product_variants v on v.id=r.variant_id where r.product_id=p.id and r.moderation_status='approved' order by r.created_at desc limit 8) approved),'[]'::jsonb)
    ) row_data from public.seller_products p join public.seller_accounts s on s.user_id=p.seller_id join public.product_categories c on c.id=p.category_id left join public.product_subcategories sc on sc.id=p.subcategory_id
    left join public.product_shipping_profiles ship on ship.product_id=p.id left join lateral(select g.* from public.group_order_campaigns g where g.product_id=p.id order by g.created_at desc limit 1) go on true
    where s.application_status='approved' and p.product_approval_status='approved' and p.listing_status='active' and p.availability_status in ('available','out_of_stock') and c.is_active and c.code<>'alcoholic_leogo_bar'
  ) q;
  return v_result;
end $$;

create or replace function public.seller_list_own_products()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=(select auth.uid()); v_result jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.seller_accounts s where s.user_id=v_uid and s.application_status='approved') then raise exception 'Approved Seller account required'; end if;
  perform private.close_expired_group_campaigns();
  select coalesce(jsonb_agg(product_row order by (product_row->>'updated_at')::timestamptz desc),'[]'::jsonb) into v_result from (
    select to_jsonb(p)||jsonb_build_object(
      'seller_product_variants',coalesce((select jsonb_agg(to_jsonb(v) order by v.display_order,v.created_at) from public.seller_product_variants v where v.product_id=p.id),'[]'::jsonb),
      'shipping_profile',(select to_jsonb(s) from public.product_shipping_profiles s where s.product_id=p.id),
      'group_campaign',(select to_jsonb(g) from public.group_order_campaigns g where g.product_id=p.id order by g.created_at desc limit 1)
    ) product_row from public.seller_products p where p.seller_id=v_uid
  ) q;
  return v_result;
end $$;

revoke execute on function private.group_campaign_reference(),private.refresh_group_campaign_totals(uuid),private.close_expired_group_campaigns() from public,anon,authenticated;
revoke execute on function public.admin_get_shipping_defaults(),public.admin_save_shipping_defaults(jsonb),public.seller_save_product_shipping(uuid,jsonb,jsonb),public.customer_join_group_order(uuid,numeric,text,text),public.customer_list_group_orders(),public.seller_list_group_orders(),public.seller_update_group_order_status(uuid,text,text),public.admin_list_group_orders(),public.admin_manage_group_order(uuid,text,text,text),public.admin_review_group_order_payment(uuid,text,text),public.admin_complete_group_order_refund(uuid,text,text) from public,anon;
grant execute on function public.admin_get_shipping_defaults(),public.admin_save_shipping_defaults(jsonb),public.seller_save_product_shipping(uuid,jsonb,jsonb),public.customer_join_group_order(uuid,numeric,text,text),public.customer_list_group_orders(),public.seller_list_group_orders(),public.seller_update_group_order_status(uuid,text,text),public.admin_list_group_orders(),public.admin_manage_group_order(uuid,text,text,text),public.admin_review_group_order_payment(uuid,text,text),public.admin_complete_group_order_refund(uuid,text,text) to authenticated;
revoke execute on function public.customer_shipping_defaults(),public.customer_marketplace_catalogue() from public;
grant execute on function public.customer_shipping_defaults(),public.customer_marketplace_catalogue() to anon,authenticated;
