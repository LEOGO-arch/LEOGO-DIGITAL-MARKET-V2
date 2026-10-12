-- Customer return shipping after physical seller inspection rejection.
-- No automatic payment charging, payout, refund or closure.
create table if not exists public.aftersales_return_shipping(
 case_id uuid primary key references public.marketplace_aftersales_cases(id) on delete restrict,
 customer_id uuid not null references auth.users(id),
 amount_kes numeric(12,2) not null check(amount_kes>0),
 status text not null default 'awaiting_payment' check(status in
  ('awaiting_payment','payment_submitted','verified','payment_rejected','expired','dispatched','received_by_customer')),
 payment_reference text,
 payment_submitted_at timestamptz,
 verified_by uuid,
 verified_at timestamptz,
 verification_notes text,
 issued_at timestamptz not null default now(),
 due_at timestamptz not null,
 dispatch_reference text,
 dispatched_at timestamptz,
 received_at timestamptz,
 created_by uuid not null,
 updated_at timestamptz not null default now()
);
create unique index if not exists aftersales_return_shipping_payment_ref_unique
 on public.aftersales_return_shipping(lower(btrim(payment_reference)))
 where payment_reference is not null and status in ('payment_submitted','verified','dispatched','received_by_customer');
alter table public.aftersales_return_shipping enable row level security;
revoke all on public.aftersales_return_shipping from anon,authenticated;
create or replace function public.aftersales_seller_mark_repacked(p_case_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_seller uuid:=(select auth.uid());
begin
 if length(btrim(coalesce(p_note,'')))<5 or length(p_note)>2000 then raise exception 'Describe repacking and parcel readiness';end if;
 update public.aftersales_seller_inspections set ready_return_at=now(),
 inspection_notes=concat_ws(' | ',inspection_notes,'Repacked: '||btrim(p_note)),updated_at=now()
 where case_id=p_case_id and seller_id=v_seller and recommendation='reject'
  and inspected_at is not null and ready_return_at is null
  and exists(select 1 from public.marketplace_aftersales_negotiations n
   where n.case_id=p_case_id and n.seller_id=v_seller and n.stage='seller_rejected');
 if not found then raise exception 'Only a rejected, inspected item may be marked repacked once';end if;
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(p_case_id,v_seller,'seller','repacked_for_customer_return',left(p_note,2000));
 insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view)
 select c.customer_id,'aftersales','Rejected item prepared for return',
 'Case '||c.case_reference||': Seller has repacked your item. LEOGO will issue return shipping instructions.',
 'marketplace_aftersales_case',c.id,'aftersales_return_repacked','aftersales'
 from public.marketplace_aftersales_cases c where c.id=p_case_id;
 return jsonb_build_object('ok',true,'status','ready_for_customer_return');
end;$fn$;
create or replace function public.admin_aftersales_issue_return_shipping(p_case_id uuid,p_amount_kes numeric,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_customer uuid;v_ref text;
begin
 if not private.is_leogo_admin('orders.manage') then raise exception 'Admin return management required';end if;
 if p_amount_kes is null or p_amount_kes<=0 or p_amount_kes>100000 then raise exception 'Enter a valid return shipping fee';end if;
 if length(btrim(coalesce(p_note,'')))<5 then raise exception 'Document return shipping calculation';end if;
 select c.customer_id,c.case_reference into v_customer,v_ref
 from public.marketplace_aftersales_cases c
 join public.marketplace_aftersales_negotiations n on n.case_id=c.id
 join public.aftersales_seller_inspections i on i.case_id=c.id
 where c.id=p_case_id and n.stage='seller_rejected' and i.recommendation='reject'
 and i.ready_return_at is not null;
 if v_customer is null then raise exception 'Seller must inspect, reject and repack the product before setting return fee';end if;
 insert into public.aftersales_return_shipping(case_id,customer_id,amount_kes,due_at,created_by,verification_notes)
 values(p_case_id,v_customer,p_amount_kes,now()+interval '7 days',(select auth.uid()),left(btrim(p_note),2000));
 insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view)
 values(v_customer,'aftersales','Return shipping fee due',
 'Case '||v_ref||': Pay KSh '||p_amount_kes||' return shipping within 7 days using the LEOGO account shown in your Aftersales page.',
 'marketplace_aftersales_case',p_case_id,'aftersales_return_fee_issued','aftersales');
 return jsonb_build_object('ok',true,'case_id',p_case_id,'fee_kes',p_amount_kes,'due_at',now()+interval '7 days');
