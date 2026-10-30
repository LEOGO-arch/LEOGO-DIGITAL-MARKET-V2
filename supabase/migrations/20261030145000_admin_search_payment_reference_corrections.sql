-- Follow-up replacement of staging v1: prevent non-payment references from matching and leave untracked amounts blank.
-- Read-only, exact-code matching across verified LEOGO payment record sources.
-- Never call approval functions; results are customer-submitted claims, NOT bank confirmation.
create or replace function public.admin_search_payment_reference(p_code text)
returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare
 v_code text := upper(trim(coalesce(p_code,'')));
 v_source record;
 v_sql text;
 v_rows jsonb := '[]'::jsonb;
 v_part jsonb;
 v_seen integer := 0;
begin
 if not (
   private.is_leogo_admin('orders.payment_verify')
   or private.is_leogo_admin('payments.manage')
   or private.is_leogo_admin('approvals.manage')
 ) then raise exception 'Payment verification access required'; end if;
 if length(v_code)<>10 or v_code !~ '^[A-Z0-9]{10}$'
    or v_code !~ '[A-Z]' or v_code !~ '[0-9]' then
   raise exception 'Enter exactly one valid 10-character M-PESA code';
 end if;
 for v_source in
  select * from (values
  ('Marketplace order', 'marketplace_orders', 'order_reference', 'grand_total_kes', 'payment_status', 'created_at', 'payment_message'),
  ('Marketplace COD fee', 'marketplace_orders', 'order_reference', 'delivery_fee_kes', 'cod_delivery_fee_status', 'cod_delivery_fee_submitted_at', 'cod_delivery_fee_reference'),
  ('Cyber order', 'cyber_orders', 'order_reference', 'total_kes', 'payment_status', 'created_at', 'payment_reference'),
  ('Assisted Shopping', 'assisted_shopping_requests', 'request_reference', 'grand_total_kes', 'payment_status', 'created_at', 'payment_reference'),
  ('Group / Global order', 'group_order_participations', 'participation_reference', 'amount_kes', 'payment_status', 'joined_at', 'payment_reference'),
  ('Service request', 'service_requests', 'request_reference', NULL, 'payment_status', 'created_at', 'payment_reference'),
  ('Wallet deposit', 'wallet_deposit_requests', 'id', 'requested_amount_kes', 'request_status', 'submitted_at', 'payment_reference'),
  ('Wallet loan repayment', 'wallet_loan_repayment_requests', 'repayment_reference', 'amount_kes', 'payment_status', 'submitted_at', 'payment_reference'),
  ('Premium membership', 'premium_membership_payments', 'id', 'amount_kes', 'payment_status', 'submitted_at', 'payment_reference'),
  ('Premium meetup', 'premium_customer_meetup_payments', 'id', 'amount_kes', 'payment_status', 'submitted_at', 'payment_reference'),
  ('Partner billing', 'partner_billing_payments', 'id', 'amount_kes', 'payment_status', 'submitted_at', 'payment_reference'),
  ('Health medicine', 'health_medicine_orders', 'order_reference', 'grand_total_kes', 'payment_status', 'created_at', 'payment_message'),
  ('Health specialist', 'health_specialist_bookings', 'booking_reference', 'booking_fee_kes', 'payment_status', 'created_at', 'payment_message'),
  ('Lipa Pole Pole', 'lipa_pole_pole_payments', 'id', 'amount_kes', 'status', 'submitted_at', 'payment_reference'),
  ('Vacant house viewing', 'vacant_house_viewing_requests', 'request_reference', NULL, 'payment_status', 'created_at', 'payment_reference'),
  ('Aftersales return fee', 'aftersales_return_shipping', 'case_id', 'amount_kes', 'status', 'payment_submitted_at', 'payment_reference'),
  ('Aftersales exchange fee', 'aftersales_exchange_shipments', 'reference', 'delivery_cost_kes', 'status', 'created_at', 'delivery_payment_reference'),
  ('Aftersales refund (outgoing)', 'aftersales_refund_reviews', 'case_id', 'amount_kes', 'status', 'paid_at', 'payment_reference')
  ) as s(module_name,table_name,display_field,amount_field,status_field,date_field,payment_field)
 loop
  -- All table and column identifiers come from a fixed server-side whitelist.
  v_sql := format(
   'select coalesce(jsonb_agg(jsonb_build_object(
      ''module'', %L, ''record_id'', coalesce(to_jsonb(t)->>''id'',to_jsonb(t)->>''case_id''),
      ''reference'', coalesce(to_jsonb(t)->>%L, to_jsonb(t)->>''id'',to_jsonb(t)->>''case_id''),
      ''amount_kes'', to_jsonb(t)->>%L, ''status'', to_jsonb(t)->>%L,
      ''submitted_at'', to_jsonb(t)->>%L,
      ''matched_field'', %L
    )),''[]''::jsonb)
    from (select * from public.%I
      where upper(trim(coalesce(%I::text,'''')))=$1
         or upper(coalesce(%I::text,'''')) ~ (''(^|[^A-Z0-9])''||$1||''([^A-Z0-9]|$)'')
      limit 30) t',
   v_source.module_name, v_source.display_field,
   v_source.amount_field,v_source.status_field,
   v_source.date_field,v_source.payment_field,
   v_source.table_name,v_source.payment_field,v_source.payment_field);
  execute v_sql into v_part using v_code;
  v_rows:=v_rows||coalesce(v_part,'[]'::jsonb);
 end loop;
 return jsonb_build_object('code',v_code,'matches',v_rows,'match_count',jsonb_array_length(v_rows),
   'note','Match is only a record lookup. Confirm payment on the official LEOGO receiving device/account, not from customer-forwarded SMS.');
end $fn$;
revoke all on function public.admin_search_payment_reference(text) from public,anon;
grant execute on function public.admin_search_payment_reference(text) to authenticated;
