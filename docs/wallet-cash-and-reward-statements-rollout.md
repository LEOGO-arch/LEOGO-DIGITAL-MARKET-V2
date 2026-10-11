# LEOGO Wallet/SACCO Cash Safety and Loyalty/Voucher Statement Improvements

## Scope
- **Keep one shared LEOGO Points / Shopping Voucher reward balance.** Do not split rewards into multiple wallets or convert rewards to cash.
- Cash/savings and the existing combined points/vouchers have **separate running balances on customer PDF/Excel statements**, including per-credit labels by source and voucher use/cancellation restores.
- Fix cash-only financial checks for withdrawal submission, insert validation, Admin approval, statement-download fees, monthly maintenance and loan eligibility/snapshots.
- Change automatic 24-hour withdrawal completion to **Admin-confirmed external payout only**, with a unique real transfer reference and audit trail. The 24-hour value remains an operational target, not proof of payment.
- No change to locked customer order, COD, seller, rider, pickup, Lipa Pole Pole, cashback earning rate, or voucher checkout percentage.

## Migration and activation
1. Work against a separate isolated **staging Supabase project** matching the production schema; Supabase database branching is unavailable on the current production plan. Do not use production as staging.
2. Back up schema, migrations, wallet ledgers and withdrawal states; avoid exposing sensitive account numbers or transaction references in test logs.
3. Apply `supabase/migrations/20261011091500_wallet_cash_isolation_and_payout_proof_v1.sql` on staging before enabling the updated Admin payout screen and customer wording.
4. Test **cash 0 + loyalty/voucher rewards > 0**: decline withdrawals, monthly/statement cash charges and cash-based loan balances. Verify reward checkout remains unaffected.
5. Test **cash 500 + rewards 50**: reserve two withdrawals, verify approval respects all pending reservations; redeem 20 vouchers, restore them on cancellation; run a fee quote and charge, verify cash/reward running balances.
6. Test duplicate withdrawal request IDs, simultaneous client withdrawal submissions, retries and monthly cron, and ensure all ledger entries are non-duplicated.
7. Test withdrawal calls and approvals: status must remain `approved_processing` past the 24-hour target. Only authenticated Admin with `approvals.manage` can complete one with a **verified** external M-Pesa/bank/SACCO transfer reference. Reject missing/duplicate references and users without permissions. Admin records do **not** initiate money transfers.
8. Check cash-only loan history/snapshot and statement fee inclusion/exclusion without changing credit rules.
9. Test customer statements as Excel and PDF: cash-only saving credits/debits, loyalty points credited on delivery, referral/welcome/property vouchers credited, voucher use and cancellation restore. The **same shared reward balance** must reconcile in both formats and in the customer Wallet overview.
10. Regression test unchanged Seller/Admin/Customer, premium, pickup, staff, wallet savings challenge, Lipa Pole Pole, COD and SACCO workflows.
11. When staging is validated, coordinate production migration + frontend deployment; authenticate Admin and customer in production with safe test identities. Keep real customers' funds untouched during tests.

## Provider/payment checks
- The payout Admin checkbox is an explicit human confirmation. A reference typed by staff is not cryptographic evidence of an actual bank/M-Pesa transfer. Reconcile against the official payout account before marking paid.
- Approved withdrawals stay debited and pending until independently verified. The existing cron invokes an intentionally no-op routine; no clock-triggered completion.
- Run targeted SQL checks against real user anonymized totals to prove `SUM(cash ledger excluding reward types)` equals customer withdrawable cash before production cutover.
- The production savings Till is already Admin assigned. This change does not initiate or verify deposits autonomously.

## Validation log
- Branch-side static/JS regression checks: `tests/wallet-cash-isolation-and-reward-statements.cjs`, `tests/wallet-tabs.cjs`, `tests/shopping-voucher-checkout.cjs`, `tests/loyalty-points.cjs` passed in an isolated Node-compatible runner.
- Production Supabase functions inspected **read-only**; migration was **not applied to production**.
- Live authenticated external payout and SMS/M-Pesa tests have not been performed.
