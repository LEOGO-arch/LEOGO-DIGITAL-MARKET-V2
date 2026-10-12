-- Seller-led aftersales: auditable physical return and inspection, no automatic refunds.
create table if not exists public.aftersales_seller_inspections (
 case_id uuid primary key references public.marketplace_aftersales_cases(id),
 received_at timestamptz not null default now(),
 inspected_at timestamptz,
 condition_notes text not null,
 responsibility text check(responsibility in ('seller','customer','transport','undetermined')),
 decision text check(decision in ('refund_recommended','exchange_recommended','return_to_customer','intervention')),
 decision_reason text,
 recorded_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now()
);
alter table public.aftersales_seller_inspections enable row level security;
revoke all on public.aftersales_seller_inspections from anon,authenticated;
create or replace function public.seller_receive_aftersales_return(p_case_id uuid,p_condition text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_seller uuid;v_return public.pickup_station_return_parcels%rowtype;
begin
 if length(btrim(coalesce(p_condition,'')))<5 then raise exception 'Describe the received item condition';end if;
 select seller_id into v_seller from public.marketplace_aftersales_negotiations where case_id=p_case_id and stage='customer_accepted' for update;
 if v_seller is distinct from auth.uid() then raise exception 'Only the assigned seller can receive an accepted return';end if;
 select * into v_return from public.pickup_station_return_parcels where aftersales_case_id=p_case_id order by updated_at desc limit 1;
 if v_return.id is null or v_return.status not in ('dispatched','completed') then raise exception 'Return parcel must first be dispatched from its pickup station';end if;
 insert into public.aftersales_seller_inspections(case_id,condition_notes,recorded_by) values(p_case_id,btrim(p_condition),auth.uid())
 on conflict(case_id) do nothing;
 if not found then raise exception 'Seller already recorded return receipt';end if;
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(p_case_id,auth.uid(),'seller','return_received',btrim(p_condition));
 return jsonb_build_object('ok',true,'status','received_for_inspection');
end;$fn$;
revoke all on function public.seller_receive_aftersales_return(uuid,text) from public,anon;
grant execute on function public.seller_receive_aftersales_return(uuid,text) to authenticated;

create or replace function public.seller_inspect_aftersales_return(p_case_id uuid,p_responsibility text,p_decision text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_seller uuid;v_case public.marketplace_aftersales_cases%rowtype;v_amount numeric;
begin
 if p_responsibility not in ('seller','customer','transport','undetermined') or p_decision not in ('refund_recommended','exchange_recommended','return_to_customer','intervention') then raise exception 'Invalid inspection decision';end if;
 if length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Give a detailed inspection reason (10 characters minimum)';end if;
 select seller_id into v_seller from public.marketplace_aftersales_negotiations where case_id=p_case_id and stage='customer_accepted' for update;
 if v_seller is distinct from auth.uid() then raise exception 'Only the assigned seller can inspect an accepted return';end if;
 select * into v_case from public.marketplace_aftersales_cases where id=p_case_id;
 select line_total_kes into v_amount from public.marketplace_order_items where id=v_case.order_item_id and order_id=v_case.order_id;
 update public.aftersales_seller_inspections set inspected_at=now(),responsibility=p_responsibility,decision=p_decision,decision_reason=btrim(p_reason),updated_at=now()
 where case_id=p_case_id and inspected_at is null and recorded_by=auth.uid();
 if not found then raise exception 'First receive the returned parcel; inspection may only be submitted once';end if;
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(p_case_id,auth.uid(),'seller','inspection_'||p_decision,btrim(p_reason));
 return jsonb_build_object('ok',true,'decision',p_decision,'product_refund_cap_kes',v_amount,'requires_admin_resolution',true);
end;$fn$;
revoke all on function public.seller_inspect_aftersales_return(uuid,text,text,text) from public,anon;
grant execute on function public.seller_inspect_aftersales_return(uuid,text,text,text) to authenticated;