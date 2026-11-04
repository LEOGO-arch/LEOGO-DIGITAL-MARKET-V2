# Wallet checkout — staging-only activation gate (4 Nov 2026)

Status: **NOT ACTIVATED**. Do not merge this document as evidence that payments are ready.

## Verified existing behavior
- Customer checkout HTML has a permanently disabled "Partner Activation Required" button.
- Marketplace order creation accepts Till/Paybill/COD (and reward points through v2), not Savings Wallet.
- Wallet ledger already permits `purchase` and `refund` entry types, but neither completes an order-payment integration.
- The wallet summary keeps savings cash separate from reward points and subtracts pending withdrawal reservations for the withdrawable figure.

## Staging database only
Project: `uxikemfrzqatsbqutida` (LEOGO Phase 1 Staging).

The following guard was created and verified in staging; it has **not** been applied to production:

```sql
create table if not exists public.wallet_checkout_activation (
 id smallint primary key default 1 check (id=1),
 enabled boolean not null default false,
 custody_partner_approved boolean not null default false,
 atomic_ledger_verified boolean not null default false,
 refund_flow_verified boolean not null default false,
 settlement_reconciliation_verified boolean not null default false,
 updated_at timestamptz not null default now()
);
alter table public.wallet_checkout_activation enable row level security;
revoke all on public.wallet_checkout_activation from anon, authenticated;
insert into public.wallet_checkout_activation(id) values(1) on conflict (id) do nothing;
```

Verification: all five flags false; RLS enabled; neither `anon` nor `authenticated` has SELECT permission.

## Implementation remaining (must be staging-tested before any production activation)
1. Atomic, server-side purchase function: authenticated customer ownership, supported order state, amount from authoritative order, account row lock, spendable cash balance less reserved withdrawals, idempotency key, exact-once debit and paid order state in one transaction.
2. Cross-flow concurrency: ensure withdrawals/other wallet debits share a consistent serialization strategy. Test simultaneous purchases and withdrawal requests.
3. Settlement connection: credit reconciliation liability correctly; no partner settlement triggered by a failed/retried payment.
4. Refund function: admin authorization, cancellation/refund evidence, exact-once credit linked to the original purchase and order.
5. Admin control: require all readiness checks and financial partner approval; audit any enable/disable action. No client-controlled activation.
6. Customer checkout: render a selectable method only if server readiness says enabled. Until then retain disabled status. Existing Till/Paybill/COD paths untouched.
7. Automated regression and authenticated staging tests: insufficient funds, double-click, replay, concurrent spend, wrong account/order access, cancelled order, failed refund, retry, reconciliation.

Do not set `enabled=true` or modify production balances until these checks and required external payment/custody authorization have been verified.
