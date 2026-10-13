-- Resolve legacy seller aftersales cases from their original purchased order item.
-- Never guess an item when several eligible seller items exist.
create or replace function public.aftersales_seller_propose_v2(
 p_case_id uuid, p_solution_kind text, p_solution text, p_comment text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
 v_result jsonb;
 v_order_id uuid;
 v_item_id uuid;
 v_seller_id uuid;
 v_item_count integer;
 v_amount numeric;
begin
 if p_solution_kind not in ('return_refund','return_exchange','replacement','other') then
  raise exception 'Select return/refund, return/exchange, replacement or other solution';
 end if;
 if p_solution_kind='return_refund' then
  select c.order_id,c.order_item_id,n.seller_id
   into v_order_id,v_item_id,v_seller_id
  from public.marketplace_aftersales_cases c
  join public.marketplace_aftersales_negotiations n on n.case_id=c.id
  where c.id=p_case_id and n.seller_id=(select auth.uid())
  for update of c;
  if not found then raise exception 'Aftersales case unavailable for this seller'; end if;
  if v_item_id is null then
   select count(*),min(i.id) into v_item_count,v_item_id
   from public.marketplace_order_items i
   where i.order_id=v_order_id and i.seller_id=v_seller_id;
   if v_item_count<>1 then
    raise exception 'This older Aftersales case cannot identify one purchased product from the order. Contact LEOGO Customer Care to verify the affected item.';
   end if;
   update public.marketplace_aftersales_cases
    set order_item_id=v_item_id
    where id=p_case_id and order_item_id is null;
  end if;
  select i.line_total_kes into v_amount
  from public.marketplace_order_items i
  where i.id=v_item_id and i.order_id=v_order_id and i.seller_id=v_seller_id;
  if not found then raise exception 'The linked product is not part of this seller order'; end if;
 end if;
 select public.aftersales_seller_respond(p_case_id,'propose',p_solution,p_comment) into v_result;
 update public.marketplace_aftersales_negotiations set solution_kind=p_solution_kind
 where case_id=p_case_id and seller_id=(select auth.uid());
 if p_solution_kind='return_refund' then
  update public.marketplace_aftersales_cases
   set requested_refund_amount_kes=v_amount
   where id=p_case_id and order_item_id=v_item_id;
 end if;
 return v_result;
end;
$function$;