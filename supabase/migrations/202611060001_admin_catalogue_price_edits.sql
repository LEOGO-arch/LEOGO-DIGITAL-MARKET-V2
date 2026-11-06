-- Approved products need an Admin-controlled price edit without resubmitting the Seller's item.
create or replace function public.admin_update_product_leogo_prices(
  p_product_id uuid, p_price numeric, p_variants jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_product public.seller_products%rowtype;
  v_entry jsonb;
  v_variant public.seller_product_variants%rowtype;
  v_seen uuid[] := '{}'::uuid[];
  v_variant_id uuid;
  v_price numeric;
  v_count integer;
begin
  if (select auth.uid()) is null or not private.is_leogo_admin('approvals.manage') then
    raise exception 'Product price management permission required';
  end if;
  select * into v_product from public.seller_products where id = p_product_id for update;
  if not found then raise exception 'Product not found'; end if;
  if v_product.product_approval_status not in ('approved','pending','under_review','changes_requested') then
    raise exception 'Product cannot be priced in its current approval status';
  end if;
  if p_price is null or p_price < v_product.price_kes or p_price <> round(p_price,2) then
    raise exception 'LEOGO selling price must be at least the Seller price, with two decimal places';
  end if;
  if jsonb_typeof(coalesce(p_variants,'[]'::jsonb)) <> 'array' then
    raise exception 'Invalid variation prices';
  end if;
  select count(*) into v_count from public.seller_product_variants where product_id = p_product_id;
  if jsonb_array_length(coalesce(p_variants,'[]'::jsonb)) <> v_count then
    raise exception 'Provide a LEOGO price for each product variation';
  end if;
  for v_entry in select value from jsonb_array_elements(coalesce(p_variants,'[]'::jsonb)) loop
    v_variant_id := nullif(v_entry->>'variant_id','')::uuid;
    v_price := nullif(v_entry->>'leogo_price_kes','')::numeric;
    if v_variant_id is null or v_variant_id = any(v_seen) then raise exception 'Invalid or duplicate variation'; end if;
    select * into v_variant from public.seller_product_variants
      where id = v_variant_id and product_id = p_product_id for update;
    if not found then raise exception 'Variation does not belong to this product'; end if;
    if v_price is null or v_price < v_variant.price_kes or v_price <> round(v_price,2) then
      raise exception 'LEOGO variation price must cover the Seller variation price';
    end if;
    update public.seller_product_variants set leogo_price_kes = v_price, updated_at = now() where id = v_variant_id;
    v_seen := array_append(v_seen,v_variant_id);
  end loop;
  update public.seller_products set leogo_price_kes = p_price, updated_at = now() where id = p_product_id;
  perform private.write_admin_audit('catalogue.product.set_leogo_prices','seller_product',p_product_id::text,
    to_jsonb(v_product), (select to_jsonb(p) from public.seller_products p where p.id = p_product_id),
    jsonb_build_object('seller_price',v_product.price_kes,'leogo_price',p_price,'variants',p_variants));
  return jsonb_build_object('ok',true,'product_id',p_product_id,'leogo_price_kes',p_price);
end
$function$;

revoke all on function public.admin_update_product_leogo_prices(uuid,numeric,jsonb) from public,anon;
grant execute on function public.admin_update_product_leogo_prices(uuid,numeric,jsonb) to authenticated;

-- Correct the adult-gated BAR customer catalogue: it removed price_kes but never
-- restored the LEOGO price. Preserve the existing age gate and other fields.
do $migration$
declare v_definition text;
begin
  select pg_get_functiondef('public.customer_leogo_bar_catalogue()'::regprocedure) into v_definition;
  if position('''seller_name'',s.business_name' in v_definition) = 0 then
    raise exception 'BAR catalogue structure changed; inspect before migrating';
  end if;
  v_definition := replace(v_definition,
    '''seller_name'',s.business_name',
    '''price_kes'',coalesce(p.leogo_price_kes,p.price_kes), ''flash_sale_price_kes'',case when p.flash_sale_price_kes is null then null else least(p.price_kes,p.flash_sale_price_kes)+(coalesce(p.leogo_price_kes,p.price_kes)-p.price_kes) end, ''seller_name'',s.business_name');
  execute v_definition;
end
$migration$;
