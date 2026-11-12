-- Production launch lock: main-hosted testing uses staging, not production funds.
-- Keep this in place until a separate authorized financial launch and acceptance review.
do $$
declare f record;
begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('admin_mark_weekend_release_ready','admin_review_weekend_payment','customer_create_weekend_shopping','customer_submit_weekend_payment','customer_generate_next_weekend_cycle','admin_list_weekend_payments','admin_list_weekend_ready','customer_create_weekend_shopping_quoted','customer_release_weekend_order','admin_weekend_shopping_reconciliation','admin_record_weekend_payment_evidence','customer_cancel_weekend_cycle','admin_review_weekend_refund','admin_plan_weekend_preparation','admin_list_weekend_refunds','admin_weekend_receiving_accounts','admin_assign_weekend_receiving_account','customer_weekend_reminders','admin_assign_weekend_rider') loop
 execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
 end loop;
end $$;
-- Defense in depth: production has no Weekend Shopping direct client access.
revoke all privileges on public.weekend_shopping_plans,public.weekend_shopping_cycles,public.weekend_shopping_items,public.weekend_shopping_payments,public.weekend_shopping_refunds from public,anon,authenticated;
revoke select(id,cycle_id,customer_id,amount_kes,reason,status,requested_at,approved_at,completed_at,refund_reference) on public.weekend_shopping_refunds from authenticated;
