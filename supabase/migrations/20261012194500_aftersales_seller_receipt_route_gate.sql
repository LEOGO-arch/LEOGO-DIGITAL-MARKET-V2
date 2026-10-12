-- Enforce sorting-center or direct seller dispatch before assigned seller acknowledges parcel receipt.
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
end;$function$
;
