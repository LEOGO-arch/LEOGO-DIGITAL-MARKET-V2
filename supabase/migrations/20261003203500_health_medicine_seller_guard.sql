-- Enforce Health & Medicine separation at the Seller table boundary.
-- Safe because the current database has no Seller products in category code 'pharmacy'.

create or replace function private.prevent_seller_health_medicine_category()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if exists(
    select 1
    from public.product_categories c
    where c.id=new.category_id and c.code='pharmacy'
  ) then
    raise exception 'Health & Medicine products must be registered through the Health & Medicine Partner portal';
  end if;
  return new;
end;
$$;

drop trigger if exists seller_products_health_medicine_guard on public.seller_products;
create trigger seller_products_health_medicine_guard
before insert or update of category_id
on public.seller_products
for each row
execute function private.prevent_seller_health_medicine_category();
