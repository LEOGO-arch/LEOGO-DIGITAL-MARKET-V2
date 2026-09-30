-- LEOGO Admin Reports V1: one permission-gated read model over existing ledgers.
create or replace function public.admin_generate_report(
  p_report_code text,
  p_from date,
  p_to date,
  p_status text default null,
  p_search text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from timestamptz;
  v_to timestamptz;
  v_rows jsonb := '[]'::jsonb;
begin
  if not private.is_leogo_admin('reports.export') then
    raise exception 'Reports permission required';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 3660 then
    raise exception 'Choose a valid reporting period of no more than 10 years';
  end if;
  v_from := p_from::timestamp at time zone 'Africa/Nairobi';
  v_to := (p_to + 1)::timestamp at time zone 'Africa/Nairobi';

  case p_report_code
    when 'orders' then
      select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'date',o.created_at,'reference',o.order_reference,'customer',o.receiver_name,'phone',o.contact_number,'location',concat_ws(', ',o.estate,o.sub_county,o.county),'payment_method',o.payment_method,'payment_status',o.payment_status,'status',o.order_status,'items_subtotal_kes',o.items_subtotal_kes,'service_fee_kes',o.service_fee_kes,'delivery_fee_kes',o.delivery_fee_kes,'pickup_fee_kes',o.pickup_fee_kes,'total_kes',o.grand_total_kes) order by o.created_at desc),'[]'::jsonb) into v_rows
      from public.marketplace_orders o where o.created_at>=v_from and o.created_at<v_to;
    when 'sales_revenue' then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.date desc),'[]'::jsonb) into v_rows from (
        select o.id::text,o.created_at as date,'Marketplace order'::text as source,o.order_reference as reference,o.order_status as status,o.grand_total_kes as gross_kes,(o.service_fee_kes+o.delivery_fee_kes+o.pickup_fee_kes-coalesce((select sum(p.earnings_amount_kes) from public.pickup_station_parcels p where p.order_id=o.id and p.status='handed_over' and p.earning_source='delivery_fee'),0)) as leogo_revenue_kes,'Order fees less Pickup Station delivery payouts'::text as basis from public.marketplace_orders o where o.created_at>=v_from and o.created_at<v_to and o.order_status<>'cancelled'
        union all select p.id::text,p.coalesce_date,'Premium membership',p.reference,p.status,p.gross_kes,p.revenue_kes,'Confirmed membership payment' from (select id,coalesce(reviewed_at,submitted_at) coalesce_date,payment_reference reference,payment_status status,amount_kes gross_kes,amount_kes revenue_kes from public.premium_membership_payments where coalesce(reviewed_at,submitted_at)>=v_from and coalesce(reviewed_at,submitted_at)<v_to and payment_status in ('confirmed','approved')) p
        union all select b.id::text,b.created_at,'Accommodation',b.booking_reference,b.booking_status,b.customer_total_kes,b.leogo_revenue_kes,'Hotel commission plus customer service fee' from public.accommodation_bookings b where b.created_at>=v_from and b.created_at<v_to and b.booking_status<>'cancelled'
        union all select t.id::text,t.created_at,'Transport',t.request_reference,t.request_status,t.quote_customer_total_kes,coalesce(t.quote_partner_commission_kes,0)+coalesce(t.quote_customer_service_fee_kes,0),'Partner commission plus customer service fee' from public.transport_requests t where t.created_at>=v_from and t.created_at<v_to and t.request_status<>'cancelled'
        union all select s.id::text,s.created_at,'Service request',s.request_reference,s.request_status,coalesce(s.provider_quote_kes,0)+coalesce(s.quotation_fee_kes,0)+coalesce(s.direct_request_fee_kes,0),coalesce(s.quotation_fee_kes,0)+coalesce(s.direct_request_fee_kes,0),'Quotation and direct-request fees only' from public.service_requests s where s.created_at>=v_from and s.created_at<v_to and s.request_status<>'cancelled'
        union all select w.id::text,w.requested_at,'Wallet statement',w.id::text,'charged',w.fee_amount_kes,w.fee_amount_kes,'Statement download fee only (customer wallet balance excluded)' from public.wallet_statement_downloads w where w.requested_at>=v_from and w.requested_at<v_to
      ) x;
    when 'customers' then
      select coalesce(jsonb_agg(jsonb_build_object('id',c.user_id,'date',c.created_at,'customer',c.full_name,'phone',c.phone,'location',concat_ws(', ',c.estate,c.sub_county,c.county),'status','registered') order by c.created_at desc),'[]'::jsonb) into v_rows from public.customer_profiles c where c.created_at>=v_from and c.created_at<v_to;
    when 'products' then
      select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'date',p.created_at,'product',p.product_name,'seller',s.business_name,'category',c.name,'price_kes',p.price_kes,'quantity',p.quantity_available,'availability',p.availability_status,'status',p.product_approval_status) order by p.created_at desc),'[]'::jsonb) into v_rows from public.seller_products p left join public.seller_accounts s on s.user_id=p.seller_id left join public.product_categories c on c.id=p.category_id where p.created_at>=v_from and p.created_at<v_to;
    when 'sellers' then
      select coalesce(jsonb_agg(jsonb_build_object('id',s.user_id,'date',s.created_at,'business',s.business_name,'owner',s.owner_name,'phone',s.phone,'location',concat_ws(', ',s.town,s.sub_county,s.county),'status',s.application_status,'approved_at',s.approved_at) order by s.created_at desc),'[]'::jsonb) into v_rows from public.seller_accounts s where s.created_at>=v_from and s.created_at<v_to;
    when 'service_providers' then
      select coalesce(jsonb_agg(jsonb_build_object('id',s.user_id,'date',s.created_at,'business',s.business_name,'owner',s.owner_name,'phone',s.phone,'category',coalesce(s.primary_service,s.service_category),'location',concat_ws(', ',s.location_details,s.town,s.sub_county,s.county),'availability',s.availability_status,'status',s.application_status) order by s.created_at desc),'[]'::jsonb) into v_rows from public.service_provider_accounts s where s.created_at>=v_from and s.created_at<v_to;
    when 'service_requests' then
      select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'date',r.created_at,'reference',r.request_reference,'provider',p.business_name,'type',r.request_type,'location',coalesce(r.location_description,r.service_location),'payment_status',r.payment_status,'status',r.request_status,'quotation_fee_kes',r.quotation_fee_kes,'direct_fee_kes',r.direct_request_fee_kes,'provider_quote_kes',r.provider_quote_kes,'provider_labour_kes',r.provider_labour_kes) order by r.created_at desc),'[]'::jsonb) into v_rows from public.service_requests r left join public.service_provider_accounts p on p.user_id=r.provider_id where r.created_at>=v_from and r.created_at<v_to;
    when 'transport' then
      select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'date',r.created_at,'reference',r.request_reference,'service_type',r.service_type,'provider',p.business_name,'route',concat_ws(' → ',r.pickup_location,r.destination_location),'status',r.request_status,'provider_quote_kes',r.provider_quote_kes,'customer_total_kes',r.quote_customer_total_kes,'leogo_commission_kes',r.quote_partner_commission_kes,'service_fee_kes',r.quote_customer_service_fee_kes,'partner_net_kes',r.quote_partner_net_kes) order by r.created_at desc),'[]'::jsonb) into v_rows from public.transport_requests r left join public.transport_provider_accounts p on p.user_id=coalesce(r.assigned_provider_id,r.requested_provider_id) where r.created_at>=v_from and r.created_at<v_to;
    when 'deliveries' then
      select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'date',coalesce(d.assigned_at,o.created_at),'reference',o.order_reference,'customer',o.receiver_name,'rider_id',d.rider_id,'destination',concat_ws(', ',o.estate,o.sub_county,o.county),'status',d.status,'assigned_at',d.assigned_at,'picked_up_at',d.picked_up_at,'delivered_at',d.delivered_at) order by coalesce(d.assigned_at,o.created_at) desc),'[]'::jsonb) into v_rows from public.marketplace_delivery_jobs d join public.marketplace_orders o on o.id=d.order_id where coalesce(d.assigned_at,o.created_at)>=v_from and coalesce(d.assigned_at,o.created_at)<v_to;
    when 'pickup_stations' then
      select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'date',s.created_at,'station',s.station_name,'location',concat_ws(', ',s.address_line,s.town,s.sub_county,s.county),'contact',s.contact_phone,'service_fee_percent',s.service_fee_percent,'shipping_fee_kes',s.shipping_fee_kes,'parcels',(select count(*) from public.pickup_station_parcels p where p.pickup_station_id=s.id),'earnings_kes',(select coalesce(sum(p.earnings_amount_kes),0) from public.pickup_station_parcels p where p.pickup_station_id=s.id and p.status='handed_over'),'status',case when s.is_active then 'active' else 'inactive' end) order by s.created_at desc),'[]'::jsonb) into v_rows from public.pickup_stations s where s.created_at>=v_from and s.created_at<v_to;
    when 'wallet' then
      select coalesce(jsonb_agg(jsonb_build_object('id',a.user_id,'date',a.opened_at,'customer',c.full_name,'phone',c.phone,'status',a.account_status,'confirmed_balance_kes',coalesce((select sum(case when l.direction='credit' then l.amount_kes else -l.amount_kes end) from public.wallet_ledger_entries l where l.user_id=a.user_id),0),'deposits_kes',coalesce((select sum(d.requested_amount_kes) from public.wallet_deposit_requests d where d.user_id=a.user_id and d.request_status='confirmed'),0),'withdrawals_kes',coalesce((select sum(w.requested_amount_kes) from public.wallet_withdrawal_requests w where w.user_id=a.user_id and w.request_status='completed'),0)) order by a.opened_at desc),'[]'::jsonb) into v_rows from public.wallet_accounts a left join public.customer_profiles c on c.user_id=a.user_id where a.opened_at>=v_from and a.opened_at<v_to;
    when 'deposits' then
      select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'date',d.submitted_at,'customer',c.full_name,'kind',d.deposit_kind,'amount_kes',d.requested_amount_kes,'reference',d.payment_reference,'status',d.request_status,'reviewed_at',d.reviewed_at) order by d.submitted_at desc),'[]'::jsonb) into v_rows from public.wallet_deposit_requests d left join public.customer_profiles c on c.user_id=d.user_id where d.submitted_at>=v_from and d.submitted_at<v_to;
    when 'withdrawals' then
      select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'date',w.submitted_at,'customer',c.full_name,'amount_kes',w.requested_amount_kes,'method',w.settlement_method,'account',concat_ws(' · ',w.account_name,w.account_number),'status',w.request_status,'settlement_reference',w.settlement_reference,'completed_at',w.completed_at) order by w.submitted_at desc),'[]'::jsonb) into v_rows from public.wallet_withdrawal_requests w left join public.customer_profiles c on c.user_id=w.user_id where w.submitted_at>=v_from and w.submitted_at<v_to;
    when 'savings' then
      select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'date',c.created_at,'customer',p.full_name,'daily_amount_kes',c.daily_amount_kes,'start_date',c.start_date,'end_date',c.end_date,'period_days',c.period_days,'target_kes',c.daily_amount_kes*c.period_days,'status',c.challenge_status) order by c.created_at desc),'[]'::jsonb) into v_rows from public.wallet_challenges c left join public.customer_profiles p on p.user_id=c.user_id where c.created_at>=v_from and c.created_at<v_to;
    when 'loans' then
      select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'date',l.submitted_at,'customer',c.full_name,'amount_kes',l.requested_amount_kes,'purpose',l.purpose,'wallet_balance_kes',l.confirmed_balance_at_application,'saved_kes',l.total_saved_at_application,'saving_days',l.confirmed_saving_days_at_application,'status',l.application_status,'reviewed_at',l.reviewed_at) order by l.submitted_at desc),'[]'::jsonb) into v_rows from public.wallet_loan_applications l left join public.customer_profiles c on c.user_id=l.user_id where l.submitted_at>=v_from and l.submitted_at<v_to;
    when 'premium' then
      select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'date',p.submitted_at,'customer',c.full_name,'plan',p.plan_name,'amount_kes',p.amount_kes,'duration_hours',p.duration_hours,'reference',p.payment_reference,'status',p.payment_status,'membership_status',m.membership_status,'ends_at',m.ends_at) order by p.submitted_at desc),'[]'::jsonb) into v_rows from public.premium_membership_payments p left join public.customer_profiles c on c.user_id=p.user_id left join public.premium_memberships m on m.user_id=p.user_id where p.submitted_at>=v_from and p.submitted_at<v_to;
    when 'accommodation' then
      select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'date',b.created_at,'reference',b.booking_reference,'guest',b.guest_name,'property',b.property_name_snapshot,'unit',b.unit_name_snapshot,'stay',concat(b.check_in,' → ',b.check_out),'nights',b.nights,'status',b.booking_status,'customer_total_kes',b.customer_total_kes,'hotel_commission_kes',b.hotel_commission_kes,'service_fee_kes',b.customer_service_fee_kes,'leogo_revenue_kes',b.leogo_revenue_kes,'hotel_net_kes',b.hotel_net_amount_kes) order by b.created_at desc),'[]'::jsonb) into v_rows from public.accommodation_bookings b where b.created_at>=v_from and b.created_at<v_to;
    when 'payments' then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.date desc),'[]'::jsonb) into v_rows from (
        select o.id::text,o.created_at as date,'Marketplace'::text as module,o.order_reference as reference,o.receiver_name as party,o.grand_total_kes as amount_kes,o.payment_method as method,o.payment_status as status from public.marketplace_orders o where o.created_at>=v_from and o.created_at<v_to
        union all select p.id::text,p.submitted_at,'Premium',p.payment_reference,c.full_name,p.amount_kes,'Account payment',p.payment_status from public.premium_membership_payments p left join public.customer_profiles c on c.user_id=p.user_id where p.submitted_at>=v_from and p.submitted_at<v_to
        union all select b.id::text,b.created_at,'Accommodation',b.booking_reference,b.guest_name,b.customer_total_kes,'Booking payment',b.booking_status from public.accommodation_bookings b where b.created_at>=v_from and b.created_at<v_to
        union all select c.id::text,c.created_at,'Cyber',c.order_reference,c.item_name,c.total_kes,'Order payment',c.payment_status from public.cyber_orders c where c.created_at>=v_from and c.created_at<v_to
      ) x;
    when 'settlements' then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.date desc),'[]'::jsonb) into v_rows from (
        select s.id::text,s.created_at as date,'Seller'::text as partner_type,a.business_name as partner,s.amount_kes,s.settlement_reference as reference,s.status,s.paid_at from public.seller_settlements s left join public.seller_accounts a on a.user_id=s.seller_id where s.created_at>=v_from and s.created_at<v_to
        union all select s.id::text,s.created_at,'Service Provider',a.business_name,s.amount_kes,s.settlement_reference,s.status,s.paid_at from public.service_provider_settlements s left join public.service_provider_accounts a on a.user_id=s.provider_id where s.created_at>=v_from and s.created_at<v_to
        union all select s.id::text,s.created_at,'Transport Provider',a.business_name,s.amount_kes,s.settlement_reference,s.status,s.paid_at from public.transport_provider_settlements s left join public.transport_provider_accounts a on a.user_id=s.provider_id where s.created_at>=v_from and s.created_at<v_to
        union all select r.id::text,r.submitted_at,'Seller request',a.business_name,r.requested_amount_kes,r.id::text,r.status,null::timestamptz from public.seller_settlement_requests r left join public.seller_accounts a on a.user_id=r.seller_id where r.submitted_at>=v_from and r.submitted_at<v_to
        union all select r.id::text,r.submitted_at,'Service Provider request',a.business_name,r.requested_amount_kes,r.id::text,r.status,null::timestamptz from public.service_provider_settlement_requests r left join public.service_provider_accounts a on a.user_id=r.provider_id where r.submitted_at>=v_from and r.submitted_at<v_to
        union all select r.id::text,r.submitted_at,'Transport Provider request',a.business_name,r.requested_amount_kes,r.id::text,r.status,null::timestamptz from public.transport_provider_settlement_requests r left join public.transport_provider_accounts a on a.user_id=r.provider_id where r.submitted_at>=v_from and r.submitted_at<v_to
        union all select r.id::text,r.submitted_at,'Pickup Station request',s.station_name,r.requested_amount_kes,r.id::text,r.status,r.paid_at from public.pickup_station_withdrawal_requests r left join public.pickup_stations s on s.id=r.pickup_station_id where r.submitted_at>=v_from and r.submitted_at<v_to
      ) x;
    when 'loyalty' then
      select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'date',r.credited_at,'customer',c.full_name,'reference',r.order_reference,'eligible_subtotal_kes',r.eligible_subtotal_kes,'reward_rate',r.reward_rate,'reward_amount_kes',r.reward_amount_kes,'status','credited') order by r.credited_at desc),'[]'::jsonb) into v_rows from public.wallet_shopping_rewards r left join public.customer_profiles c on c.user_id=r.user_id where r.credited_at>=v_from and r.credited_at<v_to;
    when 'approvals' then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.date desc),'[]'::jsonb) into v_rows from (
        select s.user_id::text as id,s.submitted_at as date,'Seller application'::text as type,s.business_name as applicant,s.phone,''::text as amount_or_detail,s.application_status as status from public.seller_accounts s where s.submitted_at>=v_from and s.submitted_at<v_to
        union all select p.user_id::text,p.submitted_at,'Service Provider application',p.business_name,p.phone,p.primary_service,p.application_status from public.service_provider_accounts p where p.submitted_at>=v_from and p.submitted_at<v_to
        union all select t.user_id::text,t.submitted_at,'Transport Provider application',t.business_name,t.phone,concat_ws(', ',t.provider_type,array_to_string(t.services_offered,', ')),t.application_status from public.transport_provider_accounts t where t.submitted_at>=v_from and t.submitted_at<v_to
        union all select d.id::text,d.submitted_at,'Wallet deposit',c.full_name,c.phone,d.requested_amount_kes::text,d.request_status from public.wallet_deposit_requests d left join public.customer_profiles c on c.user_id=d.user_id where d.submitted_at>=v_from and d.submitted_at<v_to
        union all select l.id::text,l.submitted_at,'Wallet loan',c.full_name,c.phone,l.requested_amount_kes::text,l.application_status from public.wallet_loan_applications l left join public.customer_profiles c on c.user_id=l.user_id where l.submitted_at>=v_from and l.submitted_at<v_to
      ) x;
    when 'admin_activity' then
      select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'date',a.created_at,'admin',coalesce(a.actor_email,'System'),'action',a.action,'entity_type',a.entity_type,'reference',a.entity_id,'status','recorded') order by a.created_at desc),'[]'::jsonb) into v_rows from public.admin_audit_log a where a.created_at>=v_from and a.created_at<v_to;
    when 'cyber' then
      select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'date',o.created_at,'reference',o.order_reference,'item_type',o.item_type,'item',o.item_name,'quantity',o.quantity,'fulfilment',o.fulfilment_method,'payment_status',o.payment_status,'status',o.order_status,'subtotal_kes',o.subtotal_kes,'delivery_fee_kes',o.delivery_fee_kes,'total_kes',o.total_kes) order by o.created_at desc),'[]'::jsonb) into v_rows from public.cyber_orders o where o.created_at>=v_from and o.created_at<v_to;
    when 'advertisements' then
      select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'date',a.created_at,'title',a.title,'starts_at',a.starts_at,'ends_at',a.ends_at,'published_at',a.published_at,'status',a.status,'popup',a.popup_on_entry) order by a.created_at desc),'[]'::jsonb) into v_rows from public.advertisements a where a.created_at>=v_from and a.created_at<v_to;
    else raise exception 'Unknown report code';
  end case;

  select coalesce(jsonb_agg(e.value),'[]'::jsonb) into v_rows
  from jsonb_array_elements(v_rows) e(value)
  where (nullif(trim(p_status),'') is null or lower(coalesce(e.value->>'status',''))=lower(trim(p_status)))
    and (nullif(trim(p_search),'') is null or e.value::text ilike '%'||trim(p_search)||'%');

  return jsonb_build_object('report_code',p_report_code,'from',p_from,'to',p_to,'generated_at',now(),'record_count',jsonb_array_length(v_rows),'records',v_rows);
end;
$$;

revoke all on function public.admin_generate_report(text,date,date,text,text) from public;
revoke all on function public.admin_generate_report(text,date,date,text,text) from anon;
grant execute on function public.admin_generate_report(text,date,date,text,text) to authenticated;
