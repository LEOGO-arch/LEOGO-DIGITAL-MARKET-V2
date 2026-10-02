-- Assigned staff privacy hardening:
-- Staff can read/download the Shopping List they were assigned without receiving
-- payment references or internal Admin/preparer UUIDs.

create or replace function public.staff_list_assigned_assisted_shopping_requests()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Staff sign in required'; end if;

  if not exists(
    select 1 from public.leogo_staff s
    where s.user_id=v_uid and s.status='active'
  ) then
    raise exception 'Active LEOGO staff account required';
  end if;

  select coalesce(jsonb_agg(row_data order by (row_data->>'assigned_at')::timestamptz desc),'[]'::jsonb)
  into v_result
  from (
    select
      (
        (to_jsonb(r) - array['payment_reference','prepared_by']::text[])
        || jsonb_build_object(
          'customer_name',cp.full_name,
          'customer_phone',cp.phone,
          'customer_email',u.email,
          'pickup_station_name',ps.station_name,
          'pickup_station_address',concat_ws(', ',ps.address_line,ps.town,ps.county),
          'assigned_at',a.assigned_at,
          'files',coalesce((
            select jsonb_agg(jsonb_build_object(
              'id',f.id,
              'path',f.storage_path,
              'name',f.original_name,
              'mime',f.mime_type,
              'size',f.size_bytes
            ) order by f.created_at)
            from public.assisted_shopping_files f
            where f.request_id=r.id
          ),'[]'::jsonb),
          'items',coalesce((
            select jsonb_agg(to_jsonb(i) order by i.sort_order,i.created_at)
            from public.assisted_shopping_quote_items i
            where i.request_id=r.id
          ),'[]'::jsonb),
          'order_reference',o.order_reference,
          'order_status',o.order_status,
          'delivery_status',d.status
        )
      ) row_data
    from public.assisted_shopping_assignments a
    join public.assisted_shopping_requests r on r.id=a.request_id
    left join public.customer_profiles cp on cp.user_id=r.customer_id
    left join auth.users u on u.id=r.customer_id
    left join public.pickup_stations ps on ps.id=r.pickup_station_id
    left join public.marketplace_orders o on o.id=r.marketplace_order_id
    left join public.marketplace_delivery_jobs d on d.order_id=o.id
    where a.staff_user_id=v_uid
  ) q;

  return v_result;
end
$function$;

revoke execute on function public.staff_list_assigned_assisted_shopping_requests()
  from public,anon;
grant execute on function public.staff_list_assigned_assisted_shopping_requests()
  to authenticated;
