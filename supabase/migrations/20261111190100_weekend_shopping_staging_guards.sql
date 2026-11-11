-- Staging-only follow-up: weekly cycle generation, non-variant product fix, and pending payment guard.
create unique index if not exists weekend_items_unique_with_null_variant_idx on public.weekend_shopping_items(cycle_id,product_id,variant_id) nulls not distinct;
CREATE OR REPLACE FUNCTION public.customer_create_weekend_shopping(p_items jsonb, p_date date, p_cadence text, p_county text DEFAULT NULL::text, p_sub_county text DEFAULT NULL::text, p_estate text DEFAULT NULL::text, p_landmark text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=auth.uid(); v_plan uuid;v_cycle uuid;v_item jsonb;v_product record;v_variant record; v_variant_id uuid;
 v_qty numeric;v_seller numeric;v_customer numeric;v_total numeric:=0;v_day int;
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 if p_cadence not in ('once','weekly') or p_date is null or p_date<current_date then raise exception 'Invalid schedule'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Select 1 to 50 cart items'; end if;
 v_day:=case when p_cadence='weekly' then extract(dow from p_date)::int else null end;
 insert into public.weekend_shopping_plans(customer_id,cadence,delivery_date,preferred_weekday,county,sub_county,estate,landmark)
 values(v_user,p_cadence,p_date,v_day,p_county,p_sub_county,p_estate,p_landmark) returning id into v_plan;
 insert into public.weekend_shopping_cycles(plan_id,cycle_no,delivery_date,items_total_kes)
 values(v_plan,1,p_date,1) returning id into v_cycle;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_variant_id:=null;
  v_qty:=(v_item->>'quantity')::numeric;
  if v_qty is null or v_qty<=0 or v_qty>100 or v_qty<>trunc(v_qty) then raise exception 'Invalid item quantity'; end if;
  select * into v_product from public.seller_products where id=(v_item->>'product_id')::uuid
    and product_approval_status='approved' and listing_status='active' and availability_status='available' for share;
  if not found then raise exception 'Product unavailable'; end if;
  if v_item ? 'variant_id' and nullif(v_item->>'variant_id','') is not null then
   select * into v_variant from public.seller_product_variants
     where id=(v_item->>'variant_id')::uuid and product_id=v_product.id and is_active for share;
   if not found then raise exception 'Variation unavailable'; end if;
   v_variant_id:=v_variant.id;
   v_seller:=v_variant.price_kes;v_customer:=coalesce(v_variant.leogo_price_kes,v_seller);
  else
   if v_product.has_variants then raise exception 'Choose a variation'; end if;
   v_seller:=v_product.price_kes;v_customer:=coalesce(v_product.leogo_price_kes,v_seller);
  end if;
  if v_seller is null or v_customer is null or v_seller<0 or v_customer<=0 then raise exception 'Invalid item price'; end if;
  insert into public.weekend_shopping_items(cycle_id,product_id,variant_id,seller_id,product_name,qty,seller_unit_kes,customer_unit_kes)
  values(v_cycle,v_product.id,v_variant_id,v_product.seller_id,v_product.product_name,v_qty,v_seller,v_customer);
  v_total:=v_total+round(v_customer*v_qty,2);
 end loop;
 update public.weekend_shopping_cycles set items_total_kes=v_total where id=v_cycle;
 return v_plan;
end $function$
;

CREATE OR REPLACE FUNCTION public.customer_generate_next_weekend_cycle(p_plan_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_plan record; v_last record; v_new uuid; v_date date;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select * into v_plan from public.weekend_shopping_plans where id=p_plan_id and customer_id=auth.uid() and cadence='weekly' and status='funding' for update;
 if not found then raise exception 'Active weekly plan not found'; end if;
 select * into v_last from public.weekend_shopping_cycles where plan_id=p_plan_id order by cycle_no desc limit 1;
 if not found or v_last.cycle_no>=52 then raise exception 'No further cycle available'; end if;
 if v_last.status not in ('funded','release_ready','released') then raise exception 'Previous cycle must be fully funded first'; end if;
 v_date:=v_last.delivery_date+7;
 while v_date<=current_date loop v_date:=v_date+7; end loop;
 insert into public.weekend_shopping_cycles(plan_id,cycle_no,delivery_date,items_total_kes,service_fee_kes,delivery_fee_kes)
 values(p_plan_id,v_last.cycle_no+1,v_date,v_last.items_total_kes,v_last.service_fee_kes,v_last.delivery_fee_kes)
 returning id into v_new;
 insert into public.weekend_shopping_items(cycle_id,product_id,variant_id,seller_id,product_name,qty,seller_unit_kes,customer_unit_kes)
 select v_new,product_id,variant_id,seller_id,product_name,qty,seller_unit_kes,customer_unit_kes
 from public.weekend_shopping_items where cycle_id=v_last.id;
 return v_new;
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
 select coalesce(sum(amount_kes),0) into v_pending from public.weekend_shopping_payments
 where cycle_id=p_cycle_id and status='pending';
 if p_amount>v_cycle.amount_due_kes-v_cycle.verified_paid_kes-v_pending then
   raise exception 'Amount exceeds outstanding unclaimed balance';
 end if;
 insert into public.weekend_shopping_payments(cycle_id,customer_id,amount_kes,payment_reference)
 values(p_cycle_id,v_user,p_amount,trim(p_reference)) returning id into v_id;
 return v_id;
end $function$
;
revoke execute on function public.customer_generate_next_weekend_cycle(uuid) from public,anon;
grant execute on function public.customer_generate_next_weekend_cycle(uuid) to authenticated;
