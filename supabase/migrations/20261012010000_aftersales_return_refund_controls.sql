-- Operational controls for Aftersales returns and offline refunds.
-- Money NEVER moves from these records. Seller/Customer cannot write refund settlement state.
create table if not exists public.aftersales_refund_reviews(
 case_id uuid primary key references public.marketplace_aftersales_cases(id) on delete restrict,
 amount_kes numeric(12,2) not null check(amount_kes>0),
 status text not null default 'awaiting_inspection'
   check(status in ('awaiting_inspection','inspection_approved','inspection_rejected','payment_pending','paid')),
 inspection_note text,
 inspection_by uuid,
 inspection_at timestamptz,
 payment_reference text,
 payment_note text,
 paid_by uuid,
 paid_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.aftersales_refund_reviews enable row level security;
revoke all on public.aftersales_refund_reviews from anon,authenticated;
create or replace function public.admin_aftersales_refund_action(p_case_id uuid,p_action text,p_note text default null,p_reference text default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_case public.marketplace_aftersales_cases%rowtype; v_n public.marketplace_aftersales_negotiations%rowtype;
 v_return public.pickup_station_return_parcels%rowtype; v_amount numeric; v_review public.aftersales_refund_reviews%rowtype;
begin
 if not private.is_leogo_admin('settlements.manage') then raise exception 'Settlement management authorization required'; end if;
 if p_action not in ('approve_inspection','reject_inspection','record_payment_pending','record_payment_paid') then raise exception 'Invalid action'; end if;
 if length(coalesce(p_note,''))>2000 then raise exception 'Note too long'; end if;
 select * into v_case from public.marketplace_aftersales_cases where id=p_case_id for update;
 if not found then raise exception 'Case not found'; end if;
 select * into v_n from public.marketplace_aftersales_negotiations where case_id=p_case_id;
 if v_n.stage<>'customer_accepted' or v_n.solution_kind<>'return_refund' then raise exception 'Customer must accept a seller return/refund solution'; end if;
 if v_case.order_item_id is null or v_case.requested_refund_amount_kes is null then raise exception 'Item and refund amount must be recorded'; end if;
 select i.line_total_kes into v_amount from public.marketplace_order_items i where id=v_case.order_item_id and i.order_id=v_case.order_id;
 if not found or v_case.requested_refund_amount_kes<=0 or v_case.requested_refund_amount_kes>v_amount then
  raise exception 'Refund must not exceed purchased item price excluding shipping'; end if;
 select * into v_return from public.pickup_station_return_parcels where aftersales_case_id=p_case_id;
 if not found or v_return.status not in ('received_at_station','dispatched','completed') then
  raise exception 'Physical return receipt must be verified in Pickup Station returns first'; end if;
 insert into public.aftersales_refund_reviews(case_id,amount_kes)
 values(p_case_id,v_case.requested_refund_amount_kes)
 on conflict(case_id) do nothing;
 select * into v_review from public.aftersales_refund_reviews where case_id=p_case_id for update;
 if v_review.status='paid' then raise exception 'Refund already recorded as paid'; end if;
 if p_action='approve_inspection' then
  if v_review.status not in ('awaiting_inspection','inspection_rejected') then raise exception 'Inspection already processed'; end if;
  if length(btrim(coalesce(p_note,'')))<5 then raise exception 'Inspection notes are required'; end if;
  update public.aftersales_refund_reviews set status='inspection_approved',inspection_note=btrim(p_note),
    inspection_by=auth.uid(),inspection_at=now(),updated_at=now() where case_id=p_case_id;
 elsif p_action='reject_inspection' then
  if v_review.status not in ('awaiting_inspection','inspection_approved') then raise exception 'Inspection cannot be rejected at this stage'; end if;
  if length(btrim(coalesce(p_note,'')))<5 then raise exception 'Reason required'; end if;
  update public.aftersales_refund_reviews set status='inspection_rejected',inspection_note=btrim(p_note),
    inspection_by=auth.uid(),inspection_at=now(),updated_at=now() where case_id=p_case_id;
 elsif p_action='record_payment_pending' then
  if v_review.status<>'inspection_approved' then raise exception 'Inspection approval required'; end if;
  update public.aftersales_refund_reviews set status='payment_pending',payment_note=nullif(btrim(p_note),''),
    updated_at=now() where case_id=p_case_id;
 else
  if v_review.status<>'payment_pending' then raise exception 'Refund must be approved and marked payment pending first'; end if;
  if length(btrim(coalesce(p_reference,'')))<3 then raise exception 'External payment reference required'; end if;
  update public.aftersales_refund_reviews set status='paid',payment_reference=btrim(p_reference),
    payment_note=nullif(btrim(p_note),''),paid_by=auth.uid(),paid_at=now(),updated_at=now() where case_id=p_case_id;
  insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view)
   values(v_case.customer_id,'aftersales','Aftersales refund recorded',
    'LEOGO has recorded the refund for case '||v_case.case_reference||'. Reference: '||btrim(p_reference)||'.',
    'marketplace_aftersales_case',p_case_id,'aftersales_refund_paid','aftersales');
 end if;
 return (select to_jsonb(r) from public.aftersales_refund_reviews r where r.case_id=p_case_id);
end;$fn$;
revoke all on function public.admin_aftersales_refund_action(uuid,text,text,text) from public,anon;
grant execute on function public.admin_aftersales_refund_action(uuid,text,text,text) to authenticated;
create or replace function public.admin_get_aftersales_refund_review(p_case_id uuid)
returns jsonb language sql stable security definer set search_path='' as $fn$
 select case when private.is_leogo_admin('settlements.manage') then
 (select to_jsonb(r) from public.aftersales_refund_reviews r where r.case_id=p_case_id)
 else null end
$fn$;
revoke all on function public.admin_get_aftersales_refund_review(uuid) from public,anon;
grant execute on function public.admin_get_aftersales_refund_review(uuid) to authenticated;
