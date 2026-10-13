alter table public.aftersales_exchange_shipments add column if not exists delivery_payment_reference text;
create or replace function public.admin_aftersales_exchange_decide_cost(
 p_case_id uuid,p_payer text,p_cost numeric,p_reason text,
 p_payment_verified boolean default false,p_payment_reference text default null
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare x public.aftersales_exchange_shipments%rowtype;
begin
 if not private.is_leogo_admin('delivery.manage') then raise exception 'Admin delivery permission required';end if;
 if p_payer not in ('seller','customer','leogo') or p_cost is null or p_cost<0
 or length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Record liable party, delivery cost and reason';end if;
 if p_payment_verified and p_payer='customer' and p_cost>0 and length(btrim(coalesce(p_payment_reference,'')))<5
 then raise exception 'Verify customer M-Pesa/bank payment reference before approving dispatch';end if;
 select * into x from public.aftersales_exchange_shipments where case_id=p_case_id for update;
 if not found or x.status not in ('packed_ready','assigned') then raise exception 'Exchange is not ready for cost decision';end if;
 update public.aftersales_exchange_shipments set
  payer=p_payer,delivery_cost_kes=p_cost,responsibility_reason=btrim(p_reason),
  payment_verified=p_payment_verified,delivery_payment_reference=nullif(btrim(p_payment_reference),''),
  cost_decided_by=auth.uid(),cost_decided_at=now(),updated_at=now()
 where id=x.id;
 return jsonb_build_object('ok',true);
end;$fn$;
revoke all on function public.admin_aftersales_exchange_decide_cost(uuid,text,numeric,text,boolean,text) from public,anon;
grant execute on function public.admin_aftersales_exchange_decide_cost(uuid,text,numeric,text,boolean,text) to authenticated;
-- Disable earlier five-argument form to ensure all callers use the verified-reference policy.
revoke execute on function public.admin_aftersales_exchange_decide_cost(uuid,text,numeric,text,boolean) from authenticated;