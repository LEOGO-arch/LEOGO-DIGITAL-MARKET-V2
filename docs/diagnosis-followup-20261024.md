# Diagnosis follow-up — 24 October 2026 (Africa/Nairobi)

## Scope and production evidence

Production remains `dzdciuqkqixwutvtfotj`. No production business rows or workflow functions were changed in this follow-up.

The owner's full scan at 01:01:23 EAT returned 94%, 36 checks, zero critical findings and one runtime-history warning. After the final session-guard deployment at 00:58:53 EAT, the read-only check found two connectivity events (latest 01:08:20 EAT), and no recurrence of the prior protected-read HTTP 401 errors at the time of inspection. Historical warnings were retained; they were not dismissed to improve the score.

## Staging work completed

- Isolated backend: `uxikemfrzqatsbqutida`.
- Existing Site: `appgprj_6ac25de0b33c81919012f2249680abae`, custom restricted audience preserved.
- URL: https://leogo-phase1-staging.vincentozzomondi1997.chatgpt.site
- Frontend synchronized to production source commit `e76cb9e99afb4499052df4917588254812088849`; staging source commit `1469f0195e7314482fdf28a12c8f78edfeb66930`, saved Site version 3. Deployment succeeded.
- All 96 frontend files use staging URLs/keys. A static scan found no production project reference or production publishable key. All 64 JavaScript files parse.
- Restored three missing Lipa Pole Pole ledgers, 16 existing production function definitions, indexes, constraints, notification signals and the fully-paid order link. This is schema-only restoration, not a redesigned workflow. No production records or scheduled jobs copied.
- Restored missing delivery-rate and Lipa Pole Pole settings rows using their declared defaults.
- Restoration SQL is deliberately under `supabase/staging/`, outside the normal production migrations directory. It refuses databases where any of the LPP ledgers already exist. Do not apply it to production.

## Verification

`tests/staging-lpp-transaction.sql` passed on the staging backend using simulated authenticated Customer/Admin roles:

1. Customer opens reservation and stock decreases once.
2. Pending deposit requires Admin verification; Customer approval attempt is denied.
3. Verified deposit activates the account without creating an order prematurely.
4. Verified remaining payment creates exactly one ordinary marketplace order.
5. Duplicate Admin payment review is rejected.
6. Customer notifications and ledger events are recorded.
7. Cancellation uses the configured 25% deduction: KSh 50 paid yields KSh 12.50 deduction and KSh 37.50 refund due.
8. Cancelled stock is restored exactly once and no cancellation order is created.

Every test transaction rolled back. Post-test counts confirmed zero LPP accounts/payments/events, zero test subscription payments, and zero LPP-linked orders remained. No real payment was made, no refund paid, no SMS/email sent, and no photograph uploaded.

Security checks: RLS enabled on all three restored tables; anonymous table reads and account-opening calls denied; direct authenticated payment writes denied; authenticated RPC access retained with internal ownership/permission checks. Advisor flags for definer RPCs and RLS-without-policies are expected for this deliberately RPC-only design; they are not treated as authorization evidence by themselves.

Fourteen focused Node test files passed. The old customer initialization regression test was corrected to check initialization before authentication event registration, rather than brittle character offsets and obsolete cache version strings. Customer application behavior was not changed.

## Remaining gates — do not describe these as passed

- Restricted staging browser access succeeded through secure ChatGPT sign-in. All five portal entrypoints loaded and reported activity. Separate LEOGO application test credentials remain required for authenticated UI journeys.
- Database role simulation is not an authenticated browser login, real JWT/RLS transport test, or full end-to-end user journey.
- Staging has no active Rider or Pickup Station partner identities. Provision authorized synthetic test accounts before full fulfilment testing.
- Complete authenticated browser journeys for Customer, Seller, Admin, Staff/Rider and Pickup; exercise Group Orders, Assisted Shopping, Aftersales, Health, Property, Chat and Partner Terms separately. Existing integrity checks do not establish these workflows are complete.
- QR scanning, camera clarity, parcel photos and physical printing still require real-device checks.
- Temporary network interruptions remain observable. No evidence in this pass justifies changing order/payment logic or suppressing the warnings.

## Next sequence

1. Finish secure access to the restricted staging frontend and select authorized synthetic application test identities.
2. Run the browser LPP happy/error paths against staging, compare UI to stored state, and verify refresh/sign-out behavior.
3. Add Rider/Pickup test identities and exercise ordinary delivery, sorting, station receipt and handover using artificial parcels.
4. Test the remaining eight module journeys one at a time; fix only reproducible defects and retain exact evidence.
5. Recheck production runtime history after verified flows; resolve individual historical issues only with recovery evidence.

## Subsequent browser checks

Secure restricted-site access succeeded. Customer, Admin, Partner, Staff and Pickup startup screens were observed and all five heartbeats reached staging. The missing `record_customer_site_visit` endpoint was restored using the existing traffic migration, on staging only. Missing `artificial/no-photo.jpg` images are synthetic fixture media gaps, not evidence of a production image failure.

The guest Property loader called remote `getUser()` without a local session, producing avoidable AuthSessionMissing warnings. A local-session guard now skips guest reads while preserving remote validation for signed-in customers and stale-response protection. Focused tests cover guests, signed-in reads, failure and overlapping refreshes. No order/payment/delivery action changed.

The SDK also reports several customer clients sharing a storage key. No resulting session loss was reproduced; consolidation remains a separate focused follow-up rather than a broad authentication rewrite.
