-- LEOGO Weekend Shopping staging-only: server quote, manual verification and controlled marketplace release.
-- Do not deploy to production without authenticated end-to-end financial reconciliation and reports testing.
alter table public.weekend_shopping_plans
 add column if not exists receiver_name text,
 add column if not exists contact_number text,
 add column if not exists delivery_zone text,
 add column if not exists pickup_station_id uuid references public.pickup_stations(id);
alter table public.weekend_shopping_cycles
 add column if not exists quote_confirmed_at timestamptz,
 add column if not exists quote_version text,
 add column if not exists release_approved_by uuid references auth.users(id),
 add column if not exists release_approved_at timestamptz,
 add column if not exists release_note text;
alter table public.marketplace_orders drop constraint if exists marketplace_orders_payment_method_check;
alter table public.marketplace_orders add constraint marketplace_orders_payment_method_check
check(payment_method=any(array['till','paybill','cod','points','lipa_pole_pole','wallet','weekend_savings']));

CREATE OR REPLACE FUNCTION public.admin_list_weekend_ready()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select case when (select auth.uid()) is null or not private.is_leogo_admin() then '[]'::jsonb
 else coalesce(jsonb_agg(jsonb_build_object(
 'cycle_id',c.id,'plan_id',p.id,'customer_id',p.customer_id,'delivery_date',c.delivery_date,
 'customer',p.receiver_name,'delivery_zone',p.delivery_zone,'county',p.county,
 'amount_due_kes',c.amount_due_kes,'verified_paid_kes',c.verified_paid_kes,
 'status',c.status,'release_approved_at',c.release_approved_at
 ) order by c.delivery_date,c.created_at),'[]'::jsonb) end
 from public.weekend_shopping_cycles c join public.weekend_shopping_plans p on p.id=c.plan_id
 where c.status in('funded','release_ready') and p.status='funding'
 and (select private.is_leogo_admin())
$function$
;

