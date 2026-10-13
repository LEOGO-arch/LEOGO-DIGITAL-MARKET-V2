-- Suggest the earned station return fee to the responsible seller when inspection confirms seller liability.
-- The deduction remains pending until authorized Admin explicitly approves.
create or replace function private.suggest_aftersales_seller_return_fee(p_case uuid)
returns void language plpgsql security definer set search_path='' as $fn$
declare v record;
begin
 select i.seller_id,i.case_id,c.return_id,c.amount_kes
 into v from public.aftersales_seller_inspections i
 join public.pickup_station_return_parcels r on r.aftersales_case_id=i.case_id
 join public.aftersales_station_commissions c on c.return_id=r.id
 where i.case_id=p_case and i.finding='seller_liability' and i.inspected_at is not null
 order by c.earned_at desc limit 1;
 if not found or v.amount_kes<=0 then return;end if;
 insert into public.aftersales_liability_cases(
  aftersales_case_id,return_id,liability_type,liable_account_id,charge_reason,
  assessed_amount_kes,evidence_notes,created_by)
 values(v.case_id,v.return_id,'seller',v.seller_id,'return_station_commission',
  v.amount_kes,'Suggested from seller-responsibility inspection and earned Pickup Station return commission. Admin must verify and approve.',v.seller_id)
 on conflict do nothing;
end;$fn$;
create or replace function private.suggest_aftersales_seller_fee_trigger()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare v_case uuid;
begin
 if tg_table_name='aftersales_station_commissions' then
  select aftersales_case_id into v_case from public.pickup_station_return_parcels where id=new.return_id;
 else v_case:=new.case_id;end if;
 perform private.suggest_aftersales_seller_return_fee(v_case);
 return new;
end;$fn$;
drop trigger if exists trg_afs_liability_commission_suggest on public.aftersales_station_commissions;
create trigger trg_afs_liability_commission_suggest after insert on public.aftersales_station_commissions
for each row execute function private.suggest_aftersales_seller_fee_trigger();
drop trigger if exists trg_afs_liability_inspection_suggest on public.aftersales_seller_inspections;
create trigger trg_afs_liability_inspection_suggest after insert or update of finding,inspected_at on public.aftersales_seller_inspections
for each row execute function private.suggest_aftersales_seller_fee_trigger();
-- Full parcel value for confirmed destruction or loss at Pickup Station.
alter table public.aftersales_liability_cases drop constraint if exists afs_liability_total_loss_amount_guard;
alter table public.aftersales_liability_cases add constraint afs_liability_total_loss_amount_guard
 check(charge_reason not in ('total_loss','station_loss','station_damage') or assessed_amount_kes=parcel_value_kes);
