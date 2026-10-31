-- Read-only, server-calculated checkout estimate matching the Market Day and
-- LEOGO-funded-delivery rules used by the authoritative order transaction.
create or replace function public.customer_market_day_checkout_quote(
  p_items jsonb,p_delivery_zone text,p_county text default null,
  p_sub_county text default null,p_estate text default null,p_pickup_station_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_item jsonb; v_product public.seller_products%rowtype;
  v_variant public.seller_product_variants%rowtype;
  v_qty numeric; v_price numeric; v_regular numeric; v_subtotal numeric:=0;
  v_regular_subtotal numeric:=0; v_service numeric:=0; v_pickup numeric:=0;
  v_delivery numeric:=0; v_subsidy numeric:=0; v_flash boolean; v_campaign uuid;
begin
  if (select auth.uid()) is null then raise exception 'Sign in required'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then
    raise exception 'Choose a valid cart'; end if;
  if p_delivery_zone not in ('pickup','cbd','estate','outside') then raise exception 'Choose delivery zone'; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty:=nullif(v_item->>'quantity','')::numeric;
    if v_qty is null or v_qty<=0 then raise exception 'Invalid quantity'; end if;
    select * into v_product from public.seller_products p where p.id=(v_item->>'product_id')::uuid
      and p.product_approval_status='approved' and p.listing_status='active'
      and p.availability_status='available';
    if not found or v_product.fulfilment_type='group_order' then raise exception 'Product is unavailable'; end if;
    if not exists(select 1 from public.seller_accounts a where a.user_id=v_product.seller_id
      and a.application_status='approved') then raise exception 'Seller is unavailable'; end if;
    v_flash:=v_product.flash_sale_requested and v_product.flash_sale_status='approved'
      and v_product.flash_sale_price_kes>0 and v_product.flash_sale_starts_at<=now()
      and v_product.flash_sale_ends_at>now() and coalesce(v_product.flash_sale_quantity,0)>0;
    if v_flash and (select coalesce(sum((x->>'quantity')::numeric),0)
      from jsonb_array_elements(p_items) x where (x->>'product_id')::uuid=v_product.id)>v_product.flash_sale_quantity then
      raise exception 'Flash Sale quantity is no longer available'; end if;
    if v_product.has_variants then
      select * into v_variant from public.seller_product_variants x
      where x.id=nullif(v_item->>'variant_id','')::uuid and x.product_id=v_product.id and x.is_active=true;
      if not found then raise exception 'Choose a valid product variant'; end if;
      if v_variant.quantity_available<v_qty then raise exception 'Not enough variant stock'; end if;
      v_regular:=v_variant.price_kes;
      v_price:=case when v_flash then least(v_regular,v_product.flash_sale_price_kes) else v_regular end;
    else
      if v_product.quantity_available<v_qty then raise exception 'Not enough product stock'; end if;
      v_regular:=v_product.price_kes;
      v_price:=case when v_flash then least(v_regular,v_product.flash_sale_price_kes) else v_regular end;
      v_price:=private.market_day_checkout_unit_price(v_product.id,v_price,v_qty,v_flash,false,p_county);
    end if;
    v_subtotal:=v_subtotal+(v_price*v_qty);
    v_regular_subtotal:=v_regular_subtotal+(v_regular*v_qty);
  end loop;

  v_service:=round(v_subtotal * case when v_subtotal>=coalesce((select service_fee_threshold_kes from public.order_settings where id=1),3000)
    then coalesce((select service_fee_at_or_above_percent from public.order_settings where id=1),1.5)/100
    else coalesce((select service_fee_below_percent from public.order_settings where id=1),2)/100 end,2);
  if p_delivery_zone='pickup' then
    select round(v_subtotal*(coalesce(service_fee_percent,0)/100),2),coalesce(shipping_fee_kes,0)
    into v_pickup,v_delivery from public.pickup_stations where id=p_pickup_station_id and is_active=true;
    if not found then raise exception 'Pickup station unavailable'; end if;
  else
    v_delivery:=private.delivery_fee_for_zone(p_delivery_zone);
    select c.id into v_campaign from public.leogo_free_delivery_campaigns c
    where c.status='active' and now() between c.starts_at and c.ends_at
      and v_subtotal>=c.min_items_subtotal_kes and c.budget_kes>=v_delivery
      and c.max_funded_delivery_kes>=v_delivery
      and lower(btrim(c.county))=lower(btrim(coalesce(p_county,'')))
      and (c.sub_county is null or lower(btrim(c.sub_county))=lower(btrim(coalesce(p_sub_county,''))))
      and (c.estate is null or lower(btrim(c.estate))=lower(btrim(coalesce(p_estate,''))))
      and c.delivery_zone=p_delivery_zone order by c.max_funded_delivery_kes desc,c.starts_at desc limit 1;
    if found then v_subsidy:=v_delivery;v_delivery:=0;end if;
  end if;
  return jsonb_build_object('items_subtotal_kes',round(v_subtotal,2),
    'discount_kes',round(greatest(0,v_regular_subtotal-v_subtotal),2),
    'service_fee_kes',v_service,'pickup_fee_kes',v_pickup,'delivery_fee_kes',v_delivery,
    'leogo_delivery_subsidy_kes',v_subsidy,
    'grand_total_kes',round(v_subtotal+v_service+v_pickup+v_delivery,2));
end $$;
revoke all on function public.customer_market_day_checkout_quote(jsonb,text,text,text,text,uuid) from public,anon;
grant execute on function public.customer_market_day_checkout_quote(jsonb,text,text,text,text,uuid) to authenticated;
