create or replace function public.sorting_staff_route_options(p_origin_center_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
begin
  if not private.sorting_center_has_access(p_origin_center_id,'dispatch') then raise exception 'Dispatch permission required at this sorting center'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('center_id',d.id,'center_name',d.center_name,'center_code',d.center_code,'center_type',d.center_type,'county',d.county,'sub_county',d.sub_county,'town',d.town,'estimated_hours',r.estimated_hours) order by d.county,d.center_type,d.center_name),'[]'::jsonb)
    from public.sorting_center_routes r join public.sorting_centers d on d.id=r.destination_center_id where r.origin_center_id=p_origin_center_id and r.is_active and d.is_active and d.can_receive);
end
$function$;
revoke all on function public.sorting_staff_route_options(uuid) from public,anon;
grant execute on function public.sorting_staff_route_options(uuid) to authenticated;
