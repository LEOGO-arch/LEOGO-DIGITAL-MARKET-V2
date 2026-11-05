-- Bridge the additive Sorting Center parcel ledger to existing Rider and Pickup
-- Station custody. Legacy orders without sorting_parcels are unaffected.

alter table public.sorting_parcel_events
  add column if not exists delivery_job_id uuid references public.marketplace_delivery_jobs(id) on delete set null,
  add column if not exists pickup_station_id uuid references public.pickup_stations(id) on delete set null;

alter table public.sorting_parcel_events
  drop constraint if exists sorting_parcel_events_event_type_check;
alter table public.sorting_parcel_events
  add constraint sorting_parcel_events_event_type_check
  check (event_type in (
    'booked','seller_handover','center_received','sorted','shipment_created',
    'shipment_dispatched','shipment_received','last_mile_assigned','out_for_delivery',
    'pickup_station_arrived','pickup_station_received','delivered','incident_reported','route_changed'
  ));

create index if not exists sorting_parcel_events_delivery_job_idx
  on public.sorting_parcel_events(delivery_job_id,created_at desc)
  where delivery_job_id is not null;

create or replace function private.sorting_sync_delivery_job_custody()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid;
  v_previous_status text;
  v_parcel_count integer;
  v_ready_count integer;
  v_handed_count integer;
begin
  v_actor:=coalesce(new.rider_id,new.assigned_by,(select auth.uid()));
  if tg_op='INSERT' then v_previous_status:=null; else v_previous_status:=old.status; end if;

  -- Bind the existing Admin rider assignment to only this order's sorting parcels.
  if new.status='assigned' and new.rider_id is not null
     and (tg_op='INSERT' or new.rider_id is distinct from old.rider_id) then
    with assigned as (
      update public.sorting_parcels p
      set delivery_job_id=new.id,updated_at=now()
      where p.order_id=new.order_id
        and p.status='ready_for_last_mile'
        and p.delivery_job_id is distinct from new.id
      returning p.id,p.order_id,p.current_center_id,p.parcel_reference
    )
    insert into public.sorting_parcel_events(
      parcel_id,order_id,event_type,from_center_id,actor_user_id,actor_label,
      verified,delivery_job_id,remarks
    )
    select a.id,a.order_id,'last_mile_assigned',a.current_center_id,v_actor,
      coalesce((select ls.display_name from public.leogo_staff ls where ls.user_id=v_actor),'LEOGO Admin'),
      true,new.id,'Admin assigned the existing LEOGO Rider delivery job from the final sorting center.'
    from assigned a;
  end if;

  -- Require every non-cancelled Sorting Center parcel for this order to be ready,
  -- with no unresolved incidents or active shipment, before a rider can take it.
  if new.status='picked_up' and v_previous_status='assigned' then
    select count(*),count(*) filter(where p.status='ready_for_last_mile')
      into v_parcel_count,v_ready_count
    from public.sorting_parcels p
    where p.order_id=new.order_id and p.status<>'cancelled';
    if v_parcel_count>0 and v_parcel_count<>v_ready_count then
      raise exception 'All Sorting Center parcels for this order must be ready for last-mile handover';
    end if;
    if exists(
      select 1 from public.sorting_parcels p
      join public.sorting_parcel_incidents i on i.parcel_id=p.id and i.status<>'resolved'
      where p.order_id=new.order_id and p.status<>'cancelled'
    ) then raise exception 'Resolve open parcel incidents before Rider handover'; end if;
    if exists(
      select 1 from public.sorting_parcels p
      join public.sorting_shipment_parcels sp on sp.parcel_id=p.id and sp.is_active
      where p.order_id=new.order_id and p.status<>'cancelled'
    ) then raise exception 'A Sorting Center parcel is still active in a shipment'; end if;

    with handed as (
      update public.sorting_parcels p
      set status='handed_to_rider',delivery_job_id=new.id,updated_at=now()
      where p.order_id=new.order_id and p.status='ready_for_last_mile'
      returning p.id,p.order_id,p.current_center_id,p.parcel_reference
    )
    insert into public.sorting_parcel_events(
      parcel_id,order_id,event_type,from_center_id,actor_user_id,actor_label,
      verified,delivery_job_id,remarks
    )
    select h.id,h.order_id,'last_mile_assigned',h.current_center_id,new.rider_id,
      coalesce((select ls.display_name from public.leogo_staff ls where ls.user_id=new.rider_id),'LEOGO Rider'),
      true,new.id,'Rider confirmed physical receipt from the final sorting center.'
    from handed h;
    get diagnostics v_handed_count=row_count;
    if v_handed_count>0 then
      -- The existing Rider workflow uses ready_for_dispatch as the state before
      -- the Rider starts the final leg. Keep that workflow as the source of truth.
      update public.marketplace_delivery_jobs d
      set status='ready_for_dispatch',ready_for_dispatch_at=coalesce(d.ready_for_dispatch_at,now()),
          ready_for_dispatch_by=new.rider_id,updated_at=now()
      where d.id=new.id and d.status='picked_up';
    end if;
  end if;

  if new.status='on_the_way' and v_previous_status is distinct from new.status then
    insert into public.sorting_parcel_events(
      parcel_id,order_id,event_type,from_center_id,actor_user_id,actor_label,
      verified,delivery_job_id,remarks
    )
    select p.id,p.order_id,'out_for_delivery',p.current_center_id,new.rider_id,
      coalesce((select ls.display_name from public.leogo_staff ls where ls.user_id=new.rider_id),'LEOGO Rider'),
      true,new.id,'Rider started the final delivery leg.'
    from public.sorting_parcels p
    where p.delivery_job_id=new.id and p.status='handed_to_rider';
  end if;

  if new.status='delivered' and v_previous_status is distinct from new.status then
    select count(*) into v_parcel_count from public.sorting_parcels p
    where p.order_id=new.order_id and p.status<>'cancelled';
    select count(*) into v_handed_count from public.sorting_parcels p
    where p.order_id=new.order_id and p.status in ('handed_to_rider','delivered');
    if v_parcel_count>0 and v_parcel_count<>v_handed_count then
      raise exception 'All Sorting Center parcels must be handed to the Rider before delivery completion';
    end if;
    with delivered as (
      update public.sorting_parcels p
      set status='delivered',delivered_at=coalesce(p.delivered_at,now()),updated_at=now()
      where p.delivery_job_id=new.id and p.status='handed_to_rider'
      returning p.id,p.order_id,p.current_center_id,p.parcel_reference
    )
    insert into public.sorting_parcel_events(
      parcel_id,order_id,event_type,from_center_id,actor_user_id,actor_label,
      verified,delivery_job_id,remarks
    )
    select d.id,d.order_id,'delivered',d.current_center_id,new.rider_id,
      coalesce((select ls.display_name from public.leogo_staff ls where ls.user_id=new.rider_id),'LEOGO Rider'),
      true,new.id,'Existing LEOGO Rider delivery confirmation verified final handover.'
    from delivered d;
  end if;
  return new;
