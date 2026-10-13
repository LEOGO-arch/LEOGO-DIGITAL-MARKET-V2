-- Snapshot original fulfillment method; no new order or station earnings row.
create or replace function public.aftersales_exchange_seller_pack(p_case_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v public.marketplace_aftersales_negotiations%rowtype;i public.aftersales_seller_inspections%rowtype;o public.marketplace_orders%rowtype;x public.aftersales_exchange_shipments%rowtype;
begin
 select * into v from public.marketplace_aftersales_negotiations where case_id=p_case_id and seller_id=auth.uid();
 if not found or v.stage<>'customer_accepted' then raise exception 'Customer-approved exchange required';end if;
 select * into i from public.aftersales_seller_inspections where case_id=p_case_id and seller_id=auth.uid();
 if not found or i.inspected_at is null or i.recommendation not in ('exchange','replacement') then raise exception 'Seller exchange inspection required';end if;
 if length(btrim(coalesce(p_note,'')))<5 then raise exception 'Packing details required';end if;
 select o2.* into o from public.marketplace_orders o2 join public.marketplace_aftersales_cases c on c.order_id=o2.id where c.id=p_case_id;
 insert into public.aftersales_exchange_shipments(case_id,original_order_id,seller_id,pack_note,packed_at,status,pickup_station_id)
 values(p_case_id,o.id,auth.uid(),btrim(p_note),now(),'packed_ready',o.pickup_station_id)
 on conflict(case_id) do update set pack_note=excluded.pack_note,packed_at=excluded.packed_at,status='packed_ready',updated_at=now()
 where public.aftersales_exchange_shipments.status='awaiting_pack'
 returning * into x;
 if not found then raise exception 'Shipment already underway';end if;
 return jsonb_build_object('id',x.id,'reference',x.reference,'status',x.status);
end;$fn$;
alter table public.aftersales_exchange_shipments add column if not exists received_at_station_at timestamptz;
alter table public.aftersales_exchange_shipments add column if not exists recipient_id_last4 text;
alter table public.aftersales_exchange_shipments add column if not exists handover_proof_path text;
create or replace function public.pickup_partner_exchange_receive(p_shipment_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare x public.aftersales_exchange_shipments%rowtype;
begin
 select * into x from public.aftersales_exchange_shipments where id=p_shipment_id and pickup_station_id=private.pickup_partner_station_id() for update;
 if not found or x.status<>'at_pickup_station' then raise exception 'Exchange parcel must be delivered to this station first';end if;
 update public.aftersales_exchange_shipments set status='ready_for_collection',received_at_station_at=now(),updated_at=now() where id=x.id;
 return jsonb_build_object('ok',true,'station_commission_kes',0);
end;$fn$;
create or replace function public.pickup_partner_exchange_handover(p_shipment_id uuid,p_customer_id_last4 text,p_proof_path text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare x public.aftersales_exchange_shipments%rowtype;
begin
 select * into x from public.aftersales_exchange_shipments where id=p_shipment_id and pickup_station_id=private.pickup_partner_station_id() for update;
 if not found or x.status<>'ready_for_collection' then raise exception 'Exchange not ready for handover';end if;
 if p_customer_id_last4 !~ '^[0-9]{4}$' or p_proof_path is null then raise exception 'Last four ID digits and handover photo required';end if;
 if not exists(select 1 from storage.objects where bucket_id='aftersales-exchange-handover' and name=p_proof_path and split_part(name,'/',1)=p_shipment_id::text) then raise exception 'Handover photo not uploaded';end if;
 update public.aftersales_exchange_shipments set status='delivered',delivered_at=now(),recipient_id_last4=p_customer_id_last4,handover_proof_path=p_proof_path,updated_at=now() where id=x.id;
 return jsonb_build_object('ok',true,'station_commission_kes',0);
end;$fn$;
create or replace function private.can_upload_exchange_handover(p_path text)
returns boolean language sql stable security definer set search_path='' as $fn$
 select exists(select 1 from public.aftersales_exchange_shipments x where x.id::text=split_part(p_path,'/',1) and x.pickup_station_id=private.pickup_partner_station_id() and x.status='ready_for_collection');
$fn$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('aftersales-exchange-handover','aftersales-exchange-handover',false,5242880,array['image/jpeg','image/png'])
 on conflict(id) do nothing;
drop policy if exists "Station upload exchange handover proof" on storage.objects;
create policy "Station upload exchange handover proof" on storage.objects for insert to authenticated
with check(bucket_id='aftersales-exchange-handover' and private.can_upload_exchange_handover(name));
revoke all on function public.pickup_partner_exchange_receive(uuid),public.pickup_partner_exchange_handover(uuid,text,text) from public,anon;
grant execute on function public.pickup_partner_exchange_receive(uuid),public.pickup_partner_exchange_handover(uuid,text,text) to authenticated;