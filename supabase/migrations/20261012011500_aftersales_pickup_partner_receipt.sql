-- Physical receipt of a booked Aftersales return by its assigned Pickup Station staff.
create or replace function public.pickup_partner_receive_aftersales_return(p_return_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_station uuid:=private.pickup_partner_station_id(); v_return public.pickup_station_return_parcels%rowtype;
begin
 if v_station is null then raise exception 'Active Pickup Station assignment required'; end if;
 if length(btrim(coalesce(p_note,'')))<5 or length(p_note)>1000 then raise exception 'Describe physical parcel condition (5-1000 characters)'; end if;
 select * into v_return from public.pickup_station_return_parcels
 where id=p_return_id and pickup_station_id=v_station and aftersales_case_id is not null for update;
 if not found then raise exception 'Return not assigned to this Pickup Station'; end if;
 if v_return.status<>'awaiting_dispatch' then raise exception 'Return has already been received or processed'; end if;
 update public.pickup_station_return_parcels
   set status='received_at_station',admin_notes='Pickup Station received: '||btrim(p_note),updated_at=now()
   where id=p_return_id;
 insert into public.pickup_station_parcel_events
 (pickup_station_id,return_parcel_id,order_id,event_type,parcel_reference,actor_user_id,notes)
 values(v_station,v_return.id,v_return.original_order_id,'received',v_return.return_reference,auth.uid(),btrim(p_note));
 return jsonb_build_object('ok',true,'status','received_at_station','return_reference',v_return.return_reference);
end;$fn$;
revoke all on function public.pickup_partner_receive_aftersales_return(uuid,text) from public,anon;
grant execute on function public.pickup_partner_receive_aftersales_return(uuid,text) to authenticated;
