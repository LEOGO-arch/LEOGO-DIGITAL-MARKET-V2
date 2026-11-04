-- Readiness is server-derived; never trust a browser toggle for a payment feature.
create or replace function public.customer_wallet_checkout_readiness()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
   select 1 from public.wallet_checkout_activation a
   where a.id=1 and a.enabled and a.custody_partner_approved
     and a.atomic_ledger_verified and a.refund_flow_verified
     and a.settlement_reconciliation_verified
     and length(btrim(coalesce(a.partner_name,'')))>=2
 );
$$;
revoke execute on function public.customer_wallet_checkout_readiness() from public,anon;
grant execute on function public.customer_wallet_checkout_readiness() to authenticated;