end;$fn$;
create or replace function public.customer_aftersales_submit_return_shipping_payment(p_case_id uuid,p_reference text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
begin
 if length(btrim(coalesce(p_reference,'')))<5 or length(p_reference)>250 then raise exception 'Provide payment transaction reference';end if;
 update public.aftersales_return_shipping set payment_reference=btrim(p_reference),
  payment_submitted_at=now(),status='payment_submitted',updated_at=now()
 where case_id=p_case_id and customer_id=(select auth.uid())
   and status in ('awaiting_payment','payment_rejected') and due_at>=clock_timestamp()
   and exists(select 1 from public.marketplace_aftersales_negotiations n where n.case_id=p_case_id and n.stage='seller_rejected');
 if not found then raise exception 'Return shipping invoice unavailable or expired';end if;
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(p_case_id,(select auth.uid()),'customer','return_shipping_payment_submitted','Payment proof submitted for LEOGO verification');
 return jsonb_build_object('ok',true,'status','payment_submitted');
end;$fn$;
create or replace function public.admin_aftersales_verify_return_shipping_payment(p_case_id uuid,p_approve boolean,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_customer uuid;v_status text;
begin
 if not private.is_leogo_admin('orders.payment_verify') then raise exception 'Payment verification permission required';end if;
 if length(btrim(coalesce(p_note,'')))<5 then raise exception 'Verification notes required';end if;
 update public.aftersales_return_shipping set status=case when p_approve then 'verified' else 'payment_rejected' end,
 verified_by=(select auth.uid()),verified_at=now(),verification_notes=btrim(p_note),updated_at=now()
 where case_id=p_case_id and status='payment_submitted'
 returning customer_id,status into v_customer,v_status;
 if v_customer is null then raise exception 'No pending return shipping proof';end if;
 insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view)
 values(v_customer,'aftersales','Return shipping payment updated',
 'LEOGO marked your return shipping payment as '||v_status||'.',
 'marketplace_aftersales_case',p_case_id,'aftersales_return_fee_'||v_status,'aftersales');
 return jsonb_build_object('ok',true,'status',v_status);
end;$fn$;
create or replace function public.admin_aftersales_dispatch_customer_return(p_case_id uuid,p_tracking_reference text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_customer uuid;
begin
 if not private.is_leogo_admin('delivery.manage') then raise exception 'Delivery management permission required';end if;
 if length(btrim(coalesce(p_tracking_reference,'')))<5 then raise exception 'Provide return dispatch tracking reference';end if;
 update public.aftersales_return_shipping set status='dispatched',
 dispatch_reference=btrim(p_tracking_reference),dispatched_at=now(),updated_at=now()
 where case_id=p_case_id and status='verified'
 and exists(select 1 from public.marketplace_aftersales_negotiations n where n.case_id=p_case_id and n.stage='seller_rejected')
 returning customer_id into v_customer;
 if v_customer is null then raise exception 'Payment must be verified before return dispatch';end if;
 insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view)
 values(v_customer,'aftersales','Your rejected item is on its way',
 'Return tracking: '||btrim(p_tracking_reference)||'. Please confirm when you receive your item.',
 'marketplace_aftersales_case',p_case_id,'aftersales_customer_return_dispatched','aftersales');
 return jsonb_build_object('ok',true,'status','dispatched');
end;$fn$;
create or replace function public.customer_aftersales_confirm_rejected_item_received(p_case_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
begin
 update public.aftersales_return_shipping set status='received_by_customer',received_at=now(),updated_at=now()
 where case_id=p_case_id and customer_id=(select auth.uid()) and status='dispatched';
 if not found then raise exception 'Return parcel must be dispatched first';end if;
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(p_case_id,(select auth.uid()),'customer','rejected_item_received','Customer confirmed receiving the returned item');
 return jsonb_build_object('ok',true,'status','received_by_customer');
end;$fn$;
create or replace function public.admin_aftersales_close_rejected_return(p_case_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_status text;v_customer uuid;
begin
 if not private.is_leogo_admin('orders.manage') then raise exception 'Aftersales closure permission required';end if;
 if length(btrim(coalesce(p_note,'')))<5 then raise exception 'Closure reason required';end if;
 select r.status,r.customer_id into v_status,v_customer
 from public.aftersales_return_shipping r
 join public.marketplace_aftersales_negotiations n on n.case_id=r.case_id
 where r.case_id=p_case_id and n.stage='seller_rejected' for update of r;
 if v_status is null then raise exception 'Case is not eligible for rejection closure or intervention is pending';end if;
 if v_status in ('awaiting_payment','payment_rejected') and exists(select 1 from public.aftersales_return_shipping where case_id=p_case_id and due_at<clock_timestamp()) then
  update public.aftersales_return_shipping set status='expired',updated_at=now() where case_id=p_case_id;
  v_status='expired';
 end if;
 if v_status not in ('expired','received_by_customer') then
   raise exception 'Close only after customer receives returned product or 7-day unpaid return fee expires';end if;
 update public.marketplace_aftersales_negotiations set stage='closed',admin_comment=btrim(p_note),updated_at=now()
 where case_id=p_case_id;
 update public.marketplace_aftersales_cases set status='rejected',admin_notes=btrim(p_note),updated_at=now()
 where id=p_case_id;
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(p_case_id,(select auth.uid()),'admin','closed_'||v_status,left(btrim(p_note),2000));
 insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view)
 values(v_customer,'aftersales','Aftersales case closed',
 'LEOGO closed this aftersales case. Reason: '||left(btrim(p_note),700),
 'marketplace_aftersales_case',p_case_id,'aftersales_rejection_closed','aftersales');
 return jsonb_build_object('ok',true,'status','closed','reason',v_status);
end;$fn$;
create or replace function public.aftersales_customer_return_shipping_status()
returns jsonb language sql stable security definer set search_path='' as $fn$
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)
 from public.aftersales_return_shipping r where r.customer_id=(select auth.uid())
$fn$;
create or replace function public.admin_aftersales_return_shipping_list()
returns jsonb language sql stable security definer set search_path='' as $fn$
 select case when private.is_leogo_admin('orders.manage') then
   coalesce(jsonb_agg(to_jsonb(r) order by r.issued_at desc),'[]'::jsonb)
  else '[]'::jsonb end
 from public.aftersales_return_shipping r
$fn$;
revoke all on function public.aftersales_seller_mark_repacked(uuid,text) from public,anon;
grant execute on function public.aftersales_seller_mark_repacked(uuid,text) to authenticated;
revoke all on function public.admin_aftersales_issue_return_shipping(uuid,numeric,text) from public,anon;
grant execute on function public.admin_aftersales_issue_return_shipping(uuid,numeric,text) to authenticated;
revoke all on function public.customer_aftersales_submit_return_shipping_payment(uuid,text) from public,anon;
grant execute on function public.customer_aftersales_submit_return_shipping_payment(uuid,text) to authenticated;
revoke all on function public.admin_aftersales_verify_return_shipping_payment(uuid,boolean,text) from public,anon;
grant execute on function public.admin_aftersales_verify_return_shipping_payment(uuid,boolean,text) to authenticated;
revoke all on function public.admin_aftersales_dispatch_customer_return(uuid,text) from public,anon;
grant execute on function public.admin_aftersales_dispatch_customer_return(uuid,text) to authenticated;
revoke all on function public.customer_aftersales_confirm_rejected_item_received(uuid) from public,anon;
grant execute on function public.customer_aftersales_confirm_rejected_item_received(uuid) to authenticated;
revoke all on function public.admin_aftersales_close_rejected_return(uuid,text) from public,anon;
grant execute on function public.admin_aftersales_close_rejected_return(uuid,text) to authenticated;
revoke all on function public.aftersales_customer_return_shipping_status() from public,anon;
grant execute on function public.aftersales_customer_return_shipping_status() to authenticated;
revoke all on function public.admin_aftersales_return_shipping_list() from public,anon;
grant execute on function public.admin_aftersales_return_shipping_list() to authenticated;
