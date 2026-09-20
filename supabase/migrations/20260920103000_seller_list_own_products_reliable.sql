-- Reliable Seller product list for Partner Portal.
-- Returns only the authenticated approved Seller's products and nested variants.

create or replace function public.seller_list_own_products()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(
    select 1 from public.seller_accounts s
    where s.user_id=v_uid and s.application_status='approved'
  ) then
    raise exception 'Approved Seller account required';
  end if;

  select coalesce(jsonb_agg(product_row order by (product_row->>'updated_at')::timestamptz desc),'[]'::jsonb)
  into v_result
  from (
    select to_jsonb(p) || jsonb_build_object(
      'seller_product_variants',
      coalesce((
        select jsonb_agg(to_jsonb(v) order by v.display_order,v.created_at)
        from public.seller_product_variants v
        where v.product_id=p.id
      ),'[]'::jsonb)
    ) as product_row
    from public.seller_products p
    where p.seller_id=v_uid
  ) q;

  return v_result;
end $$;

revoke execute on function public.seller_list_own_products() from public,anon;
grant execute on function public.seller_list_own_products() to authenticated;
