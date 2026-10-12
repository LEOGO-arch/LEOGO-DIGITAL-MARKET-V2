-- Customer may directly request intervention during the 72-hour seller-proposal response window.
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
end;$function$
;
