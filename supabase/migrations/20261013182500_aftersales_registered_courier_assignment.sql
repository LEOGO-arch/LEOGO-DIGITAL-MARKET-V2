alter table public.aftersales_return_waybills add column if not exists assignee_id uuid;
alter table public.aftersales_return_waybills add column if not exists assignee_type text;
create or replace function public.admin_aftersales_available_couriers()
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 if not private.is_leogo_admin('delivery.manage') then raise exception 'Delivery management permission required';end if;
 return (select coalesce(jsonb_agg(t order by t.label),'[]'::jsonb) from (
 select s.user_id as id,'rider'::text as kind,s.display_name as label from public.leogo_staff s where s.staff_role='rider' and s.status='active' and s.availability_status='available'
 union all
 select p.user_id,'courier',p.business_name from public.transport_provider_accounts p where p.application_status='approved' and p.availability_status='available' and p.user_id is not null
 ) t);
end;$fn$;
create or replace function public.admin_assign_aftersales_registered_courier(p_return_id uuid,p_assignee_id uuid,p_assignee_type text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v public.pickup_station_return_parcels%rowtype;v_name text;
begin
 if not private.is_leogo_admin('delivery.manage') then raise exception 'Delivery management permission required';end if;
 if p_assignee_type='rider' then
 select s.display_name into v_name from public.leogo_staff s where s.user_id=p_assignee_id and s.staff_role='rider' and s.status='active' and s.availability_status='available';
 elsif p_assignee_type='courier' then
 select p.business_name into v_name from public.transport_provider_accounts p where p.user_id=p_assignee_id and p.application_status='approved' and p.availability_status='available';
 else raise exception 'Select a LEOGO rider or approved courier';end if;
 if v_name is null then raise exception 'Selected rider or courier is no longer available';end if;
 select * into v from public.pickup_station_return_parcels where id=p_return_id and aftersales_case_id is not null for update;
 if not found or v.status not in ('received_at_station','dispatched') then raise exception 'Return must first be received at the Pickup Station';end if;
 insert into public.aftersales_return_waybills(return_id,courier_name,assignee_id,assignee_type,assigned_by)
 values(p_return_id,v_name,p_assignee_id,p_assignee_type,auth.uid())
 on conflict(return_id) do update set courier_name=excluded.courier_name,assignee_id=excluded.assignee_id,assignee_type=excluded.assignee_type,assigned_by=excluded.assigned_by,assigned_at=now()
 where public.aftersales_return_waybills.waybill_path is null;
 if not found then raise exception 'Waybill already recorded; assignment locked';end if;
 return jsonb_build_object('ok',true,'courier_name',v_name,'assignee_id',p_assignee_id);
end;$fn$;
revoke execute on function public.admin_assign_aftersales_return_courier(uuid,text) from authenticated;
revoke all on function public.admin_aftersales_available_couriers(),public.admin_assign_aftersales_registered_courier(uuid,uuid,text) from public,anon;
grant execute on function public.admin_aftersales_available_couriers(),public.admin_assign_aftersales_registered_courier(uuid,uuid,text) to authenticated;