-- Controlled aftersales deadlines; never change refund ledger, custody or payout status.
-- Customer: seven days from physical pickup handover or recorded delivery.
-- Seller proposal: customer response deadline three days; do not auto-accept.
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
$function$
;
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
 return jsonb_build_object('ok',true,'case_id',p_case_id);
end;$function$
;
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
 if p_action in ('accept','reject') and (v.response_due_at is null or clock_timestamp()>v.response_due_at) then
    raise exception 'Three-day response period expired. Contact LEOGO Customer Care for assistance';
 end if;
 if p_action='accept' and v.stage<>'seller_proposed' then raise exception 'No seller solution awaiting acceptance'; end if;
 if p_action='reject' and v.stage<>'seller_proposed' then raise exception 'No seller solution awaiting rejection'; end if;
 if p_action='intervene' and v.stage not in ('seller_rejected','customer_rejected') then raise exception 'Intervention is not available at this stage'; end if;
 if p_action not in ('accept','reject','intervene') then raise exception 'Unsupported customer action'; end if;
 if char_length(coalesce(p_comment,''))>2000 then raise exception 'Comment too long'; end if;
 update public.marketplace_aftersales_negotiations set
 stage=case p_action when 'accept' then 'customer_accepted' when 'reject' then 'customer_rejected' else 'intervention_requested' end,
 customer_comment=nullif(btrim(p_comment),''),updated_at=now() where case_id=p_case_id;
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(p_case_id,auth.uid(),'customer',p_action,nullif(btrim(p_comment),''));
 return jsonb_build_object('ok',true,'case_id',p_case_id);
end;$function$
;
