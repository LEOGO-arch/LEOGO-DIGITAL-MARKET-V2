-- LEOGO Weekend Shopping staging-only; manual verified funding, no automatic payout or order dispatch.
create table if not exists public.weekend_shopping_plans(
id uuid primary key default gen_random_uuid(),customer_id uuid not null references auth.users(id),
cadence text not null check(cadence in('once','weekly')),preferred_weekday integer check(preferred_weekday between 0 and 6),
delivery_date date not null,status text not null default 'funding' check(status in('funding','paused','cancelled','completed')),
county text,sub_county text,estate text,landmark text,delivery_notes text,created_at timestamptz not null default now(),
check((cadence='once' and preferred_weekday is null) or(cadence='weekly' and preferred_weekday is not null)));
create table if not exists public.weekend_shopping_cycles(
id uuid primary key default gen_random_uuid(),plan_id uuid not null references public.weekend_shopping_plans(id),
cycle_no int not null check(cycle_no>0),delivery_date date not null,items_total_kes numeric(12,2) not null check(items_total_kes>0),
delivery_fee_kes numeric(12,2) not null default 0 check(delivery_fee_kes>=0),
service_fee_kes numeric(12,2) not null default 0 check(service_fee_kes>=0),
amount_due_kes numeric(12,2) generated always as(items_total_kes+delivery_fee_kes+service_fee_kes) stored,
verified_paid_kes numeric(12,2) not null default 0 check(verified_paid_kes>=0),
status text not null default 'funding' check(status in('funding','funded','release_ready','released','cancelled')),
released_order_id uuid references public.marketplace_orders(id),created_at timestamptz not null default now(),
unique(plan_id,cycle_no),check(verified_paid_kes<=items_total_kes+delivery_fee_kes+service_fee_kes));
create table if not exists public.weekend_shopping_items(
id uuid primary key default gen_random_uuid(),cycle_id uuid not null references public.weekend_shopping_cycles(id),
product_id uuid not null references public.seller_products(id),variant_id uuid references public.seller_product_variants(id),
seller_id uuid not null,product_name text not null,qty numeric(12,2) not null check(qty>0),
seller_unit_kes numeric(12,2) not null check(seller_unit_kes>=0),
customer_unit_kes numeric(12,2) not null check(customer_unit_kes>=0),unique(cycle_id,product_id,variant_id));
create table if not exists public.weekend_shopping_payments(
id uuid primary key default gen_random_uuid(),cycle_id uuid not null references public.weekend_shopping_cycles(id),
customer_id uuid not null references auth.users(id),amount_kes numeric(12,2) not null check(amount_kes>0),
payment_reference text not null unique,status text not null default 'pending' check(status in('pending','verified','rejected')),
verified_by uuid,verified_at timestamptz,created_at timestamptz not null default now());
create index if not exists weekend_plans_owner_idx on public.weekend_shopping_plans(customer_id);
create index if not exists weekend_cycles_plan_idx on public.weekend_shopping_cycles(plan_id);
create index if not exists weekend_payments_cycle_idx on public.weekend_shopping_payments(cycle_id);
alter table public.weekend_shopping_plans enable row level security;
alter table public.weekend_shopping_cycles enable row level security;
alter table public.weekend_shopping_items enable row level security;
alter table public.weekend_shopping_payments enable row level security;
create policy weekend_owner_plans on public.weekend_shopping_plans for select to authenticated using(customer_id=(select auth.uid()));
create policy weekend_owner_cycles on public.weekend_shopping_cycles for select to authenticated
using(exists(select 1 from public.weekend_shopping_plans p where p.id=plan_id and p.customer_id=(select auth.uid())));
create policy weekend_owner_items on public.weekend_shopping_items for select to authenticated
using(exists(select 1 from public.weekend_shopping_cycles c join public.weekend_shopping_plans p on p.id=c.plan_id where c.id=cycle_id and p.customer_id=(select auth.uid())));
create policy weekend_owner_payments on public.weekend_shopping_payments for select to authenticated using(customer_id=(select auth.uid()));
grant select on public.weekend_shopping_plans,public.weekend_shopping_cycles,public.weekend_shopping_items,public.weekend_shopping_payments to authenticated;
revoke all on public.weekend_shopping_plans,public.weekend_shopping_cycles,public.weekend_shopping_items,public.weekend_shopping_payments from anon;

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
 or v_cycle.delivery_date>current_date then raise exception 'Full payment and scheduled date required'; end if;
 update public.weekend_shopping_cycles set status='release_ready' where id=p_cycle_id;
 -- No marketplace order is created or seller paid by this function.
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_review_weekend_payment(p_payment_id uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_payment record;v_cycle record;
begin
 if auth.uid() is null or not private.is_leogo_admin() then raise exception 'Admin permission required'; end if;
 select * into v_payment from public.weekend_shopping_payments where id=p_payment_id for update;
 if not found or v_payment.status<>'pending' then raise exception 'Payment already reviewed or missing'; end if;
 select * into v_cycle from public.weekend_shopping_cycles where id=v_payment.cycle_id for update;
 if p_approve then
  if v_cycle.status<>'funding' then raise exception 'Cycle not open'; end if;
  if v_cycle.verified_paid_kes+v_payment.amount_kes>v_cycle.amount_due_kes then raise exception 'Exceeds cycle balance'; end if;
  update public.weekend_shopping_cycles set verified_paid_kes=verified_paid_kes+v_payment.amount_kes,
   status=case when verified_paid_kes+v_payment.amount_kes=amount_due_kes then 'funded' else 'funding' end
   where id=v_cycle.id;
 end if;
 update public.weekend_shopping_payments
 set status=case when p_approve then 'verified' else 'rejected' end,
 verified_at=now(),verified_by=auth.uid() where id=p_payment_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.customer_create_weekend_shopping(p_items jsonb, p_date date, p_cadence text, p_county text DEFAULT NULL::text, p_sub_county text DEFAULT NULL::text, p_estate text DEFAULT NULL::text, p_landmark text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=auth.uid(); v_plan uuid;v_cycle uuid;v_item jsonb;v_product record;v_variant record;
 v_qty numeric;v_seller numeric;v_customer numeric;v_total numeric:=0;v_n int:=0;v_day int;
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
  v_qty:=(v_item->>'quantity')::numeric;
  if v_qty is null or v_qty<=0 or v_qty>100 or v_qty<>trunc(v_qty) then raise exception 'Invalid item quantity'; end if;
  select * into v_product from public.seller_products where id=(v_item->>'product_id')::uuid
    and product_approval_status='approved' and listing_status='active' and availability_status='available' for share;
  if not found then raise exception 'Product unavailable'; end if;
  if v_item ? 'variant_id' and nullif(v_item->>'variant_id','') is not null then
   select * into v_variant from public.seller_product_variants
     where id=(v_item->>'variant_id')::uuid and product_id=v_product.id and is_active for share;
   if not found then raise exception 'Variation unavailable'; end if;
   v_seller:=v_variant.price_kes;v_customer:=coalesce(v_variant.leogo_price_kes,v_seller);
  else
   if v_product.has_variants then raise exception 'Choose a variation'; end if;
   v_seller:=v_product.price_kes;v_customer:=coalesce(v_product.leogo_price_kes,v_seller);
  end if;
  if v_seller is null or v_customer is null or v_seller<0 or v_customer<=0 then raise exception 'Invalid item price'; end if;
  insert into public.weekend_shopping_items(cycle_id,product_id,variant_id,seller_id,product_name,qty,seller_unit_kes,customer_unit_kes)
  values(v_cycle,v_product.id,case when v_item ? 'variant_id' and nullif(v_item->>'variant_id','') is not null then v_variant.id else null end,
   v_product.seller_id,v_product.product_name,v_qty,v_seller,v_customer);
  v_total:=v_total+round(v_customer*v_qty,2);v_n:=v_n+1;
 end loop;
 update public.weekend_shopping_cycles set items_total_kes=v_total where id=v_cycle;
 return v_plan;
end $function$
;

CREATE OR REPLACE FUNCTION public.customer_submit_weekend_payment(p_cycle_id uuid, p_amount numeric, p_reference text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=auth.uid();v_cycle record;v_id uuid;
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Invalid amount'; end if;
 if length(trim(coalesce(p_reference,'')))<6 then raise exception 'Payment reference required'; end if;
 select c.* into v_cycle from public.weekend_shopping_cycles c
 join public.weekend_shopping_plans p on p.id=c.plan_id where c.id=p_cycle_id and p.customer_id=v_user
 and p.status='funding' and c.status='funding' for update of c;
 if not found then raise exception 'Cycle not accepting payments'; end if;
 if p_amount>v_cycle.amount_due_kes-v_cycle.verified_paid_kes then raise exception 'Amount exceeds outstanding balance'; end if;
 insert into public.weekend_shopping_payments(cycle_id,customer_id,amount_kes,payment_reference)
 values(p_cycle_id,v_user,p_amount,trim(p_reference)) returning id into v_id;
 return v_id;
end $function$
;
revoke execute on function public.customer_create_weekend_shopping(jsonb,date,text,text,text,text,text),public.customer_submit_weekend_payment(uuid,numeric,text),public.admin_review_weekend_payment(uuid,boolean),public.admin_mark_weekend_release_ready(uuid) from public,anon;
grant execute on function public.customer_create_weekend_shopping(jsonb,date,text,text,text,text,text),public.customer_submit_weekend_payment(uuid,numeric,text),public.admin_review_weekend_payment(uuid,boolean),public.admin_mark_weekend_release_ready(uuid) to authenticated;
