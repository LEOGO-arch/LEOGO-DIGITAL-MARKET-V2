-- Require an unambiguous original purchased item for an exchange shipment.
create or replace function public.validate_aftersales_exchange_original_item()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare v_item uuid;v_count integer;v_original uuid;
begin
 select order_item_id into v_original from public.marketplace_aftersales_cases where id=new.case_id for update;
 if v_original is null then
  select count(*),min(i.id) into v_count,v_item from public.marketplace_order_items i
   where i.order_id=new.original_order_id and i.seller_id=new.seller_id;
  if v_count<>1 then raise exception 'Identify the exact purchased item before issuing an exchange';end if;
  update public.marketplace_aftersales_cases set order_item_id=v_item where id=new.case_id;
 else
  if not exists(select 1 from public.marketplace_order_items i
    where i.id=v_original and i.order_id=new.original_order_id and i.seller_id=new.seller_id)
   then raise exception 'Original case item is not from this seller order';end if;
 end if;
 return new;
end;$fn$;
drop trigger if exists trg_aftersales_exchange_item_identity on public.aftersales_exchange_shipments;
create trigger trg_aftersales_exchange_item_identity before insert on public.aftersales_exchange_shipments
for each row execute function public.validate_aftersales_exchange_original_item();
-- Delivery collection evidence lives outside ordinary order delivery tables.
alter table public.aftersales_exchange_shipments add column if not exists rider_proof_path text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('aftersales-exchange-rider-proof','aftersales-exchange-rider-proof',false,5242880,array['image/jpeg','image/png'])
on conflict(id) do nothing;
create or replace function private.can_upload_exchange_rider_proof(p_path text)
returns boolean language sql stable security definer set search_path='' as $fn$
 select exists(select 1 from public.aftersales_exchange_shipments s
  where s.id::text=split_part(p_path,'/',1) and s.rider_id=auth.uid()
    and s.status='on_the_way' and s.pickup_station_id is null);
$fn$;
drop policy if exists "Rider upload exchange delivery proof" on storage.objects;
create policy "Rider upload exchange delivery proof" on storage.objects for insert to authenticated
with check(bucket_id='aftersales-exchange-rider-proof' and private.can_upload_exchange_rider_proof(name));
create or replace function public.aftersales_exchange_rider_deliver(p_shipment_id uuid,p_path text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v public.aftersales_exchange_shipments%rowtype;
begin
 select * into v from public.aftersales_exchange_shipments where id=p_shipment_id and rider_id=auth.uid() for update;
 if not found or v.status<>'on_the_way' or v.pickup_station_id is not null then raise exception 'Only assigned direct-delivery rider can complete this exchange';end if;
 if length(btrim(coalesce(p_note,'')))<5 or not exists(select 1 from storage.objects where bucket_id='aftersales-exchange-rider-proof' and name=p_path and split_part(name,'/',1)=p_shipment_id::text)
 then raise exception 'Delivery proof photo and handover details are required';end if;
 update public.aftersales_exchange_shipments set status='delivered',delivered_at=now(),delivery_proof_note=btrim(p_note),rider_proof_path=p_path,updated_at=now() where id=p_shipment_id;
 return jsonb_build_object('ok',true);
end;$fn$;
revoke all on function public.aftersales_exchange_rider_deliver(uuid,text,text) from public,anon;
grant execute on function public.aftersales_exchange_rider_deliver(uuid,text,text) to authenticated;