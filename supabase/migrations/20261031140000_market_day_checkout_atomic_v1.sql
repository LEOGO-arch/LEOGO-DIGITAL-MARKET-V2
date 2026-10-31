-- Market Day checkout extension. The legacy marketplace order function remains
-- authoritative; anchored replacements abort if its contract has changed.
create table if not exists public.leogo_delivery_subsidy_redemptions (
  order_id uuid primary key references public.marketplace_orders(id) on delete restrict,
  campaign_id uuid not null references public.leogo_free_delivery_campaigns(id) on delete restrict,
  funded_fee_kes numeric(12,2) not null check (funded_fee_kes > 0),
  applied_at timestamptz not null default now()
);
alter table public.leogo_delivery_subsidy_redemptions enable row level security;
revoke all on public.leogo_delivery_subsidy_redemptions from public,anon,authenticated;

-- A seller's promo affects only a standard non-variant product, never a Flash
-- Sale line or a Group Order. The row is locked before its allowance is spent.
create or replace function private.market_day_checkout_unit_price(
  p_product uuid,p_normal_price numeric,p_quantity numeric,p_flash_active boolean,p_reserve boolean,p_county text)
returns numeric language plpgsql security definer set search_path='' as $$
declare v_offer public.market_day_offers%rowtype; v_price numeric; v_now timestamp:=(now() at time zone 'Africa/Nairobi');
begin
  if coalesce(p_flash_active,false) or p_normal_price is null or p_quantity<=0 then
    return p_normal_price;
  end if;
  select o.* into v_offer
  from public.market_day_offers o
  join public.market_day_events e on e.id=o.event_id
  where o.product_id=p_product and o.approval_status='approved'
    and e.status='published' and v_now::date between e.starts_on and e.ends_on
    and extract(dow from v_now)::integer=any(e.weekdays)
    and v_now::time between e.start_time and e.end_time
    and (e.county is null or lower(btrim(e.county))=lower(btrim(coalesce(p_county,''))))
    and o.quantity_limit>=p_quantity
  order by e.starts_on desc,o.created_at desc limit 1 for update of o;
  if not found then return p_normal_price; end if;
  if v_offer.kind='reduced_price' then
    v_price:=v_offer.offer_price_kes;
  else
    select (tier->>'unit_price_kes')::numeric into v_price
    from jsonb_array_elements(v_offer.bulk_tiers) tier
    where (tier->>'min_qty')::numeric<=p_quantity
    order by (tier->>'min_qty')::numeric desc limit 1;
  end if;
  if v_price is null or v_price<=0 or v_price>=p_normal_price then return p_normal_price; end if;
  if p_reserve then
    update public.market_day_offers set quantity_limit=quantity_limit-p_quantity
    where id=v_offer.id and quantity_limit>=p_quantity;
    if not found then raise exception 'Market Day promotional stock was just exhausted'; end if;
  end if;
  return v_price;
end $$;
revoke all on function private.market_day_checkout_unit_price(uuid,numeric,numeric,boolean,boolean,text) from public,anon,authenticated;

-- Each qualifying order receives one full LEOGO-funded delivery fee. Eligibility
-- is based on the SERVER-calculated cart subtotal and delivery destination.
create or replace function private.reserve_leogo_delivery_subsidy(
  p_subtotal numeric,p_county text,p_sub_county text,p_estate text,p_zone text,p_delivery_fee numeric)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if p_delivery_fee<=0 or p_zone not in ('cbd','estate','outside') then return null; end if;
  select id into v_id from public.leogo_free_delivery_campaigns c
  where c.status='active' and now() between c.starts_at and c.ends_at
    and p_subtotal>=c.min_items_subtotal_kes and c.budget_kes>=p_delivery_fee
    and c.max_funded_delivery_kes>=p_delivery_fee
    and lower(btrim(coalesce(p_county,'')))=lower(btrim(c.county))
    and (c.sub_county is null or lower(btrim(coalesce(p_sub_county,'')))=lower(btrim(c.sub_county)))
    and (c.estate is null or lower(btrim(coalesce(p_estate,'')))=lower(btrim(c.estate)))
    and c.delivery_zone=p_zone
  order by c.max_funded_delivery_kes desc,c.starts_at desc limit 1 for update;
  if v_id is null then return null; end if;
  update public.leogo_free_delivery_campaigns set budget_kes=budget_kes-p_delivery_fee
  where id=v_id and budget_kes>=p_delivery_fee;
  if not found then raise exception 'Free-delivery campaign budget is exhausted'; end if;
  return v_id;
