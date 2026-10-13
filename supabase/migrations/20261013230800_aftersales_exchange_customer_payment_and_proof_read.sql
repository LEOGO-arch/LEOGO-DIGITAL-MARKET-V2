create or replace function public.customer_aftersales_exchange_submit_delivery_payment(p_shipment_id uuid,p_reference text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare x public.aftersales_exchange_shipments%rowtype;
begin
 select s.* into x from public.aftersales_exchange_shipments s
 join public.marketplace_orders o on o.id=s.original_order_id
 where s.id=p_shipment_id and o.customer_id=auth.uid() for update of s;
 if not found or x.status<>'packed_ready' or x.payer<>'customer' or x.delivery_cost_kes<=0
 then raise exception 'No customer-paid exchange delivery charge available';end if;
 if x.payment_verified then raise exception 'Exchange delivery payment already verified';end if;
 if length(btrim(coalesce(p_reference,'')))<5 or length(btrim(p_reference))>100 then raise exception 'Provide a valid payment reference';end if;
 update public.aftersales_exchange_shipments set delivery_payment_reference=btrim(p_reference),payment_verified=false,updated_at=now()
 where id=p_shipment_id;
 return jsonb_build_object('ok',true,'status','awaiting_admin_verification');
end;$fn$;
revoke all on function public.customer_aftersales_exchange_submit_delivery_payment(uuid,text) from public,anon;
grant execute on function public.customer_aftersales_exchange_submit_delivery_payment(uuid,text) to authenticated;
create or replace function private.can_view_aftersales_exchange_photo(p_path text)
returns boolean language sql stable security definer set search_path='' as $fn$
select exists(select 1 from public.aftersales_exchange_shipments s
join public.marketplace_orders o on o.id=s.original_order_id
where (s.handover_proof_path=p_path or s.rider_proof_path=p_path)
and (o.customer_id=auth.uid() or s.seller_id=auth.uid() or s.rider_id=auth.uid()
 or private.is_leogo_admin('delivery.manage')
 or s.pickup_station_id=private.pickup_partner_station_id()));
$fn$;
drop policy if exists "Read authorized exchange handover proof" on storage.objects;
create policy "Read authorized exchange handover proof" on storage.objects for select to authenticated
using(bucket_id='aftersales-exchange-handover' and private.can_view_aftersales_exchange_photo(name));
drop policy if exists "Read authorized exchange rider proof" on storage.objects;
create policy "Read authorized exchange rider proof" on storage.objects for select to authenticated
using(bucket_id='aftersales-exchange-rider-proof' and private.can_view_aftersales_exchange_photo(name));