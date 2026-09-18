# LEOGO DIGITAL MARKET V2 — Phase 1(A) Specification

## Status
APPROVED FOR BUILD

## Scope
Phase 1(A) establishes the LEOGO customer-facing application shell and visual foundation. It does not implement later marketplace business workflows.

## Future customer town-shopping requirement — RESERVED
The customer-facing shopping experience must later support a town-selection control so a customer can choose where they want to shop from, directly from the customer front.

Required future behavior:
- Customer can choose a specific town.
- Customer can choose **All Towns**.
- When a specific town is selected, goods/products from sellers in that town should be the primary/recommended catalogue shown to the customer.
- The customer may change the town selection at any time.
- The customer should also be able to choose **All Towns** to see goods from sellers across supported towns.
- This selection is a customer-facing discovery/filter preference and must not restrict the underlying seller/product data model.
- The implementation must be added at the appropriate later marketplace/catalogue phase, not prematurely in Phase 1(A).

## Current Phase 1(A) boundary
Phase 1(A) may establish UI space and navigation patterns that can accommodate the future town selector, but must not implement town filtering, seller-location queries, recommendation algorithms, or marketplace catalogue logic yet.

## Pickup station checkout
- `Pickup Station` is an available checkout delivery zone.
- Active stations and each station's percentage service fee are loaded from `public.pickup_stations` after customer authentication.
- Customers may read active station choices but cannot create, edit, or delete station records.
- The pickup service fee is calculated from the items subtotal, shown separately from the normal marketplace service fee, and included in the grand total.
- Selecting pickup replaces the customer's delivery-address requirement with a required pickup-station selection.
- The selected station, its address, and its pickup fee are included in the receipt and WhatsApp order summary.
- Authorized Admin/Staff systems will manage station records and percentage rates using privileged backend access.

## Build sequence
SPECIFICATION → BUILD → TEST → USER APPROVES → LOCK → NEXT
