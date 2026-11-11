# LEOGO Weekend Shopping — staging design and verification

## Scope
This feature is independent of Group/Global Orders, Market Day, Flash Sale, Lipa Pole Pole and the normal Savings Wallet. Its `weekend_shopping_*` records do **not** use or update wallet balances, marketplace orders, seller settlements, or real payment accounts.

## Customer journey
1. From the customer cart, choose **Add to Weekend Shopping**.
2. Select a preferred delivery date and either **One-time** or **Weekly recurring**.
3. The server takes immutable item name, seller price, LEOGO customer price, quantity and variation snapshots from approved live catalogue records. Customer-submitted prices are ignored.
4. The customer can submit multiple partial-payment *references*. Each starts as `pending`; no balance is credited merely because the customer submits a claim.
5. An authorized LEOGO Admin verifies a reference. The cycle's dedicated verified amount increases in a locked database transaction. A fully funded cycle becomes `funded`.
6. Admin may mark a fully funded cycle `release_ready` only on/after its scheduled date. **No production fulfilment, payment transfer or marketplace order creation is yet connected.**
7. Weekly plans can generate their next weekly cycle explicitly, only when the previous cycle is funded, and never auto-charge the customer. Each cycle has separate funding and payment records.

## Financial safeguards and implementation still required
- Staging ledger is *an internal verification record*, **not a regulated money-custody account**. No real money must be collected or represented as received by this feature until payment account instructions, reconciliation, refunds, and compliance review are integrated.
- The initial version snapshots the approved catalogue's regular prices; seller Flash Sale, Market Day, delivery-zone fees, service fees and changes to seller stock/price need a complete server-side quotation and fulfilment check before launch.
- Seller payout stays manual and must run only through verified existing seller-settlement rules after order completion.
- In production, the current `release_ready` action alone does not create a marketplace order, lock inventory, or dispatch a rider. Implement an audited, idempotent transition with order snapshot and delivery pipeline.
- Admin review/listing UI, customer cart shortcut, dedicated Weekend Shopping dashboard, schedule change/cancellation policy, notifications, audit entries, and refunds are not yet integrated.
- A weekly cycle is not an obligation to pay automatically; the plan can be paused/cancelled as a separate future workflow. Before production, re-quote each new cycle and obtain customer consent to changed prices.
- Do not merge this PR or migrate production until an authenticated customer and Admin can complete end-to-end staging tests.

## Checks executed 11 Nov 2026
- Four new tables have RLS enabled with ownership-scoped authenticated read policies.
- Anonymous access to financial RPCs is revoked; authenticated non-admin cannot approve or release payments.
- Staging transaction test created a weekly plan worth KSh 200, submitted KSh 80 pending, verified that balance remained KSh 0 and blocked early release/another cycle.
- Follow-up transaction test rejected a second pending KSh 150 reference against KSh 120 remaining, accepted an exact KSh 120 payment claim, left the balance unverified, and rolled back all fixtures.
- Corrected the uninitialized variation-record defect found in the first test.

## Deployment state
Database foundation applied **only** to LEOGO Phase 1 Staging (`uxikemfrzqatsbqutida`); no production migration.
