-- Canonical isolated-staging aftersales return schema (three new tables).
-- No existing marketplace/order/wallet rows are altered.
create table if not exists public.aftersales_seller_inspections (
 case_id uuid primary key references public.marketplace_aftersales_cases(id) on delete restrict,
 seller_id uuid not null references auth.users(id),
 received_at timestamptz,
 received_condition text,
 inspected_at timestamptz,
 finding text check(finding in ('seller_liability','customer_damage','undetermined')),
 recommendation text check(recommendation in ('refund','exchange','replacement','reject')),
 inspection_notes text,
 ready_return_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.aftersales_return_transport_events (
 id uuid primary key default gen_random_uuid(),
 return_parcel_id uuid not null references public.pickup_station_return_parcels(id) on delete restrict,
 aftersales_case_id uuid not null references public.marketplace_aftersales_cases(id) on delete restrict,
 step text not null check(step in ('station_dispatched_to_sorting','sorting_received','sorting_dispatched_to_seller','station_dispatched_to_seller')),
 notes text not null,
 actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(return_parcel_id,step)
);
create table if not exists public.aftersales_return_shipping (
 case_id uuid primary key references public.marketplace_aftersales_cases(id) on delete restrict,
 customer_id uuid not null references auth.users(id),
 amount_kes numeric(12,2) not null check(amount_kes>0),
 status text not null default 'awaiting_payment' check(status in ('awaiting_payment','payment_submitted','verified','payment_rejected','expired','dispatched','received_by_customer')),
 payment_reference text,
 payment_submitted_at timestamptz,
 verified_by uuid,
 verified_at timestamptz,
 verification_notes text,
 issued_at timestamptz not null default now(),
 due_at timestamptz not null,
 dispatch_reference text,
 dispatched_at timestamptz,
 received_at timestamptz,
 created_by uuid not null,
 updated_at timestamptz not null default now()
);
create unique index if not exists aftersales_return_shipping_payment_ref_unique
on public.aftersales_return_shipping (lower(btrim(payment_reference)))
where payment_reference is not null and status in ('payment_submitted','verified','dispatched','received_by_customer');
alter table public.aftersales_seller_inspections enable row level security;
alter table public.aftersales_return_transport_events enable row level security;
alter table public.aftersales_return_shipping enable row level security;
revoke all on public.aftersales_seller_inspections,public.aftersales_return_transport_events,public.aftersales_return_shipping from anon,authenticated;

-- Canonical RPC bodies already exercised in isolated staging. Access decisions remain in SECURITY DEFINER bodies.
CREATE OR REPLACE FUNCTION public.admin_aftersales_close_rejected_return(p_case_id uuid, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_status text;v_customer uuid;
begin
 if not private.is_leogo_admin('orders.manage') then raise exception 'Aftersales closure permission required';end if;
 if length(btrim(coalesce(p_note,'')))<5 then raise exception 'Closure reason required';end if;
 select r.status,r.customer_id into v_status,v_customer
 from public.aftersales_return_shipping r
 join public.marketplace_aftersales_negotiations n on n.case_id=r.case_id
 where r.case_id=p_case_id and n.stage='seller_rejected' for update of r;
 if v_status is null then raise exception 'Case is not eligible for rejection closure or intervention is pending';end if;
 if v_status in ('awaiting_payment','payment_rejected') and exists(select 1 from public.aftersales_return_shipping where case_id=p_case_id and due_at<clock_timestamp()) then
  update public.aftersales_return_shipping set status='expired',updated_at=now() where case_id=p_case_id;
  v_status='expired';
 end if;
 if v_status not in ('expired','received_by_customer') then
   raise exception 'Close only after customer receives returned product or 7-day unpaid return fee expires';end if;
 update public.marketplace_aftersales_negotiations set stage='closed',admin_comment=btrim(p_note),updated_at=now()
 where case_id=p_case_id;
 update public.marketplace_aftersales_cases set status='rejected',admin_notes=btrim(p_note),updated_at=now()
 where id=p_case_id;
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(p_case_id,(select auth.uid()),'admin','closed_'||v_status,left(btrim(p_note),2000));
 insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view)
 values(v_customer,'aftersales','Aftersales case closed',
 'LEOGO closed this aftersales case. Reason: '||left(btrim(p_note),700),
 'marketplace_aftersales_case',p_case_id,'aftersales_rejection_closed','aftersales');
 return jsonb_build_object('ok',true,'status','closed','reason',v_status);
end;$function$;
revoke all on function public.admin_aftersales_close_rejected_return(p_case_id uuid, p_note text) from public,anon;
grant execute on function public.admin_aftersales_close_rejected_return(p_case_id uuid, p_note text) to authenticated;
CREATE OR REPLACE FUNCTION public.admin_aftersales_dispatch_customer_return(p_case_id uuid, p_tracking_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_customer uuid;
begin
 if not private.is_leogo_admin('delivery.manage') then raise exception 'Delivery management permission required';end if;
 if length(btrim(coalesce(p_tracking_reference,'')))<5 then raise exception 'Provide return dispatch tracking reference';end if;
 update public.aftersales_return_shipping set status='dispatched',
 dispatch_reference=btrim(p_tracking_reference),dispatched_at=now(),updated_at=now()
 where case_id=p_case_id and status='verified'
 and exists(select 1 from public.marketplace_aftersales_negotiations n where n.case_id=p_case_id and n.stage='seller_rejected')
 returning customer_id into v_customer;
 if v_customer is null then raise exception 'Payment must be verified before return dispatch';end if;
 insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view)
 values(v_customer,'aftersales','Your rejected item is on its way',
 'Return tracking: '||btrim(p_tracking_reference)||'. Please confirm when you receive your item.',
 'marketplace_aftersales_case',p_case_id,'aftersales_customer_return_dispatched','aftersales');
 return jsonb_build_object('ok',true,'status','dispatched');
end;$function$;
revoke all on function public.admin_aftersales_dispatch_customer_return(p_case_id uuid, p_tracking_reference text) from public,anon;
grant execute on function public.admin_aftersales_dispatch_customer_return(p_case_id uuid, p_tracking_reference text) to authenticated;
CREATE OR REPLACE FUNCTION public.admin_aftersales_issue_return_shipping(p_case_id uuid, p_amount_kes numeric, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_customer uuid;v_ref text;
begin
 if not private.is_leogo_admin('orders.manage') then raise exception 'Admin return management required';end if;
 if p_amount_kes is null or p_amount_kes<=0 or p_amount_kes>100000 then raise exception 'Enter a valid return shipping fee';end if;
 if length(btrim(coalesce(p_note,'')))<5 then raise exception 'Document return shipping calculation';end if;
 select c.customer_id,c.case_reference into v_customer,v_ref
 from public.marketplace_aftersales_cases c
 join public.marketplace_aftersales_negotiations n on n.case_id=c.id
 join public.aftersales_seller_inspections i on i.case_id=c.id
 where c.id=p_case_id and n.stage='seller_rejected' and i.recommendation='reject'
 and i.ready_return_at is not null;
 if v_customer is null then raise exception 'Seller must inspect, reject and repack the product before setting return fee';end if;
 insert into public.aftersales_return_shipping(case_id,customer_id,amount_kes,due_at,created_by,verification_notes)
 values(p_case_id,v_customer,p_amount_kes,now()+interval '7 days',(select auth.uid()),left(btrim(p_note),2000));
 insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view)
 values(v_customer,'aftersales','Return shipping fee due',
 'Case '||v_ref||': Pay KSh '||p_amount_kes||' return shipping within 7 days using the LEOGO account shown in your Aftersales page.',
 'marketplace_aftersales_case',p_case_id,'aftersales_return_fee_issued','aftersales');
 return jsonb_build_object('ok',true,'case_id',p_case_id,'fee_kes',p_amount_kes,'due_at',now()+interval '7 days');
end;$function$;
revoke all on function public.admin_aftersales_issue_return_shipping(p_case_id uuid, p_amount_kes numeric, p_note text) from public,anon;
grant execute on function public.admin_aftersales_issue_return_shipping(p_case_id uuid, p_amount_kes numeric, p_note text) to authenticated;
CREATE OR REPLACE FUNCTION public.admin_aftersales_refund_action(p_case_id uuid, p_action text, p_note text DEFAULT NULL::text, p_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_case public.marketplace_aftersales_cases%rowtype; v_n public.marketplace_aftersales_negotiations%rowtype;
 v_return public.pickup_station_return_parcels%rowtype; v_amount numeric; v_review public.aftersales_refund_reviews%rowtype;
begin
 if not private.is_leogo_admin('settlements.manage') then raise exception 'Settlement management authorization required'; end if;
 if p_action not in ('approve_inspection','reject_inspection','record_payment_pending','record_payment_paid') then raise exception 'Invalid action'; end if;
 if length(coalesce(p_note,''))>2000 then raise exception 'Note too long'; end if;
 select * into v_case from public.marketplace_aftersales_cases where id=p_case_id for update;
 if not found then raise exception 'Case not found'; end if;
 select * into v_n from public.marketplace_aftersales_negotiations where case_id=p_case_id;
 if v_n.stage<>'customer_accepted' or v_n.solution_kind<>'return_refund' then raise exception 'Customer must accept a seller return/refund solution'; end if;
 if v_case.order_item_id is null or v_case.requested_refund_amount_kes is null then raise exception 'Item and refund amount must be recorded'; end if;
 select i.line_total_kes into v_amount from public.marketplace_order_items i where id=v_case.order_item_id and i.order_id=v_case.order_id;
 if not found or v_case.requested_refund_amount_kes<=0 or v_case.requested_refund_amount_kes>v_amount then
  raise exception 'Refund must not exceed purchased item price excluding shipping'; end if;
 select * into v_return from public.pickup_station_return_parcels where aftersales_case_id=p_case_id;
 if not found or v_return.status not in ('received_at_station','dispatched','completed') then
  raise exception 'Physical return receipt must be verified in Pickup Station returns first'; end if;
 insert into public.aftersales_refund_reviews(case_id,amount_kes)
 values(p_case_id,v_case.requested_refund_amount_kes)
 on conflict(case_id) do nothing;
 select * into v_review from public.aftersales_refund_reviews where case_id=p_case_id for update;
 if v_review.status='paid' then raise exception 'Refund already recorded as paid'; end if;
 if p_action='approve_inspection' then
  if not exists(
    select 1 from public.aftersales_seller_inspections i
    where i.case_id=p_case_id and i.received_at is not null and i.inspected_at is not null
      and i.recommendation='refund' and i.finding='seller_liability'
  ) then
    raise exception 'Assigned seller must physically receive and inspect the product, confirm seller liability, and recommend refund before Admin approval';
  end if;
  if v_review.status not in ('awaiting_inspection','inspection_rejected') then raise exception 'Inspection already processed'; end if;
  if length(btrim(coalesce(p_note,'')))<5 then raise exception 'Inspection notes are required'; end if;
  update public.aftersales_refund_reviews set status='inspection_approved',inspection_note=btrim(p_note),
    inspection_by=auth.uid(),inspection_at=now(),updated_at=now() where case_id=p_case_id;
 elsif p_action='reject_inspection' then
  if v_review.status not in ('awaiting_inspection','inspection_approved') then raise exception 'Inspection cannot be rejected at this stage'; end if;
  if length(btrim(coalesce(p_note,'')))<5 then raise exception 'Reason required'; end if;
  update public.aftersales_refund_reviews set status='inspection_rejected',inspection_note=btrim(p_note),
    inspection_by=auth.uid(),inspection_at=now(),updated_at=now() where case_id=p_case_id;
 elsif p_action='record_payment_pending' then
  if v_review.status<>'inspection_approved' then raise exception 'Inspection approval required'; end if;
  update public.aftersales_refund_reviews set status='payment_pending',payment_note=nullif(btrim(p_note),''),
    updated_at=now() where case_id=p_case_id;
 else
  if v_review.status<>'payment_pending' then raise exception 'Refund must be approved and marked payment pending first'; end if;
  if length(btrim(coalesce(p_reference,'')))<3 then raise exception 'External payment reference required'; end if;
  update public.aftersales_refund_reviews set status='paid',payment_reference=btrim(p_reference),
    payment_note=nullif(btrim(p_note),''),paid_by=auth.uid(),paid_at=now(),updated_at=now() where case_id=p_case_id;
  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view)
   values(v_case.customer_id,'aftersales','Aftersales refund recorded',
    'LEOGO has recorded the refund for case '||v_case.case_reference||'. Reference: '||btrim(p_reference)||'.',
    'marketplace_aftersales_case',p_case_id,'aftersales_refund_paid','aftersales');
 end if;
 return (select to_jsonb(r) from public.aftersales_refund_reviews r where r.case_id=p_case_id);
end;$function$;
revoke all on function public.admin_aftersales_refund_action(p_case_id uuid, p_action text, p_note text, p_reference text) from public,anon;
grant execute on function public.admin_aftersales_refund_action(p_case_id uuid, p_action text, p_note text, p_reference text) to authenticated;
CREATE OR REPLACE FUNCTION public.admin_aftersales_return_shipping_list()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select case when private.is_leogo_admin('orders.manage') then
   coalesce(jsonb_agg(to_jsonb(r) order by r.issued_at desc),'[]'::jsonb)
  else '[]'::jsonb end
 from public.aftersales_return_shipping r
$function$;
revoke all on function public.admin_aftersales_return_shipping_list() from public,anon;
grant execute on function public.admin_aftersales_return_shipping_list() to authenticated;
CREATE OR REPLACE FUNCTION public.admin_aftersales_route_return(p_return_id uuid, p_step text, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.pickup_station_return_parcels%rowtype;v_last text;
begin
 if not private.is_leogo_admin('delivery.manage') then raise exception 'Delivery management permission required';end if;
 if length(btrim(coalesce(p_notes,'')))<5 or length(p_notes)>1000 then raise exception 'Provide physical handover notes (5-1000 characters)';end if;
 if p_step not in ('station_dispatched_to_sorting','sorting_received','sorting_dispatched_to_seller','station_dispatched_to_seller') then
   raise exception 'Unsupported physical parcel movement';end if;
 select * into v from public.pickup_station_return_parcels where id=p_return_id and aftersales_case_id is not null for update;
 if not found then raise exception 'Aftersales return not found';end if;
 select step into v_last from public.aftersales_return_transport_events
 where return_parcel_id=p_return_id order by created_at desc,id desc limit 1;
 if p_step in ('station_dispatched_to_sorting','station_dispatched_to_seller') then
   if v.status<>'received_at_station' or v_last is not null then
     raise exception 'Pickup Station must physically receive the return before first dispatch';end if;
   perform public.admin_update_pickup_return_status(v.id,'dispatched',p_notes);
 elsif p_step='sorting_received' then
   if v_last<>'station_dispatched_to_sorting' or v.status<>'dispatched' then
     raise exception 'Return must be dispatched to the sorting center first';end if;
 elsif p_step='sorting_dispatched_to_seller' then
   if v_last<>'sorting_received' or v.status<>'dispatched' then
     raise exception 'Sorting Center must first confirm physical receipt';end if;
 end if;
 insert into public.aftersales_return_transport_events(return_parcel_id,aftersales_case_id,step,notes,actor_id)
 values(v.id,v.aftersales_case_id,p_step,btrim(p_notes),(select auth.uid()));
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(v.aftersales_case_id,(select auth.uid()),'admin','return_'||p_step,left(p_notes,1000));
 return jsonb_build_object('ok',true,'case_id',v.aftersales_case_id,'return_reference',v.return_reference,'route_step',p_step);
end;$function$;
revoke all on function public.admin_aftersales_route_return(p_return_id uuid, p_step text, p_notes text) from public,anon;
grant execute on function public.admin_aftersales_route_return(p_return_id uuid, p_step text, p_notes text) to authenticated;
CREATE OR REPLACE FUNCTION public.admin_aftersales_verify_return_shipping_payment(p_case_id uuid, p_approve boolean, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_customer uuid;v_status text;
begin
 if not private.is_leogo_admin('orders.payment_verify') then raise exception 'Payment verification permission required';end if;
 if length(btrim(coalesce(p_note,'')))<5 then raise exception 'Verification notes required';end if;
 update public.aftersales_return_shipping set status=case when p_approve then 'verified' else 'payment_rejected' end,
 verified_by=(select auth.uid()),verified_at=now(),verification_notes=btrim(p_note),updated_at=now()
 where case_id=p_case_id and status='payment_submitted'
 returning customer_id,status into v_customer,v_status;
 if v_customer is null then raise exception 'No pending return shipping proof';end if;
 insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view)
 values(v_customer,'aftersales','Return shipping payment updated',
 'LEOGO marked your return shipping payment as '||v_status||'.',
 'marketplace_aftersales_case',p_case_id,'aftersales_return_fee_'||v_status,'aftersales');
 return jsonb_build_object('ok',true,'status',v_status);
end;$function$;
revoke all on function public.admin_aftersales_verify_return_shipping_payment(p_case_id uuid, p_approve boolean, p_note text) from public,anon;
grant execute on function public.admin_aftersales_verify_return_shipping_payment(p_case_id uuid, p_approve boolean, p_note text) to authenticated;
CREATE OR REPLACE FUNCTION public.aftersales_customer_respond(p_case_id uuid, p_action text, p_comment text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.marketplace_aftersales_negotiations%rowtype;
begin
 select n.* into v from public.marketplace_aftersales_negotiations n
 join public.marketplace_aftersales_cases c on c.id=n.case_id
 where n.case_id=p_case_id and c.customer_id=auth.uid() for update of n;
 if not found then raise exception 'Case not found for customer'; end if;
 if v.stage='seller_proposed' and p_action in ('accept','reject','intervene') and (v.response_due_at is null or clock_timestamp()>v.response_due_at) then
    raise exception 'Three-day response period expired. Contact LEOGO Customer Care for assistance';
 end if;
 if p_action='accept' and v.stage<>'seller_proposed' then raise exception 'No seller solution awaiting acceptance'; end if;
 if p_action='reject' and v.stage<>'seller_proposed' then raise exception 'No seller solution awaiting rejection'; end if;
 if p_action='intervene' and v.stage not in ('seller_proposed','seller_rejected','customer_rejected') then raise exception 'Intervention is not available at this stage'; end if;
 if p_action not in ('accept','reject','intervene') then raise exception 'Unsupported customer action'; end if;
 if char_length(coalesce(p_comment,''))>2000 then raise exception 'Comment too long'; end if;
 update public.marketplace_aftersales_negotiations set
 stage=case p_action when 'accept' then 'customer_accepted' when 'reject' then 'customer_rejected' else 'intervention_requested' end,
 customer_comment=nullif(btrim(p_comment),''),updated_at=now() where case_id=p_case_id;
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(p_case_id,auth.uid(),'customer',p_action,nullif(btrim(p_comment),''));
 return jsonb_build_object('ok',true,'case_id',p_case_id);
end;$function$;
revoke all on function public.aftersales_customer_respond(p_case_id uuid, p_action text, p_comment text) from public,anon;
grant execute on function public.aftersales_customer_respond(p_case_id uuid, p_action text, p_comment text) to authenticated;
CREATE OR REPLACE FUNCTION public.aftersales_customer_return_shipping_status()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)
 from public.aftersales_return_shipping r where r.customer_id=(select auth.uid())
$function$;
revoke all on function public.aftersales_customer_return_shipping_status() from public,anon;
grant execute on function public.aftersales_customer_return_shipping_status() to authenticated;
CREATE OR REPLACE FUNCTION public.aftersales_list_negotiations()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at desc),'[]'::jsonb) from (
 select n.*,c.customer_id,c.order_id,c.case_reference,c.issue_type,c.details,c.preferred_solution,
  c.requested_refund_amount_kes,c.return_pickup_station_id,c.evidence_path,c.created_at as complaint_created_at,
  o.order_reference,
  i.product_name,
  coalesce((select jsonb_agg(jsonb_build_object('step',rte.step,'notes',rte.notes,'created_at',rte.created_at)
       order by rte.created_at,rte.id)
     from public.aftersales_return_transport_events rte where rte.aftersales_case_id=c.id),'[]'::jsonb) as route_events,
  (select to_jsonb(a) from public.aftersales_seller_inspections a where a.case_id=c.id) as inspection,
  (select jsonb_build_object('id',r.id,'return_reference',r.return_reference,'status',r.status,
      'booked_at',r.booked_at,'dispatched_at',r.dispatched_at,'updated_at',r.updated_at,
      'item_description',r.item_description,'return_reason',r.return_reason,
      'pickup_station_id',r.pickup_station_id)
   from public.pickup_station_return_parcels r
   where r.aftersales_case_id=c.id order by r.updated_at desc limit 1) as return_tracking,
  coalesce((select jsonb_agg(jsonb_build_object('event_type',e.event_type,'actor_role',e.actor_role,
    'comment',e.comment,'created_at',e.created_at) order by e.created_at)
   from public.marketplace_aftersales_negotiation_events e where e.case_id=n.case_id),'[]'::jsonb) as history
 from public.marketplace_aftersales_negotiations n
 join public.marketplace_aftersales_cases c on c.id=n.case_id
 join public.marketplace_orders o on o.id=c.order_id
 left join public.marketplace_order_items i on i.id=c.order_item_id
 where private.is_leogo_admin('orders.manage') or n.seller_id=(select auth.uid()) or c.customer_id=(select auth.uid())
) q
$function$;
revoke all on function public.aftersales_list_negotiations() from public,anon;
grant execute on function public.aftersales_list_negotiations() to authenticated;
CREATE OR REPLACE FUNCTION public.aftersales_seller_list_inspections()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb)
 from public.aftersales_seller_inspections i where i.seller_id=(select auth.uid())
$function$;
revoke all on function public.aftersales_seller_list_inspections() from public,anon;
grant execute on function public.aftersales_seller_list_inspections() to authenticated;
CREATE OR REPLACE FUNCTION public.aftersales_seller_mark_repacked(p_case_id uuid, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_seller uuid:=(select auth.uid());
begin
 if length(btrim(coalesce(p_note,'')))<5 or length(p_note)>2000 then raise exception 'Describe repacking and parcel readiness';end if;
 update public.aftersales_seller_inspections set ready_return_at=now(),
 inspection_notes=concat_ws(' | ',inspection_notes,'Repacked: '||btrim(p_note)),updated_at=now()
 where case_id=p_case_id and seller_id=v_seller and recommendation='reject'
  and inspected_at is not null and ready_return_at is null
  and exists(select 1 from public.marketplace_aftersales_negotiations n
   where n.case_id=p_case_id and n.seller_id=v_seller and n.stage='seller_rejected');
 if not found then raise exception 'Only a rejected, inspected item may be marked repacked once';end if;
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(p_case_id,v_seller,'seller','repacked_for_customer_return',left(p_note,2000));
 insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view)
 select c.customer_id,'aftersales','Rejected item prepared for return',
 'Case '||c.case_reference||': Seller has repacked your item. LEOGO will issue return shipping instructions.',
 'marketplace_aftersales_case',c.id,'aftersales_return_repacked','aftersales'
 from public.marketplace_aftersales_cases c where c.id=p_case_id;
 return jsonb_build_object('ok',true,'status','ready_for_customer_return');
end;$function$;
revoke all on function public.aftersales_seller_mark_repacked(p_case_id uuid, p_note text) from public,anon;
grant execute on function public.aftersales_seller_mark_repacked(p_case_id uuid, p_note text) to authenticated;
CREATE OR REPLACE FUNCTION public.aftersales_seller_propose_v2(p_case_id uuid, p_solution_kind text, p_solution text, p_comment text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
 if p_solution_kind not in ('return_refund','return_exchange','replacement','other') then
  raise exception 'Select return/refund, return/exchange, replacement or other solution'; end if;
 select public.aftersales_seller_respond(p_case_id,'propose',p_solution,p_comment) into v_result;
 update public.marketplace_aftersales_negotiations set solution_kind=p_solution_kind
 where case_id=p_case_id and seller_id=auth.uid();
 if p_solution_kind='return_refund' then
  update public.marketplace_aftersales_cases c
    set requested_refund_amount_kes=i.line_total_kes
  from public.marketplace_order_items i,public.marketplace_aftersales_negotiations n
  where c.id=p_case_id and c.order_item_id=i.id and i.order_id=c.order_id
    and n.case_id=c.id and n.seller_id=(select auth.uid());
  if not found then
    raise exception 'Select the exact purchased item before proposing a product-only refund';
  end if;
 end if;
 return v_result;
end;$function$;
revoke all on function public.aftersales_seller_propose_v2(p_case_id uuid, p_solution_kind text, p_solution text, p_comment text) from public,anon;
grant execute on function public.aftersales_seller_propose_v2(p_case_id uuid, p_solution_kind text, p_solution text, p_comment text) to authenticated;
CREATE OR REPLACE FUNCTION public.aftersales_seller_receive_return(p_case_id uuid, p_condition text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_seller uuid:=(select auth.uid());v_return public.pickup_station_return_parcels%rowtype;
begin
 if length(btrim(coalesce(p_condition,'')))<5 or length(p_condition)>2000 then raise exception 'Describe parcel condition (5-2000 characters)';end if;
 if not exists(select 1 from public.marketplace_aftersales_negotiations n
   where n.case_id=p_case_id and n.seller_id=v_seller and n.stage='customer_accepted'
   and n.solution_kind in ('return_refund','return_exchange')) then
   raise exception 'This accepted return does not belong to your seller account';end if;
 select * into v_return from public.pickup_station_return_parcels
 where aftersales_case_id=p_case_id and status in ('dispatched','completed') for update;
 if not found then raise exception 'Return must first be dispatched from pickup station by LEOGO';end if;
 if exists(select 1 from public.aftersales_return_transport_events where return_parcel_id=v_return.id)
   and coalesce((select e.step from public.aftersales_return_transport_events e
      where e.return_parcel_id=v_return.id order by e.created_at desc,e.id desc limit 1),'')
      not in ('station_dispatched_to_seller','sorting_dispatched_to_seller') then
   raise exception 'Return is still in transit or at LEOGO Sorting Center; seller receipt is not yet permitted';
 end if;
 insert into public.aftersales_seller_inspections(case_id,seller_id,received_at,received_condition)
 values(p_case_id,v_seller,now(),btrim(p_condition))
 on conflict(case_id) do nothing;
 if not found then raise exception 'Seller has already recorded receipt';end if;
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(p_case_id,v_seller,'seller','return_received_for_inspection',left(btrim(p_condition),2000));
 insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view)
 select c.customer_id,'aftersales','Seller received return for inspection',
 'The seller has received your returned item for case '||c.case_reference||'. Inspection is pending.',
 'marketplace_aftersales_case',c.id,'aftersales_seller_received_return','aftersales'
 from public.marketplace_aftersales_cases c where c.id=p_case_id;
 return jsonb_build_object('ok',true,'case_id',p_case_id,'status','received_for_inspection');
end;$function$;
revoke all on function public.aftersales_seller_receive_return(p_case_id uuid, p_condition text) from public,anon;
grant execute on function public.aftersales_seller_receive_return(p_case_id uuid, p_condition text) to authenticated;
CREATE OR REPLACE FUNCTION public.aftersales_seller_record_inspection(p_case_id uuid, p_finding text, p_recommendation text, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_seller uuid:=(select auth.uid());
begin
 if p_finding not in ('seller_liability','customer_damage','undetermined') or
 p_recommendation not in ('refund','exchange','replacement','reject') then
   raise exception 'Choose valid inspection result and recommendation';end if;
 if length(btrim(coalesce(p_notes,'')))<10 or length(p_notes)>2000 then
   raise exception 'Provide inspection reasons (10-2000 characters)';end if;
 update public.aftersales_seller_inspections set inspected_at=now(),finding=p_finding,
   recommendation=p_recommendation,inspection_notes=btrim(p_notes),updated_at=now(),
   ready_return_at=null
 where case_id=p_case_id and seller_id=v_seller and received_at is not null and inspected_at is null;
 if not found then raise exception 'You must first receive and inspect this assigned return (or inspection is already recorded)';end if;
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(p_case_id,v_seller,'seller','return_inspected_'||p_recommendation,
 left(p_finding||': '||btrim(p_notes),2000));
 if p_recommendation='reject' then
  update public.marketplace_aftersales_negotiations set stage='seller_rejected',
  seller_comment=btrim(p_notes),updated_at=now() where case_id=p_case_id and seller_id=v_seller;
 end if;
 insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view)
 select c.customer_id,'aftersales',
 case when p_recommendation='reject' then 'Seller declined after inspection' else 'Seller inspection completed' end,
 'Aftersales '||c.case_reference||' inspection: '||replace(p_recommendation,'_',' ')||'. Reason: '||left(btrim(p_notes),800)||
 case when p_recommendation='reject' then ' You may request LEOGO intervention.' else ' LEOGO will review the recommendation.' end,
 'marketplace_aftersales_case',c.id,'aftersales_seller_inspection_'||p_recommendation,'aftersales'
 from public.marketplace_aftersales_cases c where c.id=p_case_id;
 return jsonb_build_object('ok',true,'case_id',p_case_id,'recommendation',p_recommendation,
  'requires_admin_review',true,'refund_automatically_issued',false);
end;$function$;
revoke all on function public.aftersales_seller_record_inspection(p_case_id uuid, p_finding text, p_recommendation text, p_notes text) from public,anon;
grant execute on function public.aftersales_seller_record_inspection(p_case_id uuid, p_finding text, p_recommendation text, p_notes text) to authenticated;
CREATE OR REPLACE FUNCTION public.aftersales_seller_respond(p_case_id uuid, p_action text, p_solution text DEFAULT NULL::text, p_comment text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.marketplace_aftersales_negotiations%rowtype;
begin
 select * into v from public.marketplace_aftersales_negotiations where case_id=p_case_id and seller_id=auth.uid() for update;
 if not found then raise exception 'Case not assigned to this seller'; end if;
 if v.stage not in ('forwarded','seller_review','customer_rejected') then raise exception 'Case cannot be updated at this stage'; end if;
 if p_action not in ('review','propose','reject') then raise exception 'Unsupported seller action'; end if;
 if char_length(coalesce(p_comment,''))>2000 or char_length(coalesce(p_solution,''))>2000 then raise exception 'Comment too long'; end if;
 if p_action='propose' and char_length(btrim(coalesce(p_solution,'')))<5 then raise exception 'Describe the proposed solution'; end if;
 if p_action='reject' and char_length(btrim(coalesce(p_comment,'')))<5 then raise exception 'Provide a reason for rejection'; end if;
 update public.marketplace_aftersales_negotiations set
 stage=case p_action when 'review' then 'seller_review' when 'propose' then 'seller_proposed' else 'seller_rejected' end,
 seller_solution=case when p_action='propose' then btrim(p_solution) else seller_solution end,
 seller_comment=nullif(btrim(p_comment),''),
 proposed_at=case when p_action='propose' then now() else proposed_at end,
 response_due_at=case when p_action='propose' then now()+interval '3 days' else response_due_at end,
 updated_at=now() where case_id=p_case_id;
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(p_case_id,auth.uid(),'seller',p_action,coalesce(nullif(btrim(p_solution),''),nullif(btrim(p_comment),'')));

 if p_action in ('propose','reject') then
  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view)
  select c.customer_id,'aftersales',
  case when p_action='propose' then 'Seller proposed an aftersales solution' else 'Seller rejected aftersales claim' end,
  'Case '||c.case_reference||': '||
  case when p_action='propose' then 'Review your seller solution within 3 days. '
       else 'Review the reason and request LEOGO intervention if needed. ' end||
  left(coalesce(nullif(btrim(p_solution),''),nullif(btrim(p_comment),''),''),500),
  'marketplace_aftersales_case',c.id,'aftersales_seller_'||p_action,'aftersales'
  from public.marketplace_aftersales_cases c where c.id=p_case_id;
 end if;
 return jsonb_build_object('ok',true,'case_id',p_case_id);
end;$function$;
revoke all on function public.aftersales_seller_respond(p_case_id uuid, p_action text, p_solution text, p_comment text) from public,anon;
grant execute on function public.aftersales_seller_respond(p_case_id uuid, p_action text, p_solution text, p_comment text) to authenticated;
CREATE OR REPLACE FUNCTION public.customer_aftersales_confirm_rejected_item_received(p_case_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 update public.aftersales_return_shipping set status='received_by_customer',received_at=now(),updated_at=now()
 where case_id=p_case_id and customer_id=(select auth.uid()) and status='dispatched';
 if not found then raise exception 'Return parcel must be dispatched first';end if;
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(p_case_id,(select auth.uid()),'customer','rejected_item_received','Customer confirmed receiving the returned item');
 return jsonb_build_object('ok',true,'status','received_by_customer');
end;$function$;
revoke all on function public.customer_aftersales_confirm_rejected_item_received(p_case_id uuid) from public,anon;
grant execute on function public.customer_aftersales_confirm_rejected_item_received(p_case_id uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.customer_aftersales_submit_return_shipping_payment(p_case_id uuid, p_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if length(btrim(coalesce(p_reference,'')))<5 or length(p_reference)>250 then raise exception 'Provide payment transaction reference';end if;
 update public.aftersales_return_shipping set payment_reference=btrim(p_reference),
  payment_submitted_at=now(),status='payment_submitted',updated_at=now()
 where case_id=p_case_id and customer_id=(select auth.uid())
   and status in ('awaiting_payment','payment_rejected') and due_at>=clock_timestamp()
   and exists(select 1 from public.marketplace_aftersales_negotiations n where n.case_id=p_case_id and n.stage='seller_rejected');
 if not found then raise exception 'Return shipping invoice unavailable or expired';end if;
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(p_case_id,(select auth.uid()),'customer','return_shipping_payment_submitted','Payment proof submitted for LEOGO verification');
 return jsonb_build_object('ok',true,'status','payment_submitted');
end;$function$;
revoke all on function public.customer_aftersales_submit_return_shipping_payment(p_case_id uuid, p_reference text) from public,anon;
grant execute on function public.customer_aftersales_submit_return_shipping_payment(p_case_id uuid, p_reference text) to authenticated;
CREATE OR REPLACE FUNCTION public.customer_submit_marketplace_aftersales(p_order_id uuid, p_issue_type text, p_preferred_solution text, p_details text, p_evidence_path text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=(select auth.uid());
  v_order public.marketplace_orders%rowtype;
  v_case_id uuid;
  v_case_reference text;
  v_handover_at timestamptz;
begin
  if v_uid is null then raise exception 'Login required'; end if;

  select * into v_order
  from public.marketplace_orders
  where id=p_order_id and customer_id=v_uid;

  if not found then raise exception 'Order not found'; end if;
  if v_order.order_status<>'delivered' then raise exception 'Aftersales can be requested after the order is delivered'; end if;
  select max(p.handed_over_at) into v_handover_at
  from public.pickup_station_parcels p
  where p.order_id=p_order_id and p.handed_over_at is not null;
  v_handover_at:=coalesce(v_handover_at,v_order.delivered_at);
  if v_handover_at is null then
    raise exception 'Delivery handover timestamp is missing. Contact LEOGO Customer Care for assistance';
  end if;
  if clock_timestamp() > v_handover_at + interval '7 days'
    and not exists (
      select 1 from public.aftersales_deadline_extensions e
      where e.order_id=p_order_id and e.valid_until>=clock_timestamp()
    ) then
    raise exception 'Seven-day aftersales window has expired. Contact LEOGO Customer Care for a reviewed exception';
  end if;


  if nullif(btrim(coalesce(p_issue_type,'')),'') is null then raise exception 'Choose the aftersales issue'; end if;
  if nullif(btrim(coalesce(p_preferred_solution,'')),'') is null then raise exception 'Choose your preferred solution'; end if;
  if char_length(btrim(coalesce(p_details,'')))<5 then raise exception 'Please explain the issue'; end if;
  if char_length(coalesce(p_details,''))>3000 then raise exception 'Aftersales details must be 3000 characters or fewer'; end if;

  if exists(
    select 1 from public.marketplace_aftersales_cases c
    where c.order_id=p_order_id
      and c.customer_id=v_uid
      and c.status in ('submitted','in_review','contacted')
  ) then
    raise exception 'This order already has an active aftersales case';
  end if;

  v_case_reference='AFS-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

  insert into public.marketplace_aftersales_cases(
    case_reference,order_id,customer_id,issue_type,preferred_solution,details,evidence_path
  )
  values(
    v_case_reference,p_order_id,v_uid,
    btrim(p_issue_type),btrim(p_preferred_solution),btrim(p_details),
    nullif(btrim(coalesce(p_evidence_path,'')),'')
  )
  returning id into v_case_id;

  insert into public.customer_notifications(
    user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata
  )
  values(
    v_uid,'aftersales','Aftersales case submitted',
    'Your aftersales case '||v_case_reference||' for order '||v_order.order_reference||' has been submitted to LEOGO Customer Care.',
    'marketplace_aftersales_case',v_case_id,'aftersales_submitted','aftersales',
    jsonb_build_object('case_reference',v_case_reference,'order_id',p_order_id,'order_reference',v_order.order_reference)
  );

  return jsonb_build_object('ok',true,'case_id',v_case_id,'case_reference',v_case_reference,'status','submitted');
end
$function$;
revoke all on function public.customer_submit_marketplace_aftersales(p_order_id uuid, p_issue_type text, p_preferred_solution text, p_details text, p_evidence_path text) from public,anon;
grant execute on function public.customer_submit_marketplace_aftersales(p_order_id uuid, p_issue_type text, p_preferred_solution text, p_details text, p_evidence_path text) to authenticated;
CREATE OR REPLACE FUNCTION public.customer_submit_marketplace_aftersales_v2(p_order_id uuid, p_order_item_id uuid, p_issue_type text, p_preferred_solution text, p_details text, p_requested_refund_amount_kes numeric DEFAULT NULL::numeric, p_evidence_path text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_uid uuid:=(select auth.uid());
 v_order public.marketplace_orders%rowtype;
 v_item public.marketplace_order_items%rowtype;
 v_handover timestamptz;
 v_case uuid;
 v_reference text;
begin
 if v_uid is null then raise exception 'Login required';end if;
 if p_order_item_id is null then raise exception 'Choose the exact purchased product for this complaint';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_order_item_id::text,0));
 select * into v_order from public.marketplace_orders where id=p_order_id and customer_id=v_uid;
 if not found then raise exception 'Your order was not found';end if;
 select * into v_item from public.marketplace_order_items where id=p_order_item_id and order_id=p_order_id for share;
 if not found or v_item.seller_id is null then raise exception 'Select a valid purchased item with an assigned seller';end if;
 if v_order.order_status<>'delivered' then raise exception 'Aftersales starts after item handover or delivery';end if;
 select max(handed_over_at) into v_handover from public.pickup_station_parcels
 where order_id=p_order_id and handed_over_at is not null;
 v_handover:=coalesce(v_handover,v_order.delivered_at);
 if v_handover is null then raise exception 'Handover timestamp unavailable. Contact LEOGO Customer Care';end if;
 if clock_timestamp()>v_handover+interval '7 days'
   and not exists(select 1 from public.aftersales_deadline_extensions e
     where e.order_id=p_order_id and e.valid_until>=clock_timestamp()) then
   raise exception 'The seven-day aftersales period has expired. Contact LEOGO Customer Care for reactivation';
 end if;
 if length(btrim(coalesce(p_issue_type,'')))<2 or length(p_issue_type)>120 then
   raise exception 'Choose a valid issue type';end if;
 if length(btrim(coalesce(p_preferred_solution,'')))<2 or length(p_preferred_solution)>120 then
   raise exception 'Choose the preferred solution';end if;
 if length(btrim(coalesce(p_details,'')))<5 or length(p_details)>3000 then
   raise exception 'Explain the problem in 5-3000 characters';end if;
 if p_preferred_solution='refund_review' then
   if p_requested_refund_amount_kes is null or p_requested_refund_amount_kes<=0
     or p_requested_refund_amount_kes>v_item.line_total_kes then
     raise exception 'Refund must be within the purchased product value, excluding shipping';end if;
 elsif p_requested_refund_amount_kes is not null then
   raise exception 'Refund amount applies only to a refund request';end if;
 if exists(select 1 from public.marketplace_aftersales_cases c
  where c.order_id=p_order_id and c.customer_id=v_uid and c.order_item_id=p_order_item_id
   and c.status not in ('resolved','rejected','cancelled')) then
   raise exception 'This purchased item already has an active aftersales case';end if;
 if p_evidence_path is not null and btrim(p_evidence_path)<>''
   and (p_evidence_path not like v_uid::text||'/%' or length(p_evidence_path)>500) then
    raise exception 'Photo proof must belong to the signed-in customer';end if;
 v_reference:='AFS-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 insert into public.marketplace_aftersales_cases
 (case_reference,order_id,order_item_id,customer_id,issue_type,preferred_solution,details,
  evidence_path,requested_refund_amount_kes)
 values (v_reference,p_order_id,p_order_item_id,v_uid,btrim(p_issue_type),
 btrim(p_preferred_solution),btrim(p_details),nullif(btrim(coalesce(p_evidence_path,'')),''),p_requested_refund_amount_kes)
 returning id into v_case;
 insert into public.marketplace_aftersales_negotiations(case_id,seller_id,stage,admin_comment)
 values(v_case,v_item.seller_id,'forwarded','Automatically assigned to the seller of purchased order item');
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(v_case,v_uid,'customer','submitted_to_seller',
  left('Item: '||coalesce(v_item.product_name,'Purchased item')||'; issue: '||btrim(p_issue_type),2000));
 insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view,metadata)
 values(v_uid,'aftersales','Your complaint was sent to the seller',
  'Case '||v_reference||' for '||coalesce(v_item.product_name,'your item')||' was sent directly to the responsible seller.',
  'marketplace_aftersales_case',v_case,'aftersales_submitted_to_seller','aftersales',
  jsonb_build_object('case_reference',v_reference,'order_id',p_order_id,'order_item_id',p_order_item_id));
 perform private.notify_partner(v_item.seller_id,'seller','aftersales_case_received',
  'New product aftersales complaint',
  'Case '||v_reference||' · Order '||v_order.order_reference||' · Product '||coalesce(v_item.product_name,'Purchased item')||
  '. Open Seller Aftersales to review customer evidence and respond.',
  'marketplace_aftersales_case',v_case,'aftersales',
  jsonb_build_object('case_reference',v_reference,'order_id',p_order_id,'order_item_id',p_order_item_id));
 return jsonb_build_object('ok',true,'case_id',v_case,'case_reference',v_reference,
  'order_item_id',p_order_item_id,'seller_id',v_item.seller_id,'status','forwarded');
end;$function$;
revoke all on function public.customer_submit_marketplace_aftersales_v2(p_order_id uuid, p_order_item_id uuid, p_issue_type text, p_preferred_solution text, p_details text, p_requested_refund_amount_kes numeric, p_evidence_path text) from public,anon;
grant execute on function public.customer_submit_marketplace_aftersales_v2(p_order_id uuid, p_order_item_id uuid, p_issue_type text, p_preferred_solution text, p_details text, p_requested_refund_amount_kes numeric, p_evidence_path text) to authenticated;
