create or replace function public.admin_list_weekend_refunds()
returns jsonb language sql stable security definer set search_path='' as $$
select case when auth.uid() is not null and private.is_leogo_admin('settlements.read') then coalesce(jsonb_agg(jsonb_build_object('id',r.id,'cycle_id',r.cycle_id,'amount_kes',r.amount_kes,'reason',r.reason,'status',r.status,'refund_reference',r.refund_reference) order by r.requested_at desc),'[]'::jsonb) else '[]'::jsonb end from public.weekend_shopping_refunds r
$$;
revoke execute on function public.admin_list_weekend_refunds() from public,anon;
grant execute on function public.admin_list_weekend_refunds() to authenticated;