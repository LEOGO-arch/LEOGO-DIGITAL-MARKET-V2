create or replace function public.pickup_partner_track_aftersales(p_code text)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v jsonb; v_code text:=upper(btrim(coalesce(p_code,''))); v_station uuid:=private.pickup_partner_station_id();
begin
 if auth.uid() is null then raise exception 'Sign in to track Aftersales returns'; end if;
 if length(v_code)<6 or length(v_code)>100 then return null;end if;
 select jsonb_build_object(
 'type','aftersales',
 'aftersales_number',c.case_reference,
 'case_status',c.status,
 'negotiation_status',n.stage,
 'created_at',c.created_at,
 'item_name',coalesce(i.product_name,r.item_description,'Item not identified'),
 'return_reference',r.return_reference,
 'return_status',r.status,
 'return_booked_at',r.booked_at,
 'return_dispatched_at',r.dispatched_at,
 'station_name',s.station_name,
 'last_updated',greatest(c.updated_at,coalesce(r.updated_at,c.updated_at))
 ) into v
 from public.marketplace_aftersales_cases c
 left join public.marketplace_aftersales_negotiations n on n.case_id=c.id
 left join public.marketplace_order_items i on i.id=c.order_item_id
 left join lateral (select x.* from public.pickup_station_return_parcels x where x.aftersales_case_id=c.id order by x.booked_at desc limit 1) r on true
 left join public.pickup_stations s on s.id=r.pickup_station_id
 where upper(c.case_reference)=v_code
 and (c.customer_id=auth.uid() or private.is_leogo_admin('orders.manage')
      or (v_station is not null and (r.pickup_station_id=v_station or c.return_pickup_station_id=v_station)))
 limit 1;
 return v;
end;$fn$;
revoke all on function public.pickup_partner_track_aftersales(text) from public,anon;
grant execute on function public.pickup_partner_track_aftersales(text) to authenticated;