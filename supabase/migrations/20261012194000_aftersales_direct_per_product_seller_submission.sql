-- Strict product-specific aftersales: each purchased order item maps directly to its seller.
-- Legacy order-level submit RPC remains in place for backwards compatibility.
create or replace function public.customer_submit_marketplace_aftersales_v2(
 p_order_id uuid,p_order_item_id uuid,p_issue_type text,p_preferred_solution text,p_details text,
 p_requested_refund_amount_kes numeric default null,p_evidence_path text default null
) returns jsonb language plpgsql security definer set search_path='' as $fn$
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
end;$fn$;
revoke all on function public.customer_submit_marketplace_aftersales_v2(uuid,uuid,text,text,text,numeric,text) from public,anon;
grant execute on function public.customer_submit_marketplace_aftersales_v2(uuid,uuid,text,text,text,numeric,text) to authenticated;