end
$function$;

drop trigger if exists sorting_delivery_job_custody_bridge on public.marketplace_delivery_jobs;
create trigger sorting_delivery_job_custody_bridge
after insert or update on public.marketplace_delivery_jobs
for each row execute function private.sorting_sync_delivery_job_custody();

create or replace function private.sorting_sync_pickup_station_custody()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_event text;
  v_actor uuid;
  v_note text;
  v_parcel_count integer;
  v_handed_count integer;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status='arrived_pending_receipt' then
    v_event:='pickup_station_arrived'; v_actor:=new.arrived_by_rider_id;
    v_note:='Rider recorded arrival at the selected Pickup Station; station staff must confirm physical receipt.';
  elsif new.status='received' then
    v_event:='pickup_station_received'; v_actor:=new.received_by;
    v_note:='Pickup Station staff confirmed physical receipt with photo evidence.';
  elsif new.status='handed_over' then
    select count(*),count(*) filter(where p.status='handed_to_rider')
      into v_parcel_count,v_handed_count
    from public.sorting_parcels p where p.order_id=new.order_id and p.status<>'cancelled';
    if v_parcel_count>0 and v_parcel_count<>v_handed_count then
      raise exception 'All Sorting Center parcels must reach the Pickup Station before customer handover';
    end if;
    v_event:='delivered'; v_actor:=new.handed_over_by;
    v_note:='Pickup Station partner verified customer handover with photo evidence.';
  else return new;
  end if;

  if v_event='delivered' then
    with delivered as (
      update public.sorting_parcels p
      set status='delivered',delivered_at=coalesce(p.delivered_at,now()),updated_at=now()
      where p.order_id=new.order_id and p.status='handed_to_rider'
      returning p.id,p.order_id,p.current_center_id,p.delivery_job_id
    )
    insert into public.sorting_parcel_events(
      parcel_id,order_id,event_type,from_center_id,actor_user_id,actor_label,
      verified,delivery_job_id,pickup_station_id,evidence_photo_path,remarks
    )
    select d.id,d.order_id,v_event,d.current_center_id,v_actor,
      coalesce((select pa.display_name from public.pickup_station_partner_accounts pa where pa.user_id=v_actor),'Pickup Station Partner'),
      true,d.delivery_job_id,new.pickup_station_id,new.handover_photo_path,v_note
    from delivered d;
  else
    insert into public.sorting_parcel_events(
      parcel_id,order_id,event_type,from_center_id,actor_user_id,actor_label,
      verified,delivery_job_id,pickup_station_id,evidence_photo_path,remarks
    )
    select p.id,p.order_id,v_event,p.current_center_id,v_actor,
      case when v_event='pickup_station_arrived' then 'LEOGO Rider' else coalesce((select pa.display_name from public.pickup_station_partner_accounts pa where pa.user_id=v_actor),'Pickup Station Partner') end,
      true,p.delivery_job_id,new.pickup_station_id,
      case when v_event='pickup_station_received' then new.receive_photo_path else null end,v_note
    from public.sorting_parcels p
    where p.order_id=new.order_id and p.delivery_job_id is not null and p.status='handed_to_rider';
  end if;
  return new;
