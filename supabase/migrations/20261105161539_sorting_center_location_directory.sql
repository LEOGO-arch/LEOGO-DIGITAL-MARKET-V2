create or replace function public.admin_sorting_center_directory()
returns jsonb language plpgsql security definer set search_path=''
as $function$
begin
  if not private.is_leogo_admin('delivery.manage') then raise exception 'Delivery management permission required'; end if;
  return jsonb_build_object(
    'staff',(select coalesce(jsonb_agg(jsonb_build_object('user_id',s.user_id,'display_name',s.display_name,'phone',s.phone,'staff_role',s.staff_role) order by s.display_name),'[]'::jsonb) from public.leogo_staff s where s.status='active'),
    'routes',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('origin_name',o.center_name,'destination_name',d.center_name) order by o.center_name,d.center_name),'[]'::jsonb) from public.sorting_center_routes r join public.sorting_centers o on o.id=r.origin_center_id join public.sorting_centers d on d.id=r.destination_center_id),
    'counties',(select coalesce(jsonb_agg(jsonb_build_object('code',c.code,'name',c.name) order by c.name),'[]'::jsonb) from public.kenya_counties c where c.is_active),
    'sub_counties',(select coalesce(jsonb_agg(jsonb_build_object('code',s.code,'county_code',s.county_code,'name',s.name) order by s.name),'[]'::jsonb) from public.kenya_subcounties s where s.is_active)
  );
end
$function$;
