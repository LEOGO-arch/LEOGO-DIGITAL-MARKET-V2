-- Targeted aftersales repair; preserve roles, signatures, shipment and accounting logic.
CREATE OR REPLACE FUNCTION public.validate_aftersales_exchange_original_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_item uuid;v_count integer;v_original uuid;
begin
 select order_item_id into v_original from public.marketplace_aftersales_cases where id=new.case_id for update;
 if v_original is null then
  select count(*), (array_agg(i.id))[1] into v_count,v_item from public.marketplace_order_items i
   where i.order_id=new.original_order_id and i.seller_id=new.seller_id;
  if v_count<>1 then raise exception 'Identify the exact purchased item before issuing an exchange';end if;
  update public.marketplace_aftersales_cases set order_item_id=v_item where id=new.case_id;
 else
  if not exists(select 1 from public.marketplace_order_items i
    where i.id=v_original and i.order_id=new.original_order_id and i.seller_id=new.seller_id)
   then raise exception 'Original case item is not from this seller order';end if;
 end if;
 return new;
end;$function$
;

CREATE OR REPLACE FUNCTION public.partner_aftersales_liability_statement(p_party text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_uid uuid:=auth.uid();
begin
 if v_uid is null then raise exception 'Sign in required';end if;
 if p_party='seller' and exists(select 1 from public.seller_accounts where user_id=v_uid and application_status='approved') then v_id:=v_uid;
 elsif p_party='transport_provider' and exists(select 1 from public.transport_provider_accounts where user_id=v_uid and application_status='approved') then v_id:=v_uid;
 elsif p_party='staff_rider' and exists(select 1 from public.leogo_staff where user_id=v_uid and staff_role='rider' and status='active') then v_id:=v_uid;
 elsif p_party='pickup_station' then
 select pickup_station_id into v_id from public.pickup_station_partner_accounts where user_id=v_uid and status='active';
 else raise exception 'Unauthorized liability statement';end if;
 if v_id is null then raise exception 'No authorized account';end if;
 return (select jsonb_build_object(
 'approved_total_kes',coalesce(sum(assessed_amount_kes) filter(where l.status='approved'),0),
 'pending_total_kes',coalesce(sum(assessed_amount_kes) filter(where l.status='pending_review'),0),
 'records',coalesce(jsonb_agg(jsonb_build_object(
 'aftersales_number',c.case_reference,'reason',l.charge_reason,'amount_kes',l.assessed_amount_kes,
 'status',l.status,'created_at',l.created_at,'decision_notes',l.decision_notes,
 'reversal_reason',l.reversal_reason
 ) order by l.created_at desc) filter(where l.id is not null),'[]'::jsonb)
 ) from public.aftersales_liability_cases l
 join public.marketplace_aftersales_cases c on c.id=l.aftersales_case_id
 where l.liability_type=p_party and l.liable_account_id=v_id);
end;$function$
;
