-- Fix System Diagnosis product main-image check.
-- The previous dynamic SQL encoded one empty-string literal with too few quotes,
-- causing PostgreSQL to raise "unterminated quoted string" during Full Diagnosis.

do $patch$
declare
  v_def text;
  v_old text := $old$execute 'select count(*) from public.seller_products p where p.product_approval_status=''approved'' and nullif(btrim(coalesce(p.main_image_path,'')),'''') is null'$old$;
  v_new text := $new$execute 'select count(*) from public.seller_products p where p.product_approval_status=''approved'' and nullif(btrim(coalesce(p.main_image_path,'''')),'''') is null'$new$;
begin
  select pg_get_functiondef('public.admin_run_system_diagnosis(text,text,text)'::regprocedure)
  into v_def;

  if position(v_old in v_def)>0 then
    execute replace(v_def,v_old,v_new);
  elsif position(v_new in v_def)>0 then
    null; -- already fixed
  else
    raise exception 'Expected diagnostics main-image query was not found';
  end if;
end
$patch$;
