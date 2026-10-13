-- Additive admin taxonomy management; product and approval records are never rewritten.
create or replace function public.admin_manage_product_taxonomy(
 p_entity text, p_name text, p_id uuid default null, p_parent_id uuid default null,
 p_active boolean default true
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_id uuid; v_name text; v_code text; v_existing text; v_parent uuid;
begin
 if not private.is_leogo_admin('products.manage') then
  raise exception 'Admin product management permission required';
 end if;
 if p_entity not in ('category','subcategory') then raise exception 'Invalid taxonomy type'; end if;
 v_name:=btrim(coalesce(p_name,''));
 if length(v_name)<2 or length(v_name)>100 then raise exception 'Name must contain 2 to 100 characters'; end if;
 if p_entity='subcategory' then
  if p_id is null then
   if p_parent_id is null or not exists(select 1 from public.product_categories where id=p_parent_id and is_assignable and not is_aggregator and code<>'pharmacy')
   then raise exception 'Choose an eligible parent category'; end if;
   v_parent:=p_parent_id;
  else
   select category_id into v_parent from public.product_subcategories where id=p_id;
   if not found then raise exception 'Subcategory not found'; end if;
   if p_parent_id is not null and p_parent_id<>v_parent then raise exception 'Cannot move an existing subcategory'; end if;
  end if;
 else
  if p_parent_id is not null then raise exception 'Category cannot have a parent'; end if;
 end if;
 if p_id is not null then
  if p_entity='category' then
   update public.product_categories set name=v_name,is_active=p_active where id=p_id returning id into v_id;
  else
   update public.product_subcategories set name=v_name,is_active=p_active where id=p_id returning id into v_id;
  end if;
  if v_id is null then raise exception 'Category or subcategory not found'; end if;
 else
  v_code:=left(trim(both '_' from regexp_replace(lower(v_name),'[^a-z0-9]+','_','g')),42);
  if length(v_code)<2 then v_code:='category'; end if;
  v_code:=v_code||'_'||substr(replace(gen_random_uuid()::text,'-',''),1,7);
  if p_entity='category' then
   insert into public.product_categories(code,name,is_active,is_assignable,is_aggregator,restricted_category,display_order)
   values(v_code,v_name,p_active,true,false,false,(select coalesce(max(display_order),0)+10 from public.product_categories))
   returning id into v_id;
  else
   insert into public.product_subcategories(category_id,code,name,is_active,display_order)
   values(v_parent,v_code,v_name,p_active,(select coalesce(max(display_order),0)+10 from public.product_subcategories where category_id=v_parent))
   returning id into v_id;
  end if;
 end if;
 return jsonb_build_object('id',v_id,'entity',p_entity,'name',v_name,'active',p_active);
end;$fn$;
revoke all on function public.admin_manage_product_taxonomy(text,text,uuid,uuid,boolean) from public,anon;
grant execute on function public.admin_manage_product_taxonomy(text,text,uuid,uuid,boolean) to authenticated;