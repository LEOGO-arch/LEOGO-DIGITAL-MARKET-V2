-- LEOGO Admin Control Center V1 production dashboard foundation.
-- Reuses existing customer, wallet, premium, accommodation, payment and audit records.

alter table public.pickup_stations
  add column if not exists contact_phone text,
  add column if not exists operating_hours text;

create or replace function public.admin_production_dashboard(
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := coalesce(p_from, date_trunc('day', now()));
  v_to timestamptz := coalesce(p_to, now());
  v_pending_approvals bigint;
  v_premium_revenue numeric;
  v_statement_revenue numeric;
  v_missing_assignments bigint;
  v_inactive_assignments bigint;
begin
  if not private.is_leogo_admin('dashboard.read') then
    raise exception 'Admin access required';
  end if;
  if v_to <= v_from then raise exception 'Invalid reporting range'; end if;

  select
    (select count(*) from public.premium_customers where application_status in ('submitted','under_review')) +
    (select count(*) from public.premium_profiles where application_status in ('submitted','under_review')) +
    (select count(*) from public.premium_membership_payments where payment_status='pending') +
    (select count(*) from public.wallet_deposit_requests where request_status='pending') +
    (select count(*) from public.wallet_loan_applications where application_status in ('pending','under_review')) +
    (select count(*) from public.wallet_withdrawal_requests where request_status in ('pending_call','approved_processing')) +
    (select count(*) from public.accommodation_hosts where verification_status in ('pending','under_review')) +
    (select count(*) from public.accommodation_properties where approval_status in ('submitted','under_review'))
  into v_pending_approvals;

  select coalesce(sum(amount_kes),0) into v_premium_revenue
  from public.premium_membership_payments
  where payment_status in ('confirmed','approved') and reviewed_at >= v_from and reviewed_at < v_to;

  select coalesce(sum(fee_amount_kes),0) into v_statement_revenue
  from public.wallet_statement_downloads
  where requested_at >= v_from and requested_at < v_to;

  select count(*) into v_missing_assignments
  from unnest(array[
    'wallet_sacco_deposits','savings_challenge','loan_repayment','marketplace_orders',
    'lipa_pole_pole','premium_payments','accommodation_payments','service_payments',
    'transport_payments'
  ]) f(code)
  where not exists (select 1 from public.payment_account_assignments a where a.function_code=f.code);

  select count(*) into v_inactive_assignments
  from public.payment_account_assignments a
  join public.payment_accounts p on p.id=a.account_id
  where p.status <> 'active';

  return jsonb_build_object(
    'range', jsonb_build_object('from',v_from,'to',v_to),
    'top', jsonb_build_object(
      'orders', jsonb_build_object('supported',false,'value',null),
      'gross_sales', jsonb_build_object('supported',false,'value',null),
      'leogo_revenue', jsonb_build_object('supported',true,'value',v_premium_revenue+v_statement_revenue),
      'pending_approvals', jsonb_build_object('supported',true,'value',v_pending_approvals),
      'active_deliveries', jsonb_build_object('supported',false,'value',null)
    ),
    'revenue', jsonb_build_object(
      'gross_order_sales', jsonb_build_object('supported',false,'value',null),
      'platform_fees', jsonb_build_object('supported',false,'value',null),
      'delivery_fees', jsonb_build_object('supported',false,'value',null),
      'pickup_fees', jsonb_build_object('supported',false,'value',null),
      'premium', jsonb_build_object('supported',true,'value',v_premium_revenue),
      'service_commission', jsonb_build_object('supported',false,'value',null),
      'accommodation_commission', jsonb_build_object('supported',false,'value',null),
      'other', jsonb_build_object('supported',true,'value',v_statement_revenue),
      'total_leogo', v_premium_revenue+v_statement_revenue
    ),
    'wallet', jsonb_build_object(
      'deposits', (select coalesce(sum(requested_amount_kes),0) from public.wallet_deposit_requests where submitted_at>=v_from and submitted_at<v_to),
      'withdrawals', (select coalesce(sum(requested_amount_kes),0) from public.wallet_withdrawal_requests where submitted_at>=v_from and submitted_at<v_to),
      'savings_deposits', (select coalesce(sum(requested_amount_kes),0) from public.wallet_deposit_requests where deposit_kind='challenge' and submitted_at>=v_from and submitted_at<v_to),
      'pending_deposits', (select count(*) from public.wallet_deposit_requests where request_status='pending'),
      'pending_withdrawals', (select count(*) from public.wallet_withdrawal_requests where request_status in ('pending_call','approved_processing')),
      'active_challenges', (select count(*) from public.wallet_challenges where challenge_status='active'),
      'loan_applications', (select count(*) from public.wallet_loan_applications where application_status in ('pending','under_review')),
      'active_loans', jsonb_build_object('supported',false,'value',null),
      'overdue_loans', jsonb_build_object('supported',false,'value',null),
      'loan_repayments', jsonb_build_object('supported',false,'value',null)
    ),
    'network', jsonb_build_object(
      'customers', jsonb_build_object('supported',true,'value',(select count(*) from public.customer_profiles)),
      'sellers', jsonb_build_object('supported',false,'value',null),
      'service_providers', jsonb_build_object('supported',false,'value',null),
      'transport_providers', jsonb_build_object('supported',false,'value',null),
      'premium_profiles', jsonb_build_object('supported',true,'value',(select count(*) from public.premium_profiles where application_status='approved')),
      'accommodation_providers', jsonb_build_object('supported',true,'value',(select count(*) from public.accommodation_hosts where verification_status='approved')),
      'products', jsonb_build_object('supported',false,'value',null),
      'pickup_stations', jsonb_build_object('supported',true,'value',(select count(*) from public.pickup_stations where is_active))
    ),
    'delivery', jsonb_build_object('supported',false),
    'alerts', coalesce((select jsonb_agg(alert) from (values
      (case when v_missing_assignments > 0 then jsonb_build_object('level','warning','title','Payment functions need accounts','detail',v_missing_assignments||' payment function(s) have no assigned account.','view','settings','tab','assignments') end),
      (case when v_inactive_assignments > 0 then jsonb_build_object('level','danger','title','Inactive payment destination assigned','detail',v_inactive_assignments||' function assignment(s) point to an inactive account.','view','settings','tab','assignments') end)
    ) a(alert) where alert is not null),'[]'::jsonb),
    'recent_admin_activity', coalesce((
      select jsonb_agg(jsonb_build_object('id',x.id,'admin',coalesce(x.actor_email,'System'),'action',x.action,'entity',x.entity_type,'reference',x.entity_id,'created_at',x.created_at) order by x.created_at desc)
      from (select * from public.admin_audit_log order by created_at desc limit 8) x
    ),'[]'::jsonb),
    'generated_at', now()
  );
end;
$$;

create or replace function public.admin_save_pickup_station(p_station_id uuid, p_station jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_before jsonb; v_after jsonb; v_fee numeric;
begin
  if not private.is_leogo_admin('delivery.manage') then raise exception 'Delivery settings permission required'; end if;
  v_fee := coalesce((p_station->>'service_fee_percent')::numeric,0);
  if v_fee < 0 or v_fee > 100 then raise exception 'Pickup fee must be between 0 and 100 percent'; end if;
  if char_length(btrim(coalesce(p_station->>'station_name',''))) < 2 then raise exception 'Station name is required'; end if;
  if p_station_id is null then
    insert into public.pickup_stations(station_name,county,sub_county,town,address_line,landmark,door_number,contact_phone,operating_hours,service_fee_percent,is_active,display_order,updated_by)
    values(btrim(p_station->>'station_name'),btrim(p_station->>'county'),btrim(p_station->>'sub_county'),btrim(p_station->>'town'),btrim(p_station->>'address_line'),nullif(btrim(p_station->>'landmark'),''),nullif(btrim(p_station->>'door_number'),''),nullif(btrim(p_station->>'contact_phone'),''),nullif(btrim(p_station->>'operating_hours'),''),v_fee,coalesce((p_station->>'is_active')::boolean,true),coalesce((p_station->>'display_order')::smallint,0),(select auth.uid())) returning id into v_id;
    select to_jsonb(t) into v_after from public.pickup_stations t where id=v_id;
    perform private.write_admin_audit('pickup_station.created','pickup_station',v_id::text,null,v_after);
  else
    select to_jsonb(t) into v_before from public.pickup_stations t where id=p_station_id for update;
    if v_before is null then raise exception 'Pickup station not found'; end if;
    update public.pickup_stations set station_name=btrim(p_station->>'station_name'),county=btrim(p_station->>'county'),sub_county=btrim(p_station->>'sub_county'),town=btrim(p_station->>'town'),address_line=btrim(p_station->>'address_line'),landmark=nullif(btrim(p_station->>'landmark'),''),door_number=nullif(btrim(p_station->>'door_number'),''),contact_phone=nullif(btrim(p_station->>'contact_phone'),''),operating_hours=nullif(btrim(p_station->>'operating_hours'),''),service_fee_percent=v_fee,is_active=coalesce((p_station->>'is_active')::boolean,true),display_order=coalesce((p_station->>'display_order')::smallint,0),updated_by=(select auth.uid()),updated_at=now()
    where id=p_station_id;
    v_id:=p_station_id;
    select to_jsonb(t) into v_after from public.pickup_stations t where id=v_id;
    perform private.write_admin_audit('pickup_station.updated','pickup_station',v_id::text,v_before,v_after);
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_record_export(
  p_report text,
  p_scope text,
  p_format text,
  p_record_count integer,
  p_filters jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_leogo_admin('reports.export') then raise exception 'Admin permission required'; end if;
  if p_format not in ('xlsx','pdf') or p_scope not in ('selected','filtered','dashboard') then
    raise exception 'Invalid export request';
  end if;
  perform private.write_admin_audit(
    'report.exported', 'report', p_report, null, null,
    jsonb_build_object('scope',p_scope,'format',p_format,'record_count',greatest(coalesce(p_record_count,0),0),'filters',coalesce(p_filters,'{}'::jsonb))
  );
end;
$$;

create or replace function public.admin_archive_pickup_stations(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if not private.is_leogo_admin('delivery.manage') then raise exception 'Admin permission required'; end if;
  if coalesce(array_length(p_ids,1),0)=0 then return 0; end if;
  update public.pickup_stations set is_active=false, updated_by=(select auth.uid()), updated_at=now()
  where id=any(p_ids) and is_active;
  get diagnostics v_count=row_count;
  perform private.write_admin_audit('pickup_station.bulk_archived','pickup_station',null,null,null,jsonb_build_object('count',v_count,'ids',to_jsonb(p_ids)));
  return v_count;
end;
$$;

revoke execute on function public.admin_production_dashboard(timestamptz,timestamptz) from public, anon;
revoke execute on function public.admin_record_export(text,text,text,integer,jsonb) from public, anon;
revoke execute on function public.admin_archive_pickup_stations(uuid[]) from public, anon;
grant execute on function public.admin_production_dashboard(timestamptz,timestamptz) to authenticated;
grant execute on function public.admin_record_export(text,text,text,integer,jsonb) to authenticated;
grant execute on function public.admin_archive_pickup_stations(uuid[]) to authenticated;
revoke execute on function public.admin_save_pickup_station(uuid,jsonb) from public, anon;
grant execute on function public.admin_save_pickup_station(uuid,jsonb) to authenticated;

notify pgrst, 'reload schema';
