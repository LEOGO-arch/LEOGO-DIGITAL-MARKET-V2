-- Staging-only queue for verified LEOGO Admin accounts.
create or replace function public.admin_list_weekend_payments()
returns jsonb language sql stable security definer set search_path='' as $$
select case when auth.uid() is null or not private.is_leogo_admin() then
  '[]'::jsonb else
  coalesce(jsonb_agg(jsonb_build_object(
    'payment_id',w.id,'cycle_id',w.cycle_id,'customer_id',w.customer_id,
    'reference',w.payment_reference,'amount_kes',w.amount_kes,'status',w.status,
    'submitted_at',w.created_at,'delivery_date',c.delivery_date,
    'target_kes',c.amount_due_kes,'verified_kes',c.verified_paid_kes,
    'cadence',p.cadence,'plan_id',p.id
  ) order by w.created_at desc),'[]'::jsonb)
end
from public.weekend_shopping_payments w
join public.weekend_shopping_cycles c on c.id=w.cycle_id
join public.weekend_shopping_plans p on p.id=c.plan_id
where w.status='pending' and (select private.is_leogo_admin())
$$;
revoke execute on function public.admin_list_weekend_payments() from public,anon;
grant execute on function public.admin_list_weekend_payments() to authenticated;
