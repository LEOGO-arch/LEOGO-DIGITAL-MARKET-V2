-- Aftersales v2 staged policy extension: item-specific seller routing, 7-day filing, capped refund request,
-- 3-day response deadline, approved return pickup station selection. No automatic payment execution.
create table if not exists public.aftersales_deadline_extensions (
 order_id uuid primary key references public.marketplace_orders(id) on delete cascade,
 valid_until timestamptz not null,
 granted_by uuid not null,
 reason text not null,
 updated_at timestamptz not null default now()
);
alter table public.aftersales_deadline_extensions enable row level security;
revoke all on public.aftersales_deadline_extensions from anon,authenticated;
alter table public.marketplace_aftersales_cases
 add column if not exists order_item_id uuid references public.marketplace_order_items(id),
 add column if not exists requested_refund_amount_kes numeric(12,2),
 add column if not exists return_pickup_station_id uuid references public.pickup_stations(id);
alter table public.marketplace_aftersales_negotiations
 add column if not exists solution_kind text,
 add column if not exists proposed_at timestamptz,
 add column if not exists response_due_at timestamptz;
create or replace function private.enforce_aftersales_filing_window() returns trigger
language plpgsql security definer set search_path='' as $fn$
declare v_delivered timestamptz; v_extension timestamptz;
begin
 select delivered_at into v_delivered from public.marketplace_orders where id=new.order_id;
 if v_delivered is null then raise exception 'Order delivery must be confirmed before Aftersales'; end if;
 select valid_until into v_extension from public.aftersales_deadline_extensions where order_id=new.order_id;
 if now()>v_delivered+interval '7 days' and now()>coalesce(v_extension,'-infinity'::timestamptz) then
   raise exception 'The 7-day Aftersales period has expired. Contact LEOGO Customer Care to request reactivation';
 end if;
 return new;