CREATE OR REPLACE FUNCTION public.admin_mark_weekend_release_ready(p_cycle_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_cycle record;
begin
 if auth.uid() is null or not private.is_leogo_admin() then raise exception 'Admin permission required'; end if;
 select * into v_cycle from public.weekend_shopping_cycles where id=p_cycle_id for update;
 if not found or v_cycle.status<>'funded' or v_cycle.verified_paid_kes<>v_cycle.amount_due_kes
 or v_cycle.delivery_date>current_date or v_cycle.quote_confirmed_at is null
 then raise exception 'Verified full payment, quote and scheduled delivery date required'; end if;
 if exists(select 1 from public.weekend_shopping_payments w where w.cycle_id=p_cycle_id and w.status='pending')
 then raise exception 'Resolve all payment claims before release';end if;
 update public.weekend_shopping_cycles set status='release_ready',release_approved_by=auth.uid(),
 release_approved_at=now() where id=p_cycle_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.customer_create_weekend_shopping_quoted(p_items jsonb, p_date date, p_cadence text, p_receiver_name text, p_contact_number text, p_delivery_zone text, p_county text DEFAULT NULL::text, p_sub_county text DEFAULT NULL::text, p_estate text DEFAULT NULL::text, p_landmark text DEFAULT NULL::text, p_pickup_station_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_plan uuid;v_cycle record;v_quote jsonb;v_quoted_subtotal numeric;v_quoted_fee numeric;v_quoted_delivery numeric;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if length(btrim(coalesce(p_receiver_name,'')))<2 or length(btrim(coalesce(p_contact_number,'')))<7 then
 raise exception 'Receiver name and contact number are required';end if;
 if p_delivery_zone not in ('cbd','estate','outside','pickup') then raise exception 'Delivery zone is required';end if;
 if p_delivery_zone='pickup' and p_pickup_station_id is null then raise exception 'Choose a pickup station';end if;
 -- Reuse the exact marketplace quotation for current delivery/service policy.
 v_quote:=public.customer_market_day_checkout_quote(p_items,p_delivery_zone,p_county,p_sub_county,p_estate,p_pickup_station_id);
 if coalesce((v_quote->>'leogo_delivery_subsidy_kes')::numeric,0)>0 then
 raise exception 'Free-delivery campaign not supported for scheduled savings orders';end if;
 v_plan:=public.customer_create_weekend_shopping(p_items,p_date,p_cadence,p_county,p_sub_county,p_estate,p_landmark);
 select * into v_cycle from public.weekend_shopping_cycles where plan_id=v_plan and cycle_no=1 for update;
 v_quoted_subtotal:=(v_quote->>'items_subtotal_kes')::numeric;
 v_quoted_fee:=(v_quote->>'service_fee_kes')::numeric;
 v_quoted_delivery:=(v_quote->>'delivery_fee_kes')::numeric+coalesce((v_quote->>'pickup_fee_kes')::numeric,0);
 -- An active flash/market promotion can expire before delivery; do not pledge a future discount.
 if abs(v_cycle.items_total_kes-v_quoted_subtotal)>0.01 then
 raise exception 'Promotional pricing cannot be locked for this scheduled plan. Choose regularly priced items';end if;
 if v_quoted_fee is null or v_quoted_delivery is null or v_quoted_fee<0 or v_quoted_delivery<0 then
 raise exception 'Delivery quote is unavailable';end if;
 update public.weekend_shopping_plans
 set receiver_name=btrim(p_receiver_name),contact_number=btrim(p_contact_number),delivery_zone=p_delivery_zone,
 pickup_station_id=p_pickup_station_id where id=v_plan;
 update public.weekend_shopping_cycles
 set delivery_fee_kes=v_quoted_delivery,service_fee_kes=v_quoted_fee,quote_confirmed_at=now(),quote_version='marketplace-v1'
 where id=v_cycle.id;
 return v_plan;
end $function$
;

CREATE OR REPLACE FUNCTION public.customer_generate_next_weekend_cycle(p_plan_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_plan record;v_last record;v_new uuid;v_date date;v_items jsonb;v_quote jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 select * into v_plan from public.weekend_shopping_plans
 where id=p_plan_id and customer_id=auth.uid() and cadence='weekly' and status='funding' for update;
 if not found then raise exception 'Active weekly plan not found';end if;
 select * into v_last from public.weekend_shopping_cycles where plan_id=p_plan_id order by cycle_no desc limit 1;
 if not found or v_last.cycle_no>=52 then raise exception 'No further cycle available';end if;
 if v_last.status not in('funded','release_ready','released') then
 raise exception 'Previous cycle must be fully funded first';end if;
 if v_plan.delivery_zone is null then raise exception 'A complete delivery quote is required';end if;
 v_date:=v_last.delivery_date+7;
 while v_date<=current_date loop v_date:=v_date+7;end loop;
 select jsonb_agg(jsonb_build_object('product_id',product_id,'variant_id',variant_id,'quantity',qty))
 into v_items from public.weekend_shopping_items where cycle_id=v_last.id;
 v_quote:=public.customer_market_day_checkout_quote(v_items,v_plan.delivery_zone,v_plan.county,
 v_plan.sub_county,v_plan.estate,v_plan.pickup_station_id);
 if abs((v_quote->>'items_subtotal_kes')::numeric-v_last.items_total_kes)>0.01 or
 coalesce((v_quote->>'leogo_delivery_subsidy_kes')::numeric,0)>0 or
 abs((v_quote->>'service_fee_kes')::numeric-v_last.service_fee_kes)>0.01 or
 abs((v_quote->>'delivery_fee_kes')::numeric+coalesce((v_quote->>'pickup_fee_kes')::numeric,0)-v_last.delivery_fee_kes)>0.01 then
 raise exception 'Prices or delivery fees changed. Create a new quoted plan';end if;
 insert into public.weekend_shopping_cycles(plan_id,cycle_no,delivery_date,items_total_kes,
 delivery_fee_kes,service_fee_kes,quote_confirmed_at,quote_version)
 values(p_plan_id,v_last.cycle_no+1,v_date,v_last.items_total_kes,
 v_last.delivery_fee_kes,v_last.service_fee_kes,now(),'marketplace-v1')
 returning id into v_new;
 insert into public.weekend_shopping_items(cycle_id,product_id,variant_id,seller_id,product_name,qty,seller_unit_kes,customer_unit_kes)
 select v_new,product_id,variant_id,seller_id,product_name,qty,seller_unit_kes,customer_unit_kes
 from public.weekend_shopping_items where cycle_id=v_last.id;
 return v_new;
end $function$
;

CREATE OR REPLACE FUNCTION public.customer_release_weekend_order(p_cycle_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid();v_cycle record;v_plan record;v_items jsonb;v_order jsonb;v_order_id uuid;
 v_quote jsonb;v_seller_delta numeric;v_total numeric;
begin
 if v_uid is null then raise exception 'Sign in required';end if;
 select c.* into v_cycle from public.weekend_shopping_cycles c where c.id=p_cycle_id for update;
 if not found then raise exception 'Shopping cycle unavailable';end if;
 select * into v_plan from public.weekend_shopping_plans where id=v_cycle.plan_id and customer_id=v_uid for update;
 if not found then raise exception 'Shopping cycle does not belong to you';end if;
 if v_cycle.status='released' and v_cycle.released_order_id is not null then
 return jsonb_build_object('order_id',v_cycle.released_order_id,'already_released',true);end if;
 if v_cycle.status<>'release_ready' or v_cycle.released_order_id is not null
 or v_cycle.verified_paid_kes<>v_cycle.amount_due_kes or v_cycle.delivery_date>current_date
 or v_cycle.quote_confirmed_at is null or v_cycle.release_approved_by is null
 then raise exception 'Full verified payment and Admin delivery release are required';end if;
 if v_plan.receiver_name is null or v_plan.contact_number is null or v_plan.delivery_zone is null
 then raise exception 'Complete your scheduled delivery details';end if;
 select jsonb_agg(jsonb_build_object('product_id',i.product_id,'variant_id',i.variant_id,'quantity',i.qty)
  order by i.id) into v_items from public.weekend_shopping_items i where i.cycle_id=p_cycle_id;
 if v_items is null then raise exception 'Shopping plan has no items';end if;
 -- Revalidate availability, actual current prices and fees before placing an order.
 v_quote:=public.customer_market_day_checkout_quote(v_items,v_plan.delivery_zone,v_plan.county,
 v_plan.sub_county,v_plan.estate,v_plan.pickup_station_id);
 v_total:=(v_quote->>'grand_total_kes')::numeric;
 if abs(v_total-v_cycle.amount_due_kes)>0.01 or
 abs((v_quote->>'items_subtotal_kes')::numeric-v_cycle.items_total_kes)>0.01 or
 coalesce((v_quote->>'leogo_delivery_subsidy_kes')::numeric,0)<>0
 then raise exception 'Prices or delivery charges changed. Admin reconciliation required before release';end if;
 -- This existing function controls stock deduction and seller-order creation.
 v_order:=public.customer_create_marketplace_order(v_items,v_plan.receiver_name,v_plan.contact_number,
 v_plan.delivery_zone,v_plan.county,v_plan.sub_county,v_plan.estate,v_plan.landmark,null,
 v_plan.pickup_station_id,'till','Verified Weekend Shopping savings cycle '||p_cycle_id::text);
 v_order_id:=(v_order->>'order_id')::uuid;
 if abs((v_order->>'grand_total_kes')::numeric-v_cycle.amount_due_kes)>0.01 then
 raise exception 'Checkout amount mismatch. All order changes rolled back';end if;
 select coalesce(sum(abs(oi.seller_unit_price_kes-wi.seller_unit_kes)*oi.quantity),0)
 into v_seller_delta from public.marketplace_order_items oi
 join public.weekend_shopping_items wi on wi.cycle_id=p_cycle_id and wi.product_id=oi.product_id
 and wi.variant_id is not distinct from oi.variant_id where oi.order_id=v_order_id;
 if v_seller_delta>0.01 or
 (select count(*) from public.marketplace_order_items where order_id=v_order_id)
 <>(select count(*) from public.weekend_shopping_items where cycle_id=p_cycle_id)
 then raise exception 'Seller prices changed. Admin reconciliation required before release';end if;
 update public.marketplace_orders
 set payment_method='weekend_savings',payment_status='verified_paid',
 payment_verified_at=now(),payment_verified_by=v_cycle.release_approved_by,
 external_amount_due_kes=0,payment_message='Fully funded through independently verified Weekend Shopping references'
 where id=v_order_id;
 update public.weekend_shopping_cycles set status='released',released_order_id=v_order_id
 where id=p_cycle_id;
 return jsonb_build_object('order_id',v_order_id,'order_reference',v_order->>'order_reference',
 'grand_total_kes',v_cycle.amount_due_kes,'payment_method','weekend_savings','status','released');
end $function$
;

CREATE OR REPLACE FUNCTION public.customer_submit_weekend_payment(p_cycle_id uuid, p_amount numeric, p_reference text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=auth.uid();v_cycle record;v_id uuid;v_pending numeric;
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Invalid amount'; end if;
 if length(trim(coalesce(p_reference,'')))<6 then raise exception 'Payment reference required'; end if;
 select c.* into v_cycle from public.weekend_shopping_cycles c
 join public.weekend_shopping_plans p on p.id=c.plan_id where c.id=p_cycle_id and p.customer_id=v_user
 and p.status='funding' and c.status='funding' for update of c;
 if not found then raise exception 'Cycle not accepting payments'; end if;
 if v_cycle.quote_confirmed_at is null then raise exception 'Delivery and service fee quote is required before saving';end if;
 select coalesce(sum(amount_kes),0) into v_pending from public.weekend_shopping_payments
 where cycle_id=p_cycle_id and status='pending';
 if p_amount>v_cycle.amount_due_kes-v_cycle.verified_paid_kes-v_pending then
 raise exception 'Amount exceeds outstanding unclaimed balance';end if;
 insert into public.weekend_shopping_payments(cycle_id,customer_id,amount_kes,payment_reference)
 values(p_cycle_id,v_user,p_amount,trim(p_reference)) returning id into v_id;
 return v_id;
end $function$
;
revoke execute on function public.customer_create_weekend_shopping_quoted(jsonb,date,text,text,text,text,text,text,text,text,uuid),
 public.customer_release_weekend_order(uuid),public.admin_list_weekend_ready() from public,anon;
grant execute on function public.customer_create_weekend_shopping_quoted(jsonb,date,text,text,text,text,text,text,text,text,uuid),
 public.customer_release_weekend_order(uuid),public.admin_list_weekend_ready() to authenticated;
