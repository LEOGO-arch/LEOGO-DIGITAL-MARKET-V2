# LEOGO-CUST-001 — Customer Health rendering

Baseline/current main: `acde466b4e03bed61a00dda8ca4afd4efd853e31` (4 October 2026). Original severity: Medium.

The live signed-out Customer page reproduces the unavailable state. Its console identifies `Cannot read properties of null (reading 'forEach')` at `js/health.js:118`. An independent anonymous POST to `public_list_health_medicine` returns HTTP 200, `{"products":[],"providers":[]}` with no PostgREST error. This independently measured request took 8,336 ms; exact browser network timing/body was unavailable through the inspection interface. The script reached render after its RPC resolved, then the single-element selector failed. With products present the same selector returns an Element, which also has no `forEach`.

Smallest fix: use the existing plural selector for the two product action collections and distinguish successful empty data from an outage. Bump only the Customer Health script cache version. Genuine RPC failures still use the unavailable state. No database, RPC, pharmacy/OTC/prescription, booking, fee, approval or ordinary-order rules change.

`node --test tests/health-runtime-stabilization.cjs`: empty data and approved artificial OTC/prescription rendering fail before the fix and pass after it; error-state and PR57 Admin rendering/navigation tests also pass (5 total). These are isolated Node DOM simulations, not Supabase staging or real payment confirmations. Static syntax and diff checks pass. Production verification and mobile/browser staging tests remain pending approval and an isolated staging environment. No test record or financial mutation was sent to production.

Existing unrelated baseline tests have stale assertions: `health-specialist-booking-v1.cjs` requires the pre-PR57 Admin cache version; `health-otc-cart-v2.cjs` expects a migration substring that current main no longer contains. Neither failure establishes a new business-rule defect. They are reported separately, not fixed by this Customer rendering patch.

## Isolated staging follow-up

Staging Supabase: uxikemfrzqatsbqutida (separate free project, schema only, no production records). Anonymous and artificial authenticated Customer Health RPC returned HTTP 200 for empty lists. Approved artificial OTC/Rx listings retain cart eligibility restrictions. The integrated Node fixture now supplies an artificial Admin session so PR59 can be tested alongside PR58. A real-staging RPC/HTML DOM integration check passed for Customer and Admin Health; this is not mobile or visual browser proof. Private staging browser access requires owner sign-in, which has not succeeded. No production release.
