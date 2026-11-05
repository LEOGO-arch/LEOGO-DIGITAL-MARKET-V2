create or replace function public.admin_sorting_center_movement_history(p_search text default null)
returns jsonb language plpgsql security definer set search_path=''
as $function$
begin
  if not private.is_leogo_admin('delivery.manage') then raise exception 'Delivery management permission required'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('event_id',e.id,'event_type',e.event_type,'created_at',e.created_at,'verified',e.verified,'actor',coalesce(e.actor_label,s.display_name),'order_reference',o.order_reference,'parcel_reference',p.parcel_reference,'shipment_tracking_number',sh.tracking_number,'from_center',fc.center_name,'to_center',tc.center_name,'remarks',e.remarks,'evidence_photo_path',e.evidence_photo_path) order by e.created_at desc),'[]'::jsonb)
    from public.sorting_parcel_events e join public.marketplace_orders o on o.id=e.order_id join public.sorting_parcels p on p.id=e.parcel_id left join public.sorting_shipments sh on sh.id=e.shipment_id left join public.sorting_centers fc on fc.id=e.from_center_id left join public.sorting_centers tc on tc.id=e.to_center_id left join public.leogo_staff s on s.user_id=e.actor_user_id
    where nullif(btrim(coalesce(p_search,'')),'') is null or concat_ws(' ',o.order_reference,p.parcel_reference,sh.tracking_number,fc.center_name,tc.center_name,e.actor_label,e.remarks) ilike '%'||btrim(p_search)||'%');
end
$function$;

create or replace function public.admin_sorting_center_activity()
returns jsonb language plpgsql security definer set search_path=''
as $function$
begin
  if not private.is_leogo_admin('delivery.manage') then raise exception 'Delivery management permission required'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('action',a.action,'entity_type',a.entity_type,'entity_id',a.entity_id,'actor_email',a.actor_email,'created_at',a.created_at,'before_data',a.before_data,'after_data',a.after_data,'metadata',a.metadata) order by a.created_at desc),'[]'::jsonb) from (select * from public.admin_audit_log where action like 'sorting.%' order by created_at desc limit 300) a);
end
$function$;
revoke all on function public.admin_sorting_center_movement_history(text) from public,anon;
revoke all on function public.admin_sorting_center_activity() from public,anon;
grant execute on function public.admin_sorting_center_movement_history(text) to authenticated;
grant execute on function public.admin_sorting_center_activity() to authenticated;
