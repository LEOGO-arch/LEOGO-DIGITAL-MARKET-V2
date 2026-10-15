-- Additive Admin Dashboard operations supplement. Does not modify orders, payments or settlements.
create or replace function public.admin_dashboard_operations_supplement()
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_result jsonb;
begin
  if not private.is_leogo_admin('dashboard.read') then raise exception 'Admin access required'; end if;
  select jsonb_build_object(
    'active_loans',jsonb_build_object('supported',true,'value',count(*) filter(where outstanding_kes>0 and disbursed_at is not null)),
    'overdue_loans',jsonb_build_object('supported',true,'value',count(*) filter(where outstanding_kes>0 and disbursed_at is not null and due_date<current_date)),
    'outstanding_loans_kes',coalesce(sum(outstanding_kes) filter(where outstanding_kes>0 and disbursed_at is not null),0)
  ) into v_result from public.wallet_loans;
  return jsonb_build_object(
    'loans',v_result,
    'pickup',jsonb_build_object(
      'awaiting_arrival',(select count(*) from public.pickup_station_parcels where status not in ('handed_over','cancelled') and arrived_at is null),
      'awaiting_receipt',(select count(*) from public.pickup_station_parcels where status not in ('handed_over','cancelled') and arrived_at is not null and received_at is null),
      'awaiting_handover',(select count(*) from public.pickup_station_parcels where received_at is not null and handed_over_at is null and status<>'cancelled')
    ),
    'exceptions',jsonb_build_object(
      'stalled_delivery_jobs',(select count(*) from public.marketplace_delivery_jobs where status not in ('delivered','cancelled','failed') and updated_at<now()-interval '48 hours'),
      'overdue_loans',(select count(*) from public.wallet_loans where outstanding_kes>0 and disbursed_at is not null and due_date<current_date)
    )
  );
end;$fn$;
revoke all on function public.admin_dashboard_operations_supplement() from public,anon;
grant execute on function public.admin_dashboard_operations_supplement() to authenticated;
