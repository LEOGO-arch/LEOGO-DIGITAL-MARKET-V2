create or replace function private.sorting_center_has_access(p_center_id uuid,p_operation text default 'read')
returns boolean language sql stable security definer set search_path=''
as $function$
  select (select auth.uid()) is not null and (
    private.is_leogo_admin('delivery.manage')
    or private.is_leogo_admin('orders.manage')
    or (exists(select 1 from public.sorting_centers c where c.id=p_center_id and c.is_active)
      and exists (
        select 1 from public.sorting_center_staff a
        join public.leogo_staff s on s.user_id=a.user_id
        where a.user_id=(select auth.uid()) and a.center_id=p_center_id
          and a.is_active and s.status='active'
          and (a.role in ('manager','supervisor')
            or p_operation='read'
            or (p_operation='receive' and a.role='receiving_officer')
            or (p_operation='sort' and a.role='sorting_packing_officer')
            or (p_operation='dispatch' and a.role='dispatch_officer'))
      ))
  );
$function$;