end;$fn$;
drop trigger if exists leogo_aftersales_filing_window on public.marketplace_aftersales_cases;
create trigger leogo_aftersales_filing_window before insert on public.marketplace_aftersales_cases
for each row execute function private.enforce_aftersales_filing_window();
create or replace function public.admin_extend_aftersales_filing(p_order_id uuid,p_valid_until timestamptz,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
begin
 if not private.is_leogo_admin('orders.manage') then raise exception 'Orders management access required'; end if;
 if p_valid_until<=now() or p_valid_until>now()+interval '30 days' then raise exception 'Choose an extension within 30 days'; end if;
 if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'An extension reason is required'; end if;
 if not exists(select 1 from public.marketplace_orders where id=p_order_id) then raise exception 'Order not found'; end if;
 insert into public.aftersales_deadline_extensions(order_id,valid_until,granted_by,reason)
 values(p_order_id,p_valid_until,auth.uid(),left(btrim(p_reason),1000))
 on conflict(order_id) do update set valid_until=excluded.valid_until,granted_by=excluded.granted_by,
 reason=excluded.reason,updated_at=now();
 return jsonb_build_object('ok',true,'valid_until',p_valid_until);
end;$fn$;
revoke all on function public.admin_extend_aftersales_filing(uuid,timestamptz,text) from public,anon;
grant execute on function public.admin_extend_aftersales_filing(uuid,timestamptz,text) to authenticated;
create or replace function public.customer_list_aftersales_order_items(p_order_id uuid)
returns table(item_id uuid,product_name text,seller_id uuid,item_total numeric) language sql stable security definer set search_path='' as $fn$
 select i.id,i.product_name,i.seller_id,i.line_total_kes from public.marketplace_order_items i
 join public.marketplace_orders o on o.id=i.order_id
 where i.order_id=p_order_id and o.customer_id=auth.uid() and o.order_status='delivered'
 order by i.created_at
$fn$;
revoke all on function public.customer_list_aftersales_order_items(uuid) from public,anon;
grant execute on function public.customer_list_aftersales_order_items(uuid) to authenticated;
create or replace function public.customer_submit_marketplace_aftersales_v2(
 p_order_id uuid,p_order_item_id uuid,p_issue_type text,p_preferred_solution text,
 p_details text,p_requested_refund_amount_kes numeric default null,p_evidence_path text default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_item public.marketplace_order_items%rowtype; v_result jsonb; v_case uuid;
begin
 select i.* into v_item from public.marketplace_order_items i join public.marketplace_orders o on o.id=i.order_id
 where i.id=p_order_item_id and i.order_id=p_order_id and o.customer_id=auth.uid() for share of i;
 if not found then raise exception 'Select an item actually purchased in this order'; end if;
 if p_preferred_solution='refund_review' then
  if p_requested_refund_amount_kes is null or p_requested_refund_amount_kes<=0
     or p_requested_refund_amount_kes>v_item.line_total_kes then
    raise exception 'Requested refund must be above zero and not exceed the purchased item value, excluding shipping';
  end if;
 elsif p_requested_refund_amount_kes is not null then
  raise exception 'Refund amount is only permitted for a refund request';
 end if;
 select public.customer_submit_marketplace_aftersales(p_order_id,p_issue_type,p_preferred_solution,p_details,p_evidence_path) into v_result;
 v_case:=(v_result->>'case_id')::uuid;
 update public.marketplace_aftersales_cases set order_item_id=p_order_item_id,
 requested_refund_amount_kes=p_requested_refund_amount_kes where id=v_case;
 if not exists(select 1 from public.marketplace_aftersales_negotiations where case_id=v_case) then
  insert into public.marketplace_aftersales_negotiations(case_id,seller_id,stage,admin_comment)
  values(v_case,v_item.seller_id,'forwarded','Automatically assigned from purchased order item');
  insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
  values(v_case,auth.uid(),'customer','submitted_to_seller','Customer selected the purchased item for Seller review');
 end if;
 return v_result || jsonb_build_object('order_item_id',p_order_item_id);
end;$fn$;
revoke all on function public.customer_submit_marketplace_aftersales_v2(uuid,uuid,text,text,text,numeric,text) from public,anon;
grant execute on function public.customer_submit_marketplace_aftersales_v2(uuid,uuid,text,text,text,numeric,text) to authenticated;
create or replace function private.aftersales_proposal_deadline() returns trigger
language plpgsql security definer set search_path='' as $fn$
begin
 if new.stage='seller_proposed' and (old.stage is distinct from 'seller_proposed') then
  new.proposed_at=now();new.response_due_at=now()+interval '3 days';
 end if;
 if old.stage='seller_proposed' and new.stage in ('customer_accepted','customer_rejected')
   and (old.response_due_at is not null and now()>old.response_due_at) then
  raise exception 'The three-day seller solution response window has expired';
 end if;
 return new;
end;$fn$;
drop trigger if exists leogo_aftersales_proposal_deadline on public.marketplace_aftersales_negotiations;
create trigger leogo_aftersales_proposal_deadline before update of stage on public.marketplace_aftersales_negotiations
for each row execute function private.aftersales_proposal_deadline();
create or replace function public.aftersales_seller_propose_v2(p_case_id uuid,p_solution_kind text,p_solution text,p_comment text default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_result jsonb;
begin
 if p_solution_kind not in ('return_refund','return_exchange','replacement','other') then
  raise exception 'Select return/refund, return/exchange, replacement or other solution'; end if;
 select public.aftersales_seller_respond(p_case_id,'propose',p_solution,p_comment) into v_result;
 update public.marketplace_aftersales_negotiations set solution_kind=p_solution_kind
 where case_id=p_case_id and seller_id=auth.uid();
 return v_result;
end;$fn$;
revoke all on function public.aftersales_seller_propose_v2(uuid,text,text,text) from public,anon;
grant execute on function public.aftersales_seller_propose_v2(uuid,text,text,text) to authenticated;
create or replace function public.customer_choose_aftersales_return_station(p_case_id uuid,p_station_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_item uuid;
begin
 select c.id into v_item from public.marketplace_aftersales_cases c
 join public.marketplace_aftersales_negotiations n on n.case_id=c.id
 where c.id=p_case_id and c.customer_id=auth.uid() and n.stage='customer_accepted'
 and n.solution_kind in ('return_refund','return_exchange');
 if not found then raise exception 'Return pickup is available only after accepting an approved return solution'; end if;
 if not exists(select 1 from public.pickup_stations where id=p_station_id and is_active=true) then
  raise exception 'Choose an active LEOGO Pickup Station'; end if;
 update public.marketplace_aftersales_cases set return_pickup_station_id=p_station_id where id=p_case_id;
 return jsonb_build_object('ok',true,'pickup_station_id',p_station_id);
end;$fn$;
revoke all on function public.customer_choose_aftersales_return_station(uuid,uuid) from public,anon;
grant execute on function public.customer_choose_aftersales_return_station(uuid,uuid) to authenticated;

create or replace function public.customer_list_aftersales_return_stations()
returns table(id uuid,station_name text,county text,town text)
language sql stable security definer set search_path='' as $fn$
 select s.id,s.station_name,s.county,s.town from public.pickup_stations s
 where s.is_active=true and auth.uid() is not null order by s.station_name
$fn$;
revoke all on function public.customer_list_aftersales_return_stations() from public,anon;
grant execute on function public.customer_list_aftersales_return_stations() to authenticated;
create or replace function private.expire_aftersales_customer_responses()
returns integer language plpgsql security definer set search_path='' as $fn$
declare v record; v_count int:=0;
begin
 for v in
  select n.case_id,c.customer_id,c.case_reference,n.seller_id
    from public.marketplace_aftersales_negotiations n
    join public.marketplace_aftersales_cases c on c.id=n.case_id
    where n.stage='seller_proposed' and n.response_due_at<now()
    and c.status not in ('cancelled','resolved','rejected')
    for update of n skip locked
 loop
  update public.marketplace_aftersales_negotiations
    set stage='closed',updated_at=now(),customer_comment='Automatically cancelled: customer did not respond within 3 days'
    where case_id=v.case_id;
  update public.marketplace_aftersales_cases set status='cancelled',updated_at=now() where id=v.case_id;
  insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
    values(v.case_id,v.customer_id,'customer','response_deadline_expired',
      'System automatically closed case after three-day response deadline');
  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view)
    values(v.customer_id,'aftersales','Aftersales response expired',
    'Case '||v.case_reference||' was cancelled because the proposed seller solution was not accepted or rejected within 3 days.',
    'marketplace_aftersales_case',v.case_id,'aftersales_response_expired','aftersales');
  v_count:=v_count+1;
 end loop;
 return v_count;
end;$fn$;
revoke all on function private.expire_aftersales_customer_responses() from public,anon,authenticated;

create or replace function public.aftersales_list_negotiations()
returns jsonb language sql stable security definer set search_path='' as $fn$
 select coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at desc),'[]'::jsonb) from (
  select n.*,c.customer_id,c.order_id,c.case_reference,c.issue_type,c.details,c.preferred_solution,c.requested_refund_amount_kes,c.return_pickup_station_id,i.product_name,
   coalesce((select jsonb_agg(jsonb_build_object('event_type',e.event_type,'actor_role',e.actor_role,'comment',e.comment,'created_at',e.created_at) order by e.created_at)
    from public.marketplace_aftersales_negotiation_events e where e.case_id=n.case_id),'[]'::jsonb) as history
  from public.marketplace_aftersales_negotiations n
  join public.marketplace_aftersales_cases c on c.id=n.case_id
  left join public.marketplace_order_items i on i.id=c.order_item_id
  where private.is_leogo_admin('orders.manage') or n.seller_id=auth.uid() or c.customer_id=auth.uid()
 ) q
$fn$;

-- Admin resolves filing reactivation using selected case, without manually entering order UUID.
create or replace function public.aftersales_extend_selected_case_order(p_case_id uuid,p_valid_until timestamptz,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_order uuid;
begin
 if not private.is_leogo_admin('orders.manage') then raise exception 'Orders management access required'; end if;
 select order_id into v_order from public.marketplace_aftersales_cases where id=p_case_id;
 if v_order is null then raise exception 'Aftersales case not found'; end if;
 return public.admin_extend_aftersales_filing(v_order,p_valid_until,p_reason);
end;$fn$;
revoke all on function public.aftersales_extend_selected_case_order(uuid,timestamptz,text) from public,anon;
grant execute on function public.aftersales_extend_selected_case_order(uuid,timestamptz,text) to authenticated;

-- Link accepted Aftersales returns to existing Pickup Station return workflow; no automatic refund.
alter table public.pickup_station_return_parcels add column if not exists aftersales_case_id uuid references public.marketplace_aftersales_cases(id);
create unique index if not exists pickup_return_aftersales_case_unique on public.pickup_station_return_parcels(aftersales_case_id) where aftersales_case_id is not null;
create or replace function public.customer_book_aftersales_return(p_case_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_case public.marketplace_aftersales_cases%rowtype; v_order public.marketplace_orders%rowtype; v_item text; v_return uuid;
begin
 select c.* into v_case from public.marketplace_aftersales_cases c
 join public.marketplace_aftersales_negotiations n on n.case_id=c.id
 where c.id=p_case_id and c.customer_id=auth.uid() and n.stage='customer_accepted'
   and n.solution_kind in ('return_refund','return_exchange') for update of c;
 if not found then raise exception 'The seller return solution must first be accepted'; end if;
 if v_case.return_pickup_station_id is null then raise exception 'Choose a Pickup Station first'; end if;
 if not exists(select 1 from public.pickup_stations where id=v_case.return_pickup_station_id and is_active) then raise exception 'Selected Pickup Station is unavailable'; end if;
 select * into v_order from public.marketplace_orders where id=v_case.order_id;
 select product_name into v_item from public.marketplace_order_items where id=v_case.order_item_id;
 insert into public.pickup_station_return_parcels
 (return_reference,pickup_station_id,original_order_id,original_order_reference,customer_name,customer_phone,item_description,return_reason,status,booked_by,aftersales_case_id)
 values ('AFR-'||substr(replace(p_case_id::text,'-',''),1,12),v_case.return_pickup_station_id,v_order.id,v_order.order_reference,
 v_order.receiver_name,v_order.contact_number,coalesce(v_item,'Aftersales item'),v_case.issue_type,'awaiting_dispatch',auth.uid(),p_case_id)
 on conflict(aftersales_case_id) do nothing returning id into v_return;
 if v_return is null then select id into v_return from public.pickup_station_return_parcels where aftersales_case_id=p_case_id; end if;
 return jsonb_build_object('ok',true,'return_id',v_return,'return_reference','AFR-'||substr(replace(p_case_id::text,'-',''),1,12));
end;$fn$;
revoke all on function public.customer_book_aftersales_return(uuid) from public,anon;
grant execute on function public.customer_book_aftersales_return(uuid) to authenticated;
