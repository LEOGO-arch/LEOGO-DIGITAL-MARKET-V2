-- Notify customer of seller response; on a return/refund proposal cap refund to exact purchased line total, never original shipping.
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
end;$function$
;
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
end;$function$
;
