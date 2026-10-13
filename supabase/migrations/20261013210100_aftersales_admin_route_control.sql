create or replace function public.admin_configure_aftersales_return_route(p_return_id uuid,p_destination text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v public.pickup_station_return_parcels%rowtype;
begin
 if not private.is_leogo_admin('delivery.manage') then raise exception 'Delivery management permission required';end if;
 if p_destination not in ('seller','sorting_center') then raise exception 'Choose seller or sorting center';end if;
 select * into v from public.pickup_station_return_parcels where id=p_return_id and aftersales_case_id is not null for update;
 if not found or v.status<>'received_at_station' then raise exception 'Route can be changed only before rider handover';end if;
 update public.aftersales_return_waybills set route_destination=p_destination where return_id=p_return_id and waybill_path is null;
 if not found then raise exception 'Assign a courier before setting a route, and before its receipt is uploaded';end if;
 return jsonb_build_object('ok',true,'destination',p_destination);
end;$fn$;
revoke all on function public.admin_configure_aftersales_return_route(uuid,text) from public,anon;
grant execute on function public.admin_configure_aftersales_return_route(uuid,text) to authenticated;