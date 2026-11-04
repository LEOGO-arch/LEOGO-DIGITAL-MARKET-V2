-- LEOGO Savings Wallet: operator-controlled activation after backend component checks.
-- Seller transfers remain manual; this changes no balances or settlement records.
create or replace function public.admin_set_wallet_checkout_enabled(p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_partner text;
  v_ok boolean;
begin
  if auth.uid() is null or not private.is_leogo_admin('settings.manage') then
    raise exception 'Only an authorized LEOGO administrator can change wallet checkout';
  end if;
  if p_enabled is null then raise exception 'Activation choice required'; end if;

  select to_jsonb(a),a.partner_name into v_before,v_partner
  from public.wallet_checkout_activation a where a.id=1 for update;
  if not found then raise exception 'Wallet activation settings are missing'; end if;

  if p_enabled then
    if length(btrim(coalesce(v_partner,''))) < 2 then
      raise exception 'Save the approved SACCO / payment partner first';
    end if;

    -- Fail closed when the transactional paths or manual reconciliation are missing.
    select
      to_regprocedure('public.customer_create_marketplace_wallet_order(jsonb,text,text,text,text,text,text,text,text,uuid,uuid,boolean)') is not null
      and to_regprocedure('public.admin_refund_marketplace_wallet_order(uuid,uuid,text,text,boolean)') is not null
      and to_regprocedure('public.admin_record_seller_settlement(uuid,uuid,numeric,text,text)') is not null
      and to_regprocedure('public.admin_list_wallet_order_settlement_reconciliation()') is not null
      and to_regprocedure('public.admin_get_wallet_checkout_financial_report()') is not null
      and exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relname='wallet_checkout_payments' and c.relrowsecurity)
      and exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relname='wallet_ledger_entries' and c.relrowsecurity)
      into v_ok;
    if not coalesce(v_ok,false) then
      raise exception 'Activation blocked: wallet debit, refund, reconciliation or security component missing';
    end if;
  end if;

  update public.wallet_checkout_activation
  set enabled=p_enabled,
      custody_partner_approved=case when p_enabled then true else custody_partner_approved end,
      atomic_ledger_verified=case when p_enabled then true else atomic_ledger_verified end,
      refund_flow_verified=case when p_enabled then true else refund_flow_verified end,
      settlement_reconciliation_verified=case when p_enabled then true else settlement_reconciliation_verified end,
      updated_at=now(),updated_by=auth.uid()
  where id=1;

  select to_jsonb(a) into v_after from public.wallet_checkout_activation a where a.id=1;
  insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),case when p_enabled then 'wallet_checkout_activated' else 'wallet_checkout_deactivated' end,
         'wallet_checkout_activation','1',v_before,v_after);
  return public.admin_get_wallet_partner_settlement();
end $$;
revoke execute on function public.admin_set_wallet_checkout_enabled(boolean) from public,anon;
grant execute on function public.admin_set_wallet_checkout_enabled(boolean) to authenticated;
