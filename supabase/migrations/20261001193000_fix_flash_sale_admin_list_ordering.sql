-- Fix admin Flash Sale list ordering across UNION ALL branches.
-- PostgreSQL compound queries only allow simple output-column references in the
-- compound ORDER BY. Wrap the unioned rows, then apply the status-priority CASE
-- to the wrapper so the Admin Flash Sale Approval Center can load safely.

create or replace function public.admin_list_partner_flash_sales()
returns table(
  partner_type text,
  item_type text,
  item_id uuid,
  partner_id uuid,
  partner_name text,
  item_name text,
  normal_price_kes numeric,
  flash_price_kes numeric,
  flash_quantity numeric,
  starts_at timestamptz,
  ends_at timestamptz,
  flash_status text,
  admin_notes text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not private.is_leogo_admin('approvals.read') then
    raise exception 'Approval permission required';
  end if;

  perform private.expire_partner_flash_sales();

  return query
    select
      q.partner_type,
      q.item_type,
      q.item_id,
      q.partner_id,
      q.partner_name,
      q.item_name,
      q.normal_price_kes,
      q.flash_price_kes,
      q.flash_quantity,
      q.starts_at,
      q.ends_at,
      q.flash_status,
      q.admin_notes,
      q.updated_at
    from (
      select
        'seller'::text as partner_type,
        'product'::text as item_type,
        p.id as item_id,
        p.seller_id as partner_id,
        s.business_name as partner_name,
        p.product_name as item_name,
        p.price_kes as normal_price_kes,
        p.flash_sale_price_kes as flash_price_kes,
        p.flash_sale_quantity as flash_quantity,
        p.flash_sale_starts_at as starts_at,
        p.flash_sale_ends_at as ends_at,
        p.flash_sale_status as flash_status,
        p.flash_sale_admin_notes as admin_notes,
        p.updated_at
      from public.seller_products p
      join public.seller_accounts s on s.user_id=p.seller_id
      where p.flash_sale_requested or p.flash_sale_status<>'none'

      union all

      select
        'service_provider'::text,
        'service'::text,
        v.id,
        v.provider_id,
        a.business_name,
        v.service_name,
        v.price_from_kes,
        v.flash_sale_price_kes,
        null::numeric,
        v.flash_sale_starts_at,
        v.flash_sale_ends_at,
        v.flash_sale_status,
        v.flash_sale_admin_notes,
        v.updated_at
      from public.service_provider_services v
      join public.service_provider_accounts a on a.user_id=v.provider_id
      where v.flash_sale_requested or v.flash_sale_status<>'none'

      union all

      select
        'cyber'::text,
        'service'::text,
        c.id,
        c.provider_id,
        a.business_name,
        c.service_name,
        c.price_kes,
        c.flash_sale_price_kes,
        null::numeric,
        c.flash_sale_starts_at,
        c.flash_sale_ends_at,
        c.flash_sale_status,
        c.flash_sale_admin_notes,
        c.updated_at
      from public.cyber_services c
      join public.cyber_provider_accounts a on a.user_id=c.provider_id
      where c.flash_sale_requested or c.flash_sale_status<>'none'
    ) q
    order by
      case q.flash_status when 'requested' then 0 when 'approved' then 1 else 2 end,
      q.updated_at desc;
end
$function$;

revoke execute on function public.admin_list_partner_flash_sales() from public,anon;
grant execute on function public.admin_list_partner_flash_sales() to authenticated;
