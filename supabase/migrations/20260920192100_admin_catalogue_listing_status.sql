-- Admin status control for Seller listings.

create or replace function public.admin_set_seller_product_listing_status(
  p_product_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_product public.seller_products%rowtype;
  v_seller_name text;
  v_actor_email text;
begin
  if not private.is_leogo_admin('products.manage') then raise exception 'Admin permission required'; end if;
  if p_status not in ('draft','active','inactive','suspended') then raise exception 'Unsupported listing status'; end if;

  select * into v_product from public.seller_products where id=p_product_id for update;
  if not found then raise exception 'Product not found'; end if;

  select business_name into v_seller_name from public.seller_accounts where user_id=v_product.seller_id;
  select email::text into v_actor_email from auth.users where id=auth.uid();

  update public.seller_products set listing_status=p_status,updated_at=now() where id=p_product_id;

  perform private.notify_partner(
    v_product.seller_id,'seller','product_listing_'||p_status,'Product listing updated',
    'Admin changed "'||v_product.product_name||'" to '||replace(p_status,'_',' ')||'.',
    'seller_product',p_product_id,'products',
    jsonb_build_object('product_id',p_product_id,'listing_status',p_status)
  );

  insert into public.admin_audit_log(actor_id,actor_email,action,entity_type,entity_id,before_data,after_data,metadata)
  values(
    auth.uid(),v_actor_email,'seller_product_status_changed','seller_product',p_product_id::text,
    jsonb_build_object('listing_status',v_product.listing_status),
    jsonb_build_object('listing_status',p_status),
    jsonb_build_object('product_name',v_product.product_name,'seller',coalesce(v_seller_name,''))
  );

  return jsonb_build_object('ok',true,'product_id',p_product_id,'listing_status',p_status);
end $$;

revoke execute on function public.admin_set_seller_product_listing_status(uuid,text) from public,anon;
grant execute on function public.admin_set_seller_product_listing_status(uuid,text) to authenticated;
