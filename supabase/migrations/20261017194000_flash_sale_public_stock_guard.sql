-- Harden existing public Flash Sale listing, no duplicate RPC or tables.
-- Only advertise quantities that are actually available and valid discounts.
do $patch$
declare
  v_def text;
  v_new text;
  v_anchor text:='p.flash_sale_quantity as remaining_quantity,';
  v_price text:='and p.flash_sale_price_kes>0';
begin
  select pg_get_functiondef('public.customer_public_partner_flash_sales()'::regprocedure) into v_def;
  if v_def is null then raise exception 'Public Flash Sale function missing'; end if;
  if position('least(p.flash_sale_quantity,p.quantity_available) as remaining_quantity' in v_def)>0 then return; end if;
  if position(v_anchor in v_def)=0 then raise exception 'Flash quantity anchor changed'; end if;
  if position(v_price in v_def)=0 then raise exception 'Flash price anchor changed'; end if;
  v_new:=replace(v_def,v_anchor,
    'least(p.flash_sale_quantity,p.quantity_available) as remaining_quantity,');
  v_new:=replace(v_new,v_price,
    'and p.flash_sale_price_kes>0 and p.flash_sale_price_kes<p.price_kes and p.quantity_available>0');
  execute v_new;
end
$patch$;