end
$function$;

drop trigger if exists sorting_pickup_station_custody_bridge on public.pickup_station_parcels;
create trigger sorting_pickup_station_custody_bridge
after update on public.pickup_station_parcels
for each row execute function private.sorting_sync_pickup_station_custody();

create or replace function public.rider_list_sorting_center_pickups()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_uid uuid:=(select auth.uid());
begin
  if not exists(select 1 from public.leogo_staff ls where ls.user_id=v_uid and ls.staff_role='rider' and ls.status='active') then
    raise exception 'Active LEOGO Rider account required';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('order_id',d.order_id,'centers',x.centers) order by d.assigned_at desc)
    from public.marketplace_delivery_jobs d
    cross join lateral (
      select jsonb_agg(jsonb_build_object(
        'center_id',g.center_id,'center_name',g.center_name,'location',g.location,
        'parcel_references',g.parcel_references
      ) order by g.center_name) centers
      from (
        select p.current_center_id center_id,c.center_name,
          concat_ws(', ',c.town,c.sub_county,c.county,c.physical_address) location,
          jsonb_agg(p.parcel_reference order by p.parcel_reference) parcel_references
        from public.sorting_parcels p
        join public.sorting_centers c on c.id=p.current_center_id
        where p.order_id=d.order_id and p.delivery_job_id=d.id
          and p.status in ('ready_for_last_mile','handed_to_rider')
        group by p.current_center_id,c.center_name,c.town,c.sub_county,c.county,c.physical_address
      ) g
    ) x
    where d.rider_id=v_uid and x.centers is not null
  ),'[]'::jsonb);
end
$function$;

revoke all on function public.rider_list_sorting_center_pickups() from public,anon;
grant execute on function public.rider_list_sorting_center_pickups() to authenticated;

create or replace function public.customer_list_sorting_order_tracking(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_uid uuid:=(select auth.uid()); v_rows jsonb;
begin
  if v_uid is null or not exists(select 1 from public.marketplace_orders where id=p_order_id and customer_id=v_uid) then raise exception 'Order not found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'event_type',e.event_type,'created_at',e.created_at,'verified',e.verified,
    'from_center',fc.center_name,'to_center',tc.center_name,
    'pickup_station_name',ps.station_name,'shipment_tracking_number',sh.tracking_number,
    'route_estimated_hours',r.estimated_hours,
    'route_expected_at',case when e.event_type='shipment_dispatched' and r.estimated_hours is not null then e.created_at+(r.estimated_hours*interval '1 hour') else null end
  ) order by e.created_at),'[]'::jsonb)
  into v_rows
  from public.sorting_parcel_events e
  left join public.sorting_centers fc on fc.id=e.from_center_id
  left join public.sorting_centers tc on tc.id=e.to_center_id
  left join public.pickup_stations ps on ps.id=e.pickup_station_id
  left join public.sorting_shipments sh on sh.id=e.shipment_id
  left join public.sorting_center_routes r on r.origin_center_id=e.from_center_id and r.destination_center_id=e.to_center_id
  where e.order_id=p_order_id and e.verified and e.event_type<>'booked';
  return jsonb_build_object('order_id',p_order_id,'events',v_rows);
end
$function$;
