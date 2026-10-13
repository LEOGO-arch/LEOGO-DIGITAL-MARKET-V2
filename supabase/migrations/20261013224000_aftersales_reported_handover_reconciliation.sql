-- One-time reconciliation of specifically reported physical handover, using stored waybill and assigned rider.
-- Do not grant completion commissions here; only seller confirmation does that.
do $$
declare v public.pickup_station_return_parcels%rowtype;
        w public.aftersales_return_waybills%rowtype;
        v_step text;
begin
 select * into v from public.pickup_station_return_parcels
  where return_reference='AFR-d502288a0b0f' and status='received_at_station'
  and aftersales_case_id is not null for update;
 if not found then return; end if;
 select * into w from public.aftersales_return_waybills where return_id=v.id
  and waybill_path is not null and uploaded_at is not null and assignee_id is not null
  and courier_name is not null for update;
 if not found then raise exception 'Cannot reconcile return without uploaded waybill and registered assigned rider'; end if;
 if exists(select 1 from public.aftersales_return_transport_events where return_parcel_id=v.id) then
  raise exception 'Transport events already exist; manual review required';
 end if;
 v_step:=case when w.route_destination='sorting_center' then 'station_dispatched_to_sorting' else 'station_dispatched_to_seller' end;
 update public.pickup_station_return_parcels
  set status='dispatched',dispatched_at=now(),updated_at=now() where id=v.id;
 insert into public.aftersales_return_transport_events
 (return_parcel_id,aftersales_case_id,step,notes,actor_id)
 values(v.id,v.aftersales_case_id,v_step,
  'Reconciled previously uploaded rider waybill and owner-reported physical handover; rider: '||w.courier_name||
  '; original waybill uploaded at '||w.uploaded_at::text,w.uploaded_by);
 insert into public.marketplace_aftersales_negotiation_events
 (case_id,actor_id,actor_role,event_type,comment)
 values(v.aftersales_case_id,w.uploaded_by,'pickup_station','return_handover_reconciled',
  'Admin reconciliation of reported rider handover for '||v.return_reference||' with existing waybill');
end $$;