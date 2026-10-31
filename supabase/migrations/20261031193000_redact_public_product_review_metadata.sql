-- Keep internal product moderation metadata out of the anonymous catalogue payload.
do $migration$
declare
  v_def text;
  v_before text := 'to_jsonb(p)||jsonb_build_object(';
  v_after text := '(to_jsonb(p) - ARRAY[''product_review_notes'',''product_reviewed_by'',''product_reviewed_at'',''flash_sale_admin_notes'',''flash_sale_reviewed_by'',''flash_sale_reviewed_at'']::text[])||jsonb_build_object(';
begin
  v_def := pg_get_functiondef('public.customer_marketplace_catalogue()'::regprocedure);

  if position(v_after in v_def) > 0 then
    return;
  end if;

  if position(v_before in v_def) = 0 then
    raise exception 'Product catalogue definition changed; inspect before redacting moderation metadata';
  end if;

  v_def := replace(v_def, v_before, v_after);
  execute v_def;
end
$migration$;
