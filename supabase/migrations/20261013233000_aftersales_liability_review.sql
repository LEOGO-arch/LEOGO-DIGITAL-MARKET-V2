-- Phase 1: auditable liability adjudication. Does not debit balances until settlement adapters are verified.
create table if not exists public.aftersales_liability_cases (
 id uuid primary key default gen_random_uuid(),
 aftersales_case_id uuid not null references public.marketplace_aftersales_cases(id) on delete restrict,
 return_id uuid references public.pickup_station_return_parcels(id) on delete restrict,
 liability_type text not null check(liability_type in ('seller','transport_provider','staff_rider','pickup_station')),
 liable_account_id uuid not null,
 charge_reason text not null check(charge_reason in ('return_station_commission','transport_damage','total_loss','station_damage','station_loss','other')),
 assessed_amount_kes numeric(14,2) not null check(assessed_amount_kes>0),
 parcel_value_kes numeric(14,2) check(parcel_value_kes is null or parcel_value_kes>=0),
 evidence_notes text not null check(length(btrim(evidence_notes)) between 15 and 3000),
 status text not null default 'pending_review' check(status in ('pending_review','approved','rejected','reversed')),
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 reviewed_by uuid,reviewed_at timestamptz,decision_notes text,
 reversed_by uuid,reversed_at timestamptz,reversal_reason text,
 constraint afs_liability_full_value_guard check(charge_reason not in ('total_loss','station_damage','station_loss') or parcel_value_kes is not null)
);
create unique index if not exists afs_liability_active_unique on public.aftersales_liability_cases(aftersales_case_id,return_id,liability_type,liable_account_id,charge_reason) where status in ('pending_review','approved');
alter table public.aftersales_liability_cases enable row level security;
revoke all on public.aftersales_liability_cases from public,anon,authenticated;
create or replace function public.admin_create_aftersales_liability(
 p_case_id uuid,p_return_id uuid,p_party text,p_account uuid,p_reason text,p_amount numeric,p_parcel_value numeric,p_evidence text)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare v_id uuid;v_order uuid;v_seller uuid;v_station uuid;
begin
 if not private.is_leogo_admin('settlements.manage') then raise exception 'Settlement management permission required';end if;
 if length(btrim(coalesce(p_evidence,'')))<15 then raise exception 'Provide documented findings and evidence';end if;
 select order_id into v_order from public.marketplace_aftersales_cases where id=p_case_id;
 if not found then raise exception 'Aftersales case not found';end if;
 if p_return_id is not null and not exists(select 1 from public.pickup_station_return_parcels where id=p_return_id and aftersales_case_id=p_case_id) then raise exception 'Return is not linked to this Aftersales case';end if;
 if p_party='seller' then
  if not exists(select 1 from public.marketplace_aftersales_negotiations n where n.case_id=p_case_id and n.seller_id=p_account) then raise exception 'Seller does not belong to case';end if;
 elsif p_party='pickup_station' then
  if not exists(select 1 from public.pickup_station_return_parcels r where r.id=p_return_id and r.pickup_station_id=p_account and r.aftersales_case_id=p_case_id) then raise exception 'Pickup Station not linked to return';end if;
 elsif p_party='transport_provider' then
  if not exists(select 1 from public.aftersales_return_waybills w join public.pickup_station_return_parcels r on r.id=w.return_id where r.aftersales_case_id=p_case_id and r.id=p_return_id and w.assignee_id=p_account and w.assignee_type='courier') then raise exception 'Transport provider not assigned to this return';end if;
 elsif p_party='staff_rider' then
  if not exists(select 1 from public.aftersales_return_waybills w where w.return_id=p_return_id and w.assignee_id=p_account and w.assignee_type='rider') then raise exception 'Rider not assigned to return';end if;
 else raise exception 'Invalid liable party';end if;
 if p_reason in ('total_loss','station_damage','station_loss') and (p_parcel_value is null or p_amount>p_parcel_value) then raise exception 'Verify parcel value; liability must not exceed documented parcel value';end if;
 insert into public.aftersales_liability_cases(aftersales_case_id,return_id,liability_type,liable_account_id,charge_reason,assessed_amount_kes,parcel_value_kes,evidence_notes)
 values(p_case_id,p_return_id,p_party,p_account,p_reason,p_amount,p_parcel_value,btrim(p_evidence)) returning id into v_id;
 return v_id;
end;$fn$;
create or replace function public.admin_decide_aftersales_liability(p_id uuid,p_action text,p_notes text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v public.aftersales_liability_cases%rowtype;
begin
 if not private.is_leogo_admin('settlements.manage') then raise exception 'Settlement management permission required';end if;
 if length(btrim(coalesce(p_notes,'')))<10 then raise exception 'Record the justification';end if;
 select * into v from public.aftersales_liability_cases where id=p_id for update;
 if not found then raise exception 'Liability assessment not found';end if;
 if p_action='approve' and v.status='pending_review' then
  update public.aftersales_liability_cases set status='approved',reviewed_by=auth.uid(),reviewed_at=now(),decision_notes=btrim(p_notes) where id=p_id;
 elsif p_action='reject' and v.status='pending_review' then
  update public.aftersales_liability_cases set status='rejected',reviewed_by=auth.uid(),reviewed_at=now(),decision_notes=btrim(p_notes) where id=p_id;
 elsif p_action='reverse' and v.status='approved' then
  update public.aftersales_liability_cases set status='reversed',reversed_by=auth.uid(),reversed_at=now(),reversal_reason=btrim(p_notes) where id=p_id;
 else raise exception 'Action not permitted for current status';end if;
 return jsonb_build_object('id',p_id,'status',case when p_action='approve' then 'approved' when p_action='reject' then 'rejected' else 'reversed' end,'settlement_recovery','not_yet_applied');
end;$fn$;
create or replace function public.admin_list_aftersales_liabilities()
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 if not private.is_leogo_admin('settlements.manage') then raise exception 'Settlement management permission required';end if;
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from
 (select l.*,c.case_reference from public.aftersales_liability_cases l join public.marketplace_aftersales_cases c on c.id=l.aftersales_case_id) x);
end;$fn$;
revoke all on function public.admin_create_aftersales_liability(uuid,uuid,text,uuid,text,numeric,numeric,text),public.admin_decide_aftersales_liability(uuid,text,text),public.admin_list_aftersales_liabilities() from public,anon;
grant execute on function public.admin_create_aftersales_liability(uuid,uuid,text,uuid,text,numeric,numeric,text),public.admin_decide_aftersales_liability(uuid,text,text),public.admin_list_aftersales_liabilities() to authenticated;