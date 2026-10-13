-- Direct rider delivery must use photo-proof secured procedure; prevent bypass via ordinary status updates.
create or replace function public.aftersales_exchange_rider_update(p_shipment_id uuid,p_action text,p_condition text default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare x public.aftersales_exchange_shipments%rowtype; v_next text;
begin
 select * into x from public.aftersales_exchange_shipments where id=p_shipment_id and rider_id=auth.uid() for update;
 if not found or not exists(select 1 from public.leogo_staff where user_id=auth.uid() and staff_role='rider' and status='active') then raise exception 'Not assigned to an active rider';end if;
 if p_action='pickup' and x.status='assigned' and p_condition in ('good','damaged','tampered','other') and length(btrim(coalesce(p_note,'')))>=5 then
 update public.aftersales_exchange_shipments set status='picked_up',picked_up_at=now(),rider_condition=p_condition,rider_condition_notes=btrim(p_note),updated_at=now() where id=x.id;
 elsif p_action='sorting' and x.status='picked_up' then
 update public.aftersales_exchange_shipments set status='sorting_received',sorting_received_at=now(),updated_at=now() where id=x.id;
 elsif p_action='transit' and x.status in ('picked_up','sorting_received') then
 update public.aftersales_exchange_shipments set status='on_the_way',on_the_way_at=now(),updated_at=now() where id=x.id;
 elsif p_action='arrive_station' and x.status='on_the_way' and x.pickup_station_id is not null then
 update public.aftersales_exchange_shipments set status='at_pickup_station',pickup_station_received_at=now(),updated_at=now() where id=x.id;
 else raise exception 'Invalid exchange delivery transition or missing parcel condition/proof';end if;
 return jsonb_build_object('ok',true);
end;$fn$;
