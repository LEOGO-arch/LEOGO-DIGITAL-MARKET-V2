-- Seller physical receipt and inspection records; no direct financial movements.
create table if not exists public.aftersales_seller_inspections(
 case_id uuid primary key references public.marketplace_aftersales_cases(id) on delete restrict,
 seller_id uuid not null references auth.users(id),
 received_at timestamptz,
 received_condition text,
 inspected_at timestamptz,
 finding text check (finding in ('seller_liability','customer_damage','undetermined')),
 recommendation text check (recommendation in ('refund','exchange','replacement','reject')),
 inspection_notes text,
 ready_return_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.aftersales_seller_inspections enable row level security;
revoke all on public.aftersales_seller_inspections from anon,authenticated;
create or replace function public.aftersales_seller_receive_return(p_case_id uuid,p_condition text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_seller uuid:=(select auth.uid());v_return public.pickup_station_return_parcels%rowtype;
begin
 if length(btrim(coalesce(p_condition,'')))<5 or length(p_condition)>2000 then raise exception 'Describe parcel condition (5-2000 characters)';end if;
 if not exists(select 1 from public.marketplace_aftersales_negotiations n
   where n.case_id=p_case_id and n.seller_id=v_seller and n.stage='customer_accepted'
   and n.solution_kind in ('return_refund','return_exchange')) then
   raise exception 'This accepted return does not belong to your seller account';end if;
 select * into v_return from public.pickup_station_return_parcels
 where aftersales_case_id=p_case_id and status in ('dispatched','completed') for update;
 if not found then raise exception 'Return must first be dispatched from pickup station by LEOGO';end if;
 insert into public.aftersales_seller_inspections(case_id,seller_id,received_at,received_condition)
 values(p_case_id,v_seller,now(),btrim(p_condition))
 on conflict(case_id) do nothing;
 if not found then raise exception 'Seller has already recorded receipt';end if;
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(p_case_id,v_seller,'seller','return_received_for_inspection',left(btrim(p_condition),2000));
 insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view)
 select c.customer_id,'aftersales','Seller received return for inspection',
 'The seller has received your returned item for case '||c.case_reference||'. Inspection is pending.',
 'marketplace_aftersales_case',c.id,'aftersales_seller_received_return','aftersales'
 from public.marketplace_aftersales_cases c where c.id=p_case_id;
 return jsonb_build_object('ok',true,'case_id',p_case_id,'status','received_for_inspection');
end;$fn$;
create or replace function public.aftersales_seller_record_inspection(
 p_case_id uuid,p_finding text,p_recommendation text,p_notes text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_seller uuid:=(select auth.uid());
begin
 if p_finding not in ('seller_liability','customer_damage','undetermined') or
 p_recommendation not in ('refund','exchange','replacement','reject') then
   raise exception 'Choose valid inspection result and recommendation';end if;
 if length(btrim(coalesce(p_notes,'')))<10 or length(p_notes)>2000 then
   raise exception 'Provide inspection reasons (10-2000 characters)';end if;
 update public.aftersales_seller_inspections set inspected_at=now(),finding=p_finding,
   recommendation=p_recommendation,inspection_notes=btrim(p_notes),updated_at=now(),
   ready_return_at=case when p_recommendation='reject' then now() else null end
 where case_id=p_case_id and seller_id=v_seller and received_at is not null and inspected_at is null;
 if not found then raise exception 'You must first receive and inspect this assigned return (or inspection is already recorded)';end if;
 insert into public.marketplace_aftersales_negotiation_events(case_id,actor_id,actor_role,event_type,comment)
 values(p_case_id,v_seller,'seller','return_inspected_'||p_recommendation,
 left(p_finding||': '||btrim(p_notes),2000));
 if p_recommendation='reject' then
  update public.marketplace_aftersales_negotiations set stage='seller_rejected',
  seller_comment=btrim(p_notes),updated_at=now() where case_id=p_case_id and seller_id=v_seller;
 end if;
 insert into public.customer_notifications(user_id,notification_type,title,message,source_type,source_id,event_key,action_view)
 select c.customer_id,'aftersales',
 case when p_recommendation='reject' then 'Seller declined after inspection' else 'Seller inspection completed' end,
 'Aftersales '||c.case_reference||' inspection: '||replace(p_recommendation,'_',' ')||'. Reason: '||left(btrim(p_notes),800)||
 case when p_recommendation='reject' then ' You may request LEOGO intervention.' else ' LEOGO will review the recommendation.' end,
 'marketplace_aftersales_case',c.id,'aftersales_seller_inspection_'||p_recommendation,'aftersales'
 from public.marketplace_aftersales_cases c where c.id=p_case_id;
 return jsonb_build_object('ok',true,'case_id',p_case_id,'recommendation',p_recommendation,
  'requires_admin_review',true,'refund_automatically_issued',false);
end;$fn$;
revoke all on function public.aftersales_seller_receive_return(uuid,text) from public,anon;
grant execute on function public.aftersales_seller_receive_return(uuid,text) to authenticated;
revoke all on function public.aftersales_seller_record_inspection(uuid,text,text,text) from public,anon;
grant execute on function public.aftersales_seller_record_inspection(uuid,text,text,text) to authenticated;
