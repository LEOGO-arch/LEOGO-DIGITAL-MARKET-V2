
create or replace function public.admin_weekend_receiving_accounts()
returns jsonb language sql stable security definer set search_path='' as $$
select case when auth.uid() is not null and private.is_leogo_admin('payments.manage') then coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.display_name,'type',b.account_type,'assigned',exists(select 1 from public.payment_account_assignments a where a.function_code='weekend_shopping' and a.account_id=b.id)) order by b.display_name),'[]'::jsonb) else '[]'::jsonb end from public.payment_accounts b where b.status='active'
$$;
create or replace function public.admin_assign_weekend_receiving_account(p_account_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_leogo_admin('payments.manage') then raise exception 'Payment settings permission required';end if;
 perform public.admin_assign_payment_account('weekend_shopping',p_account_id);
end $$;
create or replace function public.customer_weekend_reminders()
returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(jsonb_build_object('cycle_id',c.id,'delivery_date',c.delivery_date,'remaining_kes',greatest(c.amount_due_kes-c.verified_paid_kes,0),'message',case when c.delivery_date<(now() at time zone 'Africa/Nairobi')::date then 'Your preferred date has passed. Contact LEOGO to review your shopping plan.' when c.status='funding' then 'Your shopping date is approaching. Complete your verified savings before delivery.' else 'Your shopping is fully funded. Check the delivery arrangements with LEOGO.' end) order by c.delivery_date),'[]'::jsonb)
from public.weekend_shopping_cycles c join public.weekend_shopping_plans p on p.id=c.plan_id where auth.uid() is not null and p.customer_id=auth.uid() and c.status in('funding','funded','release_ready') and c.delivery_date<=(now() at time zone 'Africa/Nairobi')::date+3
$$;
create or replace function public.admin_assign_weekend_rider(p_cycle_id uuid,p_rider_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c record;
begin
 if auth.uid() is null or not (private.is_leogo_admin('delivery.manage') or private.is_leogo_admin('orders.manage')) then raise exception 'Delivery permission required';end if;
 select * into c from public.weekend_shopping_cycles where id=p_cycle_id for update;
 if not found or c.status<>'released' or c.released_order_id is null or c.delivery_date>(now() at time zone 'Africa/Nairobi')::date then raise exception 'Released order and scheduled date required';end if;
 if not exists(select 1 from public.marketplace_orders o where o.id=c.released_order_id and o.payment_status='verified_paid' and o.payment_method='weekend_savings' and o.order_status not in('cancelled','delivered')) then raise exception 'Verified active marketplace order required';end if;
 return public.admin_assign_rider_to_order(c.released_order_id,p_rider_id);
end $$;
revoke execute on function public.admin_weekend_receiving_accounts(),public.admin_assign_weekend_receiving_account(uuid),public.customer_weekend_reminders(),public.admin_assign_weekend_rider(uuid,uuid) from public,anon;
grant execute on function public.admin_weekend_receiving_accounts(),public.admin_assign_weekend_receiving_account(uuid),public.customer_weekend_reminders(),public.admin_assign_weekend_rider(uuid,uuid) to authenticated;
