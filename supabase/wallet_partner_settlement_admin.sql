-- Staging-tested Admin partner settings. Wallet checkout remains disabled until secure debit/refund implementation.
create table if not exists public.wallet_checkout_activation (
 id smallint primary key default 1 check(id=1),
 enabled boolean not null default false,
 custody_partner_approved boolean not null default false,
 atomic_ledger_verified boolean not null default false,
 refund_flow_verified boolean not null default false,
 settlement_reconciliation_verified boolean not null default false,
 updated_at timestamptz not null default now()
);
alter table public.wallet_checkout_activation
 add column if not exists partner_name text,
 add column if not exists partner_agreement_reference text,
 add column if not exists settlement_method text,
 add column if not exists settlement_notes text,
 add column if not exists updated_by uuid;
alter table public.wallet_checkout_activation enable row level security;
revoke all on public.wallet_checkout_activation from anon,authenticated;
insert into public.wallet_checkout_activation(id,enabled) values (1,false) on conflict(id) do nothing;

create or replace function public.admin_get_wallet_partner_settlement()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.wallet_checkout_activation%rowtype;
begin
 if not private.is_leogo_admin('settings.manage') then raise exception 'Not authorized'; end if;
 select * into v_row from public.wallet_checkout_activation where id=1;
 return jsonb_build_object(
  'partner_name',v_row.partner_name,
  'partner_agreement_reference',v_row.partner_agreement_reference,
  'settlement_method',v_row.settlement_method,
  'settlement_notes',v_row.settlement_notes,
  'enabled',v_row.enabled,
  'custody_partner_approved',v_row.custody_partner_approved,
  'atomic_ledger_verified',v_row.atomic_ledger_verified,
  'refund_flow_verified',v_row.refund_flow_verified,
  'settlement_reconciliation_verified',v_row.settlement_reconciliation_verified);
end $$;
revoke execute on function public.admin_get_wallet_partner_settlement() from public,anon;
grant execute on function public.admin_get_wallet_partner_settlement() to authenticated;

create or replace function public.admin_save_wallet_partner_settlement(
 p_partner_name text,p_agreement_reference text,p_settlement_method text,p_settlement_notes text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_before jsonb; v_after jsonb;
begin
 if not private.is_leogo_admin('settings.manage') then raise exception 'Not authorized'; end if;
 if length(btrim(coalesce(p_partner_name,'')))<2 or length(p_partner_name)>160 then raise exception 'Enter the approved partner name'; end if;
 if length(coalesce(p_agreement_reference,''))>160 or length(coalesce(p_settlement_method,''))>100 or length(coalesce(p_settlement_notes,''))>500 then raise exception 'Partner details too long'; end if;
 select to_jsonb(x) into v_before from public.wallet_checkout_activation x where id=1 for update;
 update public.wallet_checkout_activation
 set partner_name=btrim(p_partner_name),
     partner_agreement_reference=nullif(btrim(coalesce(p_agreement_reference,'')),''),
     settlement_method=nullif(btrim(coalesce(p_settlement_method,'')),''),
     settlement_notes=nullif(btrim(coalesce(p_settlement_notes,'')),''),
     updated_at=now(),updated_by=auth.uid()
 where id=1;
 select to_jsonb(x) into v_after from public.wallet_checkout_activation x where id=1;
 insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,before_data,after_data)
 values(auth.uid(),'wallet_partner_settings_updated','wallet_checkout_activation','1',v_before,v_after);
 return public.admin_get_wallet_partner_settlement();
end $$;
revoke execute on function public.admin_save_wallet_partner_settlement(text,text,text,text) from public,anon;
grant execute on function public.admin_save_wallet_partner_settlement(text,text,text,text) to authenticated;

create or replace function public.admin_set_wallet_checkout_enabled(p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_before jsonb; v_after jsonb;
begin
 if not private.is_leogo_admin('settings.manage') then raise exception 'Not authorized'; end if;
 if p_enabled is null then raise exception 'Activation choice required'; end if;
 if p_enabled then
  raise exception 'Activation blocked: secure wallet purchase, refund and settlement functions are not yet verified';
 end if;
 select to_jsonb(x) into v_before from public.wallet_checkout_activation x where id=1 for update;
 update public.wallet_checkout_activation set enabled=false,updated_at=now(),updated_by=auth.uid() where id=1;
 select to_jsonb(x) into v_after from public.wallet_checkout_activation x where id=1;
 insert into public.admin_audit_log(actor_id,action,entity_type,entity_id,before_data,after_data)
 values(auth.uid(),'wallet_checkout_deactivated','wallet_checkout_activation','1',v_before,v_after);
 return public.admin_get_wallet_partner_settlement();
end $$;
revoke execute on function public.admin_set_wallet_checkout_enabled(boolean) from public,anon;
grant execute on function public.admin_set_wallet_checkout_enabled(boolean) to authenticated;
