create table if not exists public.marketplace_order_address_change_requests(
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.marketplace_orders(id),
 customer_id uuid not null references auth.users(id),
 requested_estate text not null check(length(btrim(requested_estate)) between 3 and 180),
 requested_landmark text not null check(length(btrim(requested_landmark)) between 3 and 180),
 requested_location_link text,
 customer_note text,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(), reviewed_at timestamptz,
 reviewed_by uuid,review_note text
);
create unique index if not exists one_pending_marketplace_delivery_address_change
 on public.marketplace_order_address_change_requests(order_id) where status='pending';
alter table public.marketplace_order_address_change_requests enable row level security;
revoke all on public.marketplace_order_address_change_requests from public,anon,authenticated;
create or replace function public.customer_request_marketplace_order_address_change(p_order_id uuid,p_estate text,p_landmark text,p_location_link text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v public.marketplace_orders%rowtype;v_id uuid;
begin
 select * into v from public.marketplace_orders where id=p_order_id and customer_id=auth.uid() for update;
 if not found or v.delivered_at is not null or v.order_status in ('delivered','cancelled','refunded') then
  raise exception 'Delivery address change unavailable after delivery or cancellation';end if;
 if length(btrim(coalesce(p_estate,'')))<3 or length(btrim(coalesce(p_landmark,'')))<3 then raise exception 'Provide estate and nearest landmark';end if;
 if length(coalesce(p_location_link,''))>500 or length(coalesce(p_note,''))>1000 then raise exception 'Details are too long';end if;
 insert into public.marketplace_order_address_change_requests(order_id,customer_id,requested_estate,requested_landmark,requested_location_link,customer_note)
 values(v.id,auth.uid(),btrim(p_estate),btrim(p_landmark),nullif(btrim(p_location_link),''),
 nullif(btrim(p_note),'')) returning id into v_id;
 return jsonb_build_object('ok',true,'request_id',v_id,'status','pending_admin_review');
end;$fn$;
create or replace function public.customer_list_marketplace_address_change_requests()
returns jsonb language sql stable security definer set search_path='' as $fn$
select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'order_id',r.order_id,'status',r.status,
 'review_note',r.review_note,'created_at',r.created_at) order by r.created_at desc),'[]'::jsonb)
 from public.marketplace_order_address_change_requests r where r.customer_id=auth.uid();
$fn$;
create or replace function public.admin_list_marketplace_order_address_changes()
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 if not private.is_leogo_admin('orders.manage') then raise exception 'Order management permission required';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'reference',o.order_reference,
 'status',r.status,'estate',r.requested_estate,'landmark',r.requested_landmark,
 'location_link',r.requested_location_link,'note',r.customer_note,'created_at',r.created_at,
 'order_status',o.order_status,'order_id',o.id) order by r.created_at desc),'[]'::jsonb)
 from public.marketplace_order_address_change_requests r join public.marketplace_orders o on o.id=r.order_id
 where r.status='pending');
end;$fn$;
create or replace function public.admin_review_marketplace_order_address_change(p_request_id uuid,p_approve boolean,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r public.marketplace_order_address_change_requests%rowtype;o public.marketplace_orders%rowtype;
begin
 if not private.is_leogo_admin('orders.manage') then raise exception 'Order management permission required';end if;
 if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Decision reason required';end if;
 select * into r from public.marketplace_order_address_change_requests where id=p_request_id and status='pending' for update;
 if not found then raise exception 'Pending change request not found';end if;
 select * into o from public.marketplace_orders where id=r.order_id for update;
 if p_approve then
  if o.delivered_at is not null or o.order_status in ('delivered','cancelled','refunded') then raise exception 'Order already delivered or closed';end if;
  update public.marketplace_orders set estate=r.requested_estate,landmark=r.requested_landmark,
   location_link=r.requested_location_link,updated_at=now() where id=o.id;
 end if;
 update public.marketplace_order_address_change_requests set status=case when p_approve then 'approved' else 'rejected' end,
 reviewed_at=now(),reviewed_by=auth.uid(),review_note=btrim(p_reason) where id=r.id;
 return jsonb_build_object('ok',true,'approved',p_approve);
end;$fn$;
revoke all on function public.customer_request_marketplace_order_address_change(uuid,text,text,text,text),
public.customer_list_marketplace_address_change_requests(),public.admin_list_marketplace_order_address_changes(),
public.admin_review_marketplace_order_address_change(uuid,boolean,text) from public,anon;
grant execute on function public.customer_request_marketplace_order_address_change(uuid,text,text,text,text),
public.customer_list_marketplace_address_change_requests(),public.admin_list_marketplace_order_address_changes(),
public.admin_review_marketplace_order_address_change(uuid,boolean,text) to authenticated;