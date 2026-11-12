# LEOGO Weekend Shopping — staging implementation and financial safeguards

## Current scope
Weekend Shopping has a distinct per-cycle funding ledger, separate from the normal LEOGO Savings Wallet and Group/Global Orders. All features are **staging only** (Supabase project `uxikemfrzqatsbqutida`, draft PR #345). Production remains unchanged.

## Connected staging journey
1. From the customer cart, choose **Add cart to Weekend Shopping**. The staged customer panel uses its own staging login and never uses production authentication for this feature.
2. Select a delivery date, once or weekly, receiver name, contact, and delivery zone. Only CBD, estate and outside-town options are currently offered; pickup station selection is not yet built.
3. The server validates seller approval, product and variation availability, and computes customer item prices, marketplace service fee, and delivery fee from `customer_market_day_checkout_quote`. It takes product prices from the server, not browser fields. It rejects currently active promotions or free-delivery subsidies whose future benefit cannot be reliably guaranteed.
4. A **quoted** cycle has its own target. Customer partial-payment references remain pending until explicitly reviewed by an authorized staging Admin. Pending claims count against the amount that can be newly claimed, but never increase verified funds.
5. After a fully verified cycle reaches its selected delivery date, Admin can mark it `release_ready`. Pending claims must be resolved and no partial funding can release.
6. The signed-in customer can trigger `customer_release_weekend_order`. The server requires Admin authorization, verifies account ownership, pricing, quantity, fee totals, seller price snapshots, and stock; calls existing `customer_create_marketplace_order` to reserve stock and create seller sub-orders; marks the resulting payment method `weekend_savings` and status `verified_paid`. All steps occur in one transaction. A repeated request returns the same order without reserving stock again.
7. The existing marketplace seller/order functions continue from the created order. **Seller transfer remains manual and verified by LEOGO.**
8. Weekly plans require the prior cycle to be fully funded; the next is generated explicitly and is requoted against current pricing and fees. Any mismatch blocks the next cycle and requires a new quoted plan.

## Essential safety limitations before production
- Staging has **no bank/Paybill/Till or SACCO transaction lookup connected** to payment verification. Admin manually approving a customer reference is not independent proof of funds. **Do not use this for real money.**
- Do not call or expose weekend order release as a real production payment until independent financial reconciliation and approved payment-account mapping exist.
- Future-date stock and price are not reserved at the time a plan is funded. If stock, seller price, LEOGO price, delivery fee or promotions change, release fails atomically and LEOGO must arrange a repricing/credit/refund path.
- Payment reversals, cancellations, schedule changes, customer reminders, refund authorizations, payment dispute tracking, and robust launch accounting reports are **not implemented**.
- Deliveries are not scheduled automatically with riders or sorting centers; release creates a normal order only on/after the chosen date, and normal delivery preparation begins then. To guarantee delivery on a chosen date, integrate advance preparation and scheduled rider dispatch safely.
- Staging UI code sits in a draft GitHub branch; no dedicated hosted preview is yet published. Customer and Admin JS parse successfully, but **browser-based authenticated UI tests are outstanding**.
- Current staging payment review permits Admin approval of manually entered references. Require evidence-backed reconciliation before enabling production.

## Verified tests
- Owner-scoped RLS enabled on all four Weekend Shopping tables; anonymous RPC execution revoked.
- Unauthenticated plan and payment actions rejected; non-admin release authorization rejected.
- Transactionally tested a KSh 200 weekly plan and claims of KSh 80 plus KSh 120. Neither pending claim credited funds; over-claim was rejected.
- Staged quoted shopping calculated service and local delivery fees from existing marketplace settings.
- A funded cycle with Admin release authorization created a standard marketplace order using the accepted seller price and delivery charges.
- Retrying release returned the original order; stock was reduced **exactly once** and seller subtotal remained correct.
- Tests used SQL transactions that were rolled back, leaving no synthetic payment or order records.

## Deployment rule
Keep [Draft PR #345](https://github.com/LEOGO-arch/LEOGO-DIGITAL-MARKET-V2/pull/345) unmerged until the remaining payment evidence, refunds, scheduled dispatch, financial reporting and full browser-authenticated acceptance tests succeed.
