create or replace function public.customer_public_personal_sales()
returns table(
  id uuid,public_name text,item_name text,marked_price_kes numeric,item_image_path text,
  public_title text,approved_at timestamptz,created_at timestamptz
)
language sql
security definer
set search_path=''
as $$
  select
    l.id,
    split_part(btrim(l.seller_name),' ',1)::text,
    l.item_name,
    l.marked_price_kes,
    l.item_image_path,
    (
      split_part(btrim(l.seller_name),' ',1)
      || ' is Selling '
      || case
           when lower(btrim(l.item_name)) ~ '^(a |an |the )' then btrim(l.item_name)
           when lower(left(btrim(l.item_name),1)) in ('a','e','i','o','u') then 'An '||btrim(l.item_name)
           else 'A '||btrim(l.item_name)
         end
    )::text,
    l.approved_at,
    l.created_at
  from public.customer_personal_sale_listings l
  where l.approval_status='approved' and l.sale_status='available'
  order by coalesce(l.approved_at,l.created_at) desc;
$$;
