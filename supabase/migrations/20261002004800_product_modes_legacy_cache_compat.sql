-- Backward-compatibility safeguard for cached Partner Portal clients.
-- The new UI explicitly sends international_order_enabled and enforces the
-- expected delivery date. Legacy cached UI may still send fulfilment_type only,
-- so do not break those submissions while cache versions roll over.

do $block$
declare
  v_def text;
  v_old text := $old$
    if coalesce(
      nullif(p_shipping->>'international_expected_delivery_date','')::date,
      nullif(p_shipping->>'expected_delivery_from','')::date,
      nullif(p_campaign->>'expected_delivery_from','')::date
    ) is null then
      raise exception 'Choose the expected international delivery date';
    end if;
$old$;
  v_new text := $new$
    if (p_shipping ? 'international_order_enabled')
       and coalesce(
         nullif(p_shipping->>'international_expected_delivery_date','')::date,
         nullif(p_shipping->>'expected_delivery_from','')::date,
         nullif(p_campaign->>'expected_delivery_from','')::date
       ) is null then
      raise exception 'Choose the expected international delivery date';
    end if;
$new$;
begin
  select pg_get_functiondef(
    'public.seller_save_product_shipping(uuid,jsonb,jsonb)'::regprocedure
  ) into v_def;

  if position(v_old in v_def)=0 then
    raise exception 'International delivery validation anchor not found';
  end if;

  execute replace(v_def,v_old,v_new);
end
$block$;
