-- Avoid re-queuing an approved product only because the Shipping / MOQ RPC
-- writes the same effective price again. The core Seller product form already
-- owns product price approval. Shipping updates change price only when the
-- effective Local/International price is actually different.

do $block$
declare
  v_def text;
  v_old text := $old$
  update public.seller_products
  set fulfilment_type=v_type,
      price_kes=v_primary_price,
      updated_at=now()
  where id=p_product_id;
$old$;
  v_new text := $new$
  update public.seller_products
  set fulfilment_type=v_type,
      updated_at=now()
  where id=p_product_id;

  if v_primary_price is distinct from v_product.price_kes then
    update public.seller_products
    set price_kes=v_primary_price,
        updated_at=now()
    where id=p_product_id;
  end if;
$new$;
begin
  select pg_get_functiondef(
    'public.seller_save_product_shipping(uuid,jsonb,jsonb)'::regprocedure
  ) into v_def;

  if position(v_old in v_def)=0 then
    raise exception 'Product shipping final price update anchor not found';
  end if;

  execute replace(v_def,v_old,v_new);
end
$block$;
