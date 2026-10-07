-- Fix last Flash Sale unit checkout without weakening seller_products checks.
do $block$
declare
  v_def text;
  v_old text := $old$
          flash_sale_quantity=case when v_flash_active then greatest(coalesce(flash_sale_quantity,0)-v_qty,0) else flash_sale_quantity end,
          flash_sale_status=case when v_flash_active and coalesce(flash_sale_quantity,0)-v_qty<=0 then 'expired' else flash_sale_status end,
          updated_at=now()
$old$;
  v_new text := $new$
          flash_sale_quantity=case when v_flash_active then greatest(coalesce(flash_sale_quantity,0)-v_qty,0) else flash_sale_quantity end,
          flash_sale_status=case when v_flash_active and coalesce(flash_sale_quantity,0)-v_qty<=0 then 'expired' else flash_sale_status end,
          flash_sale_requested=case when v_flash_active and coalesce(flash_sale_quantity,0)-v_qty<=0 then false else flash_sale_requested end,
          updated_at=now()
$new$;
begin
  select pg_get_functiondef(
    'public.customer_create_marketplace_order(jsonb,text,text,text,text,text,text,text,text,uuid,text,text)'::regprocedure
  ) into v_def;
  if position(v_old in v_def)=0 then
    raise exception 'Marketplace order Flash Sale stock-update anchor not found';
  end if;
  execute replace(v_def,v_old,v_new);
end
$block$;
