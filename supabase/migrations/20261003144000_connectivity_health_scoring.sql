-- Isolated connectivity incidents remain visible in Live Runtime Errors
-- but do not reduce the overall System Health score unless they recur.
create or replace function private.system_diagnostic_phase2_checks()
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $function$
declare
  v_checks jsonb:='[]'::jsonb;
  v_count bigint:=0;
  v_secondary bigint:=0;
begin
  select
    count(*) filter(
      where status not in ('ignored','resolved')
        and (
          error_type is distinct from 'connectivity_error'
          or event_count>=3
        )
    ),
    count(*) filter(
      where severity='critical'
        and status not in ('ignored','resolved')
    )
  into v_count,v_secondary
  from private.system_runtime_issues
  where last_seen>=now()-interval '24 hours';

  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'runtime.live_errors','runtime','Live Runtime Errors (24h)',
    case when v_secondary>0 then 'critical' when v_count>0 then 'warning' else 'healthy' end,
    case
      when v_secondary>0 then 'Critical browser/API failures were recorded during real LEOGO use.'
      when v_count>0 then 'Runtime warnings were recorded during real LEOGO use.'
      else 'No runtime errors have been recorded in the last 24 hours.'
    end,
    v_count::text||' active issue(s), including '||v_secondary::text||' critical issue(s).',
    'Open Live Runtime Errors, inspect the most repeated fingerprint and repair only the affected page/RPC/function. Then rerun the relevant workflow.',
    true
  ));

  select count(*) into v_count
  from public.seller_products p
  left join public.seller_accounts s on s.user_id=p.seller_id
  where p.listing_status='active'
    and (
      p.product_approval_status is distinct from 'approved'
      or s.user_id is null
      or s.application_status is distinct from 'approved'
    );

  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'products.customer_visibility_chain','products','Seller → Admin → Customer Product Chain',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'Active customer-facing products are backed by approved Sellers and Admin approval.' else 'An active product bypasses a required Seller/Admin approval state.' end,
    v_count::text||' active product(s) with a broken approval chain.',
    'Identify only the affected product IDs. Correct the listing/approval relationship without redesigning the locked Seller → Admin → Customer workflow.',
    true
  ));

  select
    (select count(*) from public.marketplace_product_reviews r where r.moderation_status='approved' and (r.reviewed_at is null or r.reviewed_by is null))
    +(select count(*) from public.marketplace_order_reviews r where r.moderation_status='approved' and (r.reviewed_at is null or r.reviewed_by is null))
    +(select count(*) from public.partner_service_reviews r where r.moderation_status='approved' and (r.reviewed_at is null or r.reviewed_by is null))
  into v_count;

  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'products.review_moderation_chain','products','Review → Admin Approval Chain',
    case when v_count=0 then 'healthy' else 'warning' end,
    case when v_count=0 then 'Approved product/order/service reviews have a recorded Admin review action.' else 'Approved reviews exist without complete moderation evidence.' end,
    v_count::text||' approved review(s) missing reviewer/time evidence.',
    'Repair the moderation record for the affected review and verify approved reviews are returned by the customer-facing review query.',
    false
  ));

  select
    (select count(*) from public.marketplace_orders o where o.order_status='with_rider' and not exists(select 1 from public.marketplace_delivery_jobs d where d.order_id=o.id))
    +(select count(*) from public.marketplace_orders o where o.order_status='delivered' and o.delivered_at is null)
    +(select count(*) from public.marketplace_seller_orders s where s.fulfilment_status='handed_to_rider' and s.handed_to_rider_at is null)
    +(select count(*) from public.marketplace_delivery_jobs d where d.status='delivered' and d.delivered_at is null)
  into v_count;

  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'orders.workflow_sequence','orders','Order → Seller → Rider Sequence',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'Stored order, Seller fulfilment and Rider timestamps agree with their workflow statuses.' else 'An order/delivery record is in a status that does not match its workflow evidence.' end,
    v_count::text||' sequencing inconsistency/inconsistencies.',
    'Open the affected order timeline and repair only the missing link/timestamp after confirming the real-world fulfilment state. Do not reset the whole order.',
    true
  ));

  select count(*) into v_count
  from public.pickup_station_parcels p
  where (p.status='received' and p.received_at is null)
     or (p.status='handed_over' and p.handed_over_at is null)
     or (p.status='arrived_pending_receipt' and p.arrived_at is null);

  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'transport.pickup_station_sequence','transport','Pickup Station Workflow Sequence',
    case when v_count=0 then 'healthy' else 'warning' end,
    case when v_count=0 then 'Pickup Station parcel statuses have their required event timestamps.' else 'Pickup Station parcel status and event history disagree.' end,
    v_count::text||' Pickup Station parcel(s) with incomplete sequence evidence.',
    'Reconcile only the affected parcel event from Rider/Station evidence before changing its status.',
    false
  ));

  select count(*) into v_count
  from public.service_requests r
  where (r.request_status='completed' and r.completed_at is null)
     or (r.request_status='in_progress' and r.started_at is null)
     or (r.request_status='quoted' and (r.quoted_at is null or r.provider_quote_kes is null));

  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'services.request_sequence','services','Service Request Workflow Sequence',
    case when v_count=0 then 'healthy' else 'warning' end,
    case when v_count=0 then 'Service Request statuses match quotation/start/completion evidence.' else 'A Service Request status is missing its expected workflow evidence.' end,
    v_count::text||' Service Request(s) with sequence mismatch.',
    'Inspect the affected request history and restore only the missing quotation/start/completion evidence before settlement.',
    false
  ));

  select count(*) into v_count
  from public.transport_requests r
  where (r.request_status='completed' and r.completed_at is null)
     or (r.request_status='in_transit' and r.in_transit_at is null)
     or (r.request_status='picked_up' and r.picked_up_at is null)
     or (r.request_status='quoted' and (r.quoted_at is null or r.provider_quote_kes is null));

  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'transport.request_sequence','transport','Transport Request Workflow Sequence',
    case when v_count=0 then 'healthy' else 'warning' end,
    case when v_count=0 then 'Transport Request statuses match quote/pickup/transit/completion evidence.' else 'A Transport Request status is missing expected workflow evidence.' end,
    v_count::text||' Transport Request(s) with sequence mismatch.',
    'Compare the affected request with Provider/customer history and correct only the missing transition evidence.',
    false
  ));

  select count(*) into v_count
  from public.wallet_deposit_requests d
  where d.request_status='confirmed'
    and not exists(
      select 1 from public.wallet_ledger_entries l where l.deposit_request_id=d.id
    );

  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'wallet.confirmed_deposit_ledger','wallet','Wallet Deposit → Ledger Chain',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'Confirmed Wallet deposits have matching immutable ledger entries.' else 'A confirmed Wallet deposit is missing its ledger entry.' end,
    v_count::text||' confirmed deposit(s) without ledger posting.',
    'Stop settlement on the affected Wallet account, verify the confirmed payment, then create only the missing ledger posting through the existing Wallet accounting function.',
    true
  ));

  select count(*) into v_count
  from public.premium_memberships m
  where m.membership_status='active'
    and (m.starts_at is null or m.ends_at is null or m.ends_at<=now());

  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'premium.membership_dates','premium','Premium Membership Date Integrity',
    case when v_count=0 then 'healthy' else 'warning' end,
    case when v_count=0 then 'Active Premium memberships have valid active date windows.' else 'An active Premium membership has an invalid or expired date window.' end,
    v_count::text||' active membership(s) with invalid dates.',
    'Reconcile only the affected subscription status against its approved payment and plan duration.',
    false
  ));

  select count(*) into v_count
  from public.accommodation_bookings b
  left join public.accommodation_properties p on p.id=b.property_id
  left join public.accommodation_units u on u.id=b.unit_id
  where p.id is null or u.id is null or u.property_id is distinct from b.property_id;

  v_checks:=v_checks||jsonb_build_array(private.system_diagnostic_check(
    'accommodation.booking_links','accommodation','Accommodation Booking Links',
    case when v_count=0 then 'healthy' else 'critical' end,
    case when v_count=0 then 'Bookings point to valid properties and matching units.' else 'A booking is detached from its property/unit relationship.' end,
    v_count::text||' booking(s) with invalid property/unit links.',
    'Restore the original booking snapshot relationship from the booking record; do not move unrelated bookings.',
    false
  ));

  return v_checks;
end;
$function$;


revoke execute on function private.system_diagnostic_phase2_checks()
  from public,anon,authenticated;