end $$;
revoke all on function private.reserve_leogo_delivery_subsidy(numeric,text,text,text,text,numeric) from public,anon,authenticated;

do $patch$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef('public.customer_create_marketplace_order(jsonb,text,text,text,text,text,text,text,text,uuid,text,text)'::regprocedure) into v_def;
  v_old:='  v_seller_approved boolean;';
  v_new:=v_old||chr(10)||'  v_delivery_campaign_id uuid;'||chr(10)||'  v_delivery_funded numeric:=0;';
  if position(v_old in v_def)=0 then raise exception 'Market Day checkout declaration anchor missing'; end if;
  v_def:=replace(v_def,v_old,v_new);

  -- Use one identical resolver in validation and immutable order-line insertion.
  -- Only nonvariant paths are changed; variant and Flash Sale paths stay intact.
  v_old:='    v_subtotal:=v_subtotal+(v_unit_price*v_qty);';
  v_new:='    if not v_product.has_variants then'||chr(10)||
    '      v_unit_price:=private.market_day_checkout_unit_price(v_product.id,v_unit_price,v_qty,v_flash_active,false,p_county);'||chr(10)||
    '    end if;'||chr(10)||v_old;
  if position(v_old in v_def)=0 then raise exception 'Market Day subtotal anchor missing'; end if;
  v_def:=replace(v_def,v_old,v_new);

  v_old:='      insert into public.marketplace_order_items('||chr(10)||
    '        order_id,seller_id,product_id,product_name,unit_price_kes,quantity,line_total_kes';
  v_new:='      v_unit_price:=private.market_day_checkout_unit_price(v_product.id,v_unit_price,v_qty,v_flash_active,true,p_county);'||chr(10)||chr(10)||v_old;
  if position(v_old in v_def)=0 then raise exception 'Market Day immutable item anchor missing'; end if;
  v_def:=replace(v_def,v_old,v_new);

  v_old:='  v_total:=v_subtotal+v_service+v_pickup+v_delivery;';
  v_new:='  v_delivery_campaign_id:=private.reserve_leogo_delivery_subsidy('||chr(10)||
    '    v_subtotal,p_county,p_sub_county,p_estate,p_delivery_zone,v_delivery);'||chr(10)||
    '  if v_delivery_campaign_id is not null then'||chr(10)||
    '    v_delivery_funded:=v_delivery;'||chr(10)||
    '    v_delivery:=0;'||chr(10)||
    '  end if;'||chr(10)||v_old;
  if position(v_old in v_def)=0 then raise exception 'LEOGO delivery-fee anchor missing'; end if;
  v_def:=replace(v_def,v_old,v_new);

  v_old:='  -- Create immutable order lines and reserve stock.';
  v_new:='  if v_delivery_campaign_id is not null then'||chr(10)||
    '    insert into public.leogo_delivery_subsidy_redemptions(order_id,campaign_id,funded_fee_kes)'||chr(10)||
    '    values(v_order_id,v_delivery_campaign_id,v_delivery_funded);'||chr(10)||
    '  end if;'||chr(10)||chr(10)||v_old;
  if position(v_old in v_def)=0 then raise exception 'LEOGO subsidy ledger anchor missing'; end if;
  v_def:=replace(v_def,v_old,v_new);
  execute v_def;
end $patch$;
