-- LEOGO V2 — reliable Seller product + variant save.
-- Adds variant profile pictures and makes product/variant persistence atomic.

alter table public.seller_product_variants
add column if not exists image_path text;

create or replace function public.seller_save_product_with_variants(
  p_product_id uuid,
  p_product jsonb,
  p_variants jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_product_id uuid := p_product_id;
  v_has_variants boolean := coalesce((p_product->>'has_variants')::boolean,false);
  v_variant jsonb;
  v_variant_count integer := 0;
  v_gallery text[];
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.seller_accounts s where s.user_id=v_uid and s.application_status='approved') then
    raise exception 'Approved Seller account required';
  end if;
  if jsonb_typeof(coalesce(p_product,'{}'::jsonb)) <> 'object' then raise exception 'Invalid product payload'; end if;
  if jsonb_typeof(coalesce(p_variants,'[]'::jsonb)) <> 'array' then raise exception 'Invalid variants payload'; end if;

  v_gallery := array(select jsonb_array_elements_text(coalesce(p_product->'gallery_image_paths','[]'::jsonb)));

  if char_length(btrim(coalesce(p_product->>'product_name',''))) < 2 then raise exception 'Product name is required'; end if;
  if coalesce((p_product->>'price_kes')::numeric,-1) < 0 then raise exception 'Enter a valid product price'; end if;
  if coalesce((p_product->>'quantity_available')::numeric,-1) < 0 then raise exception 'Enter a valid product quantity'; end if;
  if nullif(btrim(coalesce(p_product->>'main_image_path','')),'') is null then raise exception 'Add a main product picture'; end if;
  if nullif(btrim(coalesce(p_product->>'category_id','')),'') is null then raise exception 'Choose a category'; end if;

  if v_has_variants and jsonb_array_length(p_variants)=0 then raise exception 'Add at least one variant or switch off variants'; end if;

  if v_has_variants then
    for v_variant in select * from jsonb_array_elements(p_variants)
    loop
      if char_length(btrim(coalesce(v_variant->>'variant_name',''))) < 1 then raise exception 'Every variant requires a name'; end if;
      if coalesce((v_variant->>'price_kes')::numeric,-1) < 0 then raise exception 'Every variant requires a valid Amount (KSh)'; end if;
      if coalesce((v_variant->>'quantity_available')::numeric,-1) < 0 then raise exception 'Every variant requires a valid quantity'; end if;
      if nullif(btrim(coalesce(v_variant->>'image_path','')),'') is null then raise exception 'Every variant requires a profile picture'; end if;
    end loop;
  end if;

  if v_product_id is null then
    insert into public.seller_products(
      seller_id,product_name,price_kes,availability_status,quantity_available,measurement_unit,measurement_unit_other,
      accepts_lipa_pole_pole,lipa_pole_pole_first_deposit_kes,lipa_pole_pole_max_days,has_variants,product_details,
      main_image_path,gallery_image_paths,category_id,subcategory_id,custom_category_name,custom_subcategory_name,
      group_name,listing_status,updated_at
    )
    values(
      v_uid,btrim(p_product->>'product_name'),(p_product->>'price_kes')::numeric,p_product->>'availability_status',
      (p_product->>'quantity_available')::numeric,p_product->>'measurement_unit',
      nullif(btrim(coalesce(p_product->>'measurement_unit_other','')),''),
      coalesce((p_product->>'accepts_lipa_pole_pole')::boolean,false),
      nullif(p_product->>'lipa_pole_pole_first_deposit_kes','')::numeric,
      nullif(p_product->>'lipa_pole_pole_max_days','')::integer,
      v_has_variants,btrim(p_product->>'product_details'),p_product->>'main_image_path',coalesce(v_gallery,'{}'::text[]),
      (p_product->>'category_id')::uuid,nullif(p_product->>'subcategory_id','')::uuid,
      nullif(btrim(coalesce(p_product->>'custom_category_name','')),''),
      nullif(btrim(coalesce(p_product->>'custom_subcategory_name','')),''),
      nullif(btrim(coalesce(p_product->>'group_name','')),''),
      p_product->>'listing_status',now()
    )
    returning id into v_product_id;
  else
    if not exists(select 1 from public.seller_products p where p.id=v_product_id and p.seller_id=v_uid) then
      raise exception 'Product not found';
    end if;
    update public.seller_products set
      product_name=btrim(p_product->>'product_name'),
      price_kes=(p_product->>'price_kes')::numeric,
      availability_status=p_product->>'availability_status',
      quantity_available=(p_product->>'quantity_available')::numeric,
      measurement_unit=p_product->>'measurement_unit',
      measurement_unit_other=nullif(btrim(coalesce(p_product->>'measurement_unit_other','')),''),
      accepts_lipa_pole_pole=coalesce((p_product->>'accepts_lipa_pole_pole')::boolean,false),
      lipa_pole_pole_first_deposit_kes=nullif(p_product->>'lipa_pole_pole_first_deposit_kes','')::numeric,
      lipa_pole_pole_max_days=nullif(p_product->>'lipa_pole_pole_max_days','')::integer,
      has_variants=v_has_variants,
      product_details=btrim(p_product->>'product_details'),
      main_image_path=p_product->>'main_image_path',
      gallery_image_paths=coalesce(v_gallery,'{}'::text[]),
      category_id=(p_product->>'category_id')::uuid,
      subcategory_id=nullif(p_product->>'subcategory_id','')::uuid,
      custom_category_name=nullif(btrim(coalesce(p_product->>'custom_category_name','')),''),
      custom_subcategory_name=nullif(btrim(coalesce(p_product->>'custom_subcategory_name','')),''),
      group_name=nullif(btrim(coalesce(p_product->>'group_name','')),''),
      listing_status=p_product->>'listing_status',
      updated_at=now()
    where id=v_product_id and seller_id=v_uid;
  end if;

  delete from public.seller_product_variants where product_id=v_product_id;

  if v_has_variants then
    for v_variant in select * from jsonb_array_elements(p_variants)
    loop
      insert into public.seller_product_variants(
        product_id,variant_name,sku,price_kes,quantity_available,is_active,display_order,image_path,updated_at
      )
      values(
        v_product_id,btrim(v_variant->>'variant_name'),nullif(btrim(coalesce(v_variant->>'sku','')),''),
        (v_variant->>'price_kes')::numeric,(v_variant->>'quantity_available')::numeric,
        coalesce((v_variant->>'is_active')::boolean,true),
        coalesce((v_variant->>'display_order')::integer,v_variant_count),
        btrim(v_variant->>'image_path'),now()
      );
      v_variant_count := v_variant_count + 1;
    end loop;
  end if;

  return jsonb_build_object('ok',true,'product_id',v_product_id,'variant_count',v_variant_count);
end $$;

revoke execute on function public.seller_save_product_with_variants(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.seller_save_product_with_variants(uuid,jsonb,jsonb) to authenticated;
