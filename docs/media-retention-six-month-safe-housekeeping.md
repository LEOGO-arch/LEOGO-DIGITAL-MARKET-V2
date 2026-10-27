# Media retention — six-month safe housekeeping (implementation contract)

Status: **proposed; automatic deletion disabled until authenticated staging checks pass**.

## Scope
Add a separate **Media Housekeeping** section under Admin → System Settings. Do not modify the existing `admin_get_data_cleanup_overview`, `admin_run_safe_data_cleanup`, notification/diagnostic cleanup, normal order workflow, settlements, or customer-front media upload flows.

## Baseline verified 2026-10-27
- Existing Admin cleanup is for housekeeping records. `Storage by Bucket` is explicitly report-only.
- Existing settings: read notifications, resolved diagnostics, monitoring runs, inactive customer review.
- The existing storage-bucket counts **do not establish that any object is safe to delete**.

## Initial safe scope
Only opt in to these storage categories **after mapping live DB references and workflow state**:
- `aftersales-return-waybills`: 180 days after final case closure, including appeals.
- `aftersales-exchange-rider-proof`: 180 days after final completion, dispute-free.
- `pickup-station-proof`: 180 days after confirmed parcel handover.
- Completed delivery-proof buckets: 180 days after completion, only when unequivocally identified.
- `advertisement-media`: 180 days after campaign end, unless any active placement still references the object.

Exclude by default: payment and uploaded receipts, customer sale media, product images, accommodation listings, profile images, ID/passport and staff documents, medical records, active advertisements, audit logs, financial records, and any unknown bucket. Financial/document retention requires a separate validated legal policy.

## Required safeguards before allowing deletion
1. Exact object identity: bucket + full path + object ID, upload timestamp, linked record ID, state and completion timestamp.
2. Time eligibility must be measured from *completed workflow* date, not upload date alone.
3. Server-side super-admin authorization; never trust a browser-supplied bucket/path/eligibility flag.
4. No open dispute, appeal, chargeback, refund, settlement issue, investigation, or legal hold.
5. Confirm no other live row, active content, receipt, or signed URL workflow requires the object.
6. Eligibility scan defaults to **dry run**. Render counts, bytes, excluded reasons and full report/export.
7. Admin explicitly approves an immutable candidate snapshot (short-lived token, object-version matching); changes since scan invalidate approval.
8. Delete in small idempotent batches from a server-only function using a server-side secret; never ship service-role keys to GitHub Pages.
9. Track attempted/succeeded/failed items, bytes, timestamps and approving actor in a protected audit table. Do not falsely label failures as deleted.
10. Missing records, unknown status, unknown references, and errors must fail closed: **keep the object**.
11. Support schedule selection; default daily *scan* with deletion requiring approval. Enable unattended deletion only via separate explicit approval after a tested period.
12. No SQL cascade, no changes to immutable order/payment records. Purge expired URL caches/previews only where safely handled.

## Admin controls
- Toggle: automatic eligibility scanning (default enabled).
- Retention: default six months; per-category override with minimums.
- Deletion mode: admin approval (default), unattended (disabled until validated).
- Buttons: Scan Now; Download Candidate Report; Approve Eligible Cleanup; History.
- Summary: total objects/bytes, eligible count/bytes, protected count, deleted count/bytes, last scan, failure count.
- Danger copy: “Files may be deleted permanently; database financial and order records are retained.”

## Acceptance tests (staging)
- A 179-day closed case is not eligible; a 181-day closed and dispute-free case may be eligible.
- Old uploaded image on an active/open case is **never** eligible.
- A closed case with a later reopened dispute stays protected.
- Active listing/advertisement photos remain reachable.
- Payment receipts, IDs, staff documents, profile images never appear as candidates.
- A non-admin cannot scan privileged data or approve deletion.
- Changed candidate after approval is skipped, not deleted.
- Double-run is idempotent, retries are audited, partial failures do not corrupt business records.
- Pickup station QR, parcel-photo arrival/handover, returns/exchange, seller orders, customer media, settlement, and financial history regression-pass.
- Verify on actual staging first, then merge/deploy only after evidence and user approval.

**This file does not perform deletion or enable a scheduled purge.**
