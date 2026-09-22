-- Fix Rider portal ambiguity caused by output column "status" conflicting with unqualified staff status.

create or replace function public.rider_list_delivery_jobs()
returns table(
  delivery_job_id uuid,order_id uuid,order_reference text,customer_name text,customer_phone text,
  delivery_zone text,county text,sub_county text,estate text,landmark text,location_link text,
  status text,payment_method text,payment_status text,assigned_at timestamptz,picked_up_at timestamptz,
  on_the_way_at timestamptz,delivered_at timestamptz,seller_pickups jsonb
)
language plpgsql security definer set search_path=''
as $$
begin
  if not exists(
    select 1 from public.leogo_staff ls
    where ls.user_id=(select auth.uid()) and ls.staff_role='rider' and ls.status='active'
  ) then raise exception 'Active LEOGO Rider account required'; end if;

  return query
  select d.id,o.id,o.order_reference,o.receiver_name,o.contact_number,o.delivery_zone,o.county,o.sub_county,o.estate,o.landmark,o.location_link,
    d.status,o.payment_method,o.payment_status,d.assigned_at,d.picked_up_at,d.on_the_way_at,d.delivered_at,
    coalesce((select jsonb_agg(jsonb_build_object(
      'seller_id',so.seller_id,'seller_name',s.business_name,'seller_phone',s.phone,'seller_location',s.location_details,
      'fulfilment_status',so.fulfilment_status,'seller_subtotal_kes',so.seller_subtotal_kes
    ) order by s.business_name)
    from public.marketplace_seller_orders so join public.seller_accounts s on s.user_id=so.seller_id
    where so.order_id=o.id),'[]'::jsonb)
  from public.marketplace_delivery_jobs d
  join public.marketplace_orders o on o.id=d.order_id
  where d.rider_id=(select auth.uid())
  order by case d.status when 'assigned' then 0 when 'picked_up' then 1 when 'on_the_way' then 2 else 3 end,o.created_at desc;
end $$;
