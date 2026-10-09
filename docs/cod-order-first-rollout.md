# LEOGO COD order-first / delivery-fee hold rollout

**Scope:** COD on approved Seller marketplace orders only. Health & Medicine, prepayments, Lipa Pole Pole, and locked Seller/Rider/Pickup flows are not redesigned.

## Staged activation order
1. Confirm current Supabase migration provenance and staging database isolation. Never run these migrations against production as a staging shortcut.
2. Deploy the frontend branch to an isolated test site with staging Supabase credentials.
3. Apply migrations `20261009233000_cod_order_first_delivery_fee_hold_v1.sql` and `20261009233500_cod_prepaid_delivery_fee_remaining_balance_v1.sql` to staging **in order**.
4. Authenticate staging Customer, Admin/Staff, Seller, Rider and Pickup Station test accounts.
5. Test COD under the Admin-configured subtotal limit (with and without voucher). Place order with no payment reference; it must create with `cod_due` and a separate `awaiting_payment` fee status.
6. Ensure rider assignment and all Rider/Pickup delivery progress routes reject the order while fee is awaiting payment, submitted, or rejected.
7. Submit a genuine staged payment reference; Admin only can verify or reject. On rejection customer can resubmit. Reused proof or non-customer submissions must be rejected.
8. After fee verification, Admin can assign rider, Seller marks packed/ready, Rider and Pickup workflows progress normally. Rider/Pickup display **gross order balance minus verified fee advance** as COD to collect at final handover.
9. Verify Admin order/receipt and Customer My Activity show both the separate fee status and correct voucher-adjusted amount due. Ensure zero-fee COD and pre-existing COD records are not blocked.
10. Regression test Till, Paybill, product stock reservation, Seller split orders, flash sale, Lipa Pole Pole, wallet vouchers, Health prescriptions, delivery, pickup QR/photo workflows.
11. Only then perform a controlled production migration and live authenticated smoke test. A GitHub merge alone **does not apply Supabase migrations**.

## Safety / feature gate
The Customer checkout asks the server for `customer_cod_order_first_ready()`. If it is unavailable, it **continues using the existing COD proof-first workflow**. The Admin and customer order-list RPCs also tolerate an older backend without showing fee-approval features. On a server with the new migration, a database trigger enforces a separate fee verification hold even when a legacy client calls a different dispatch RPC.

## Accounting
The COD delivery-fee advance is limited to the remaining amount after voucher credits. The order grand total and existing reward accounting are not rewritten. The Rider/Pickup handover amount subtracts only the approved fee advance. The remaining COD amount is still collected and confirmed at physical handover.

## Release status
Source-code and regression checks can pass before authenticated staging tests; they are not a substitute for staged payment verification. Do not mark the production COD order-first feature active until staged end-to-end tests are complete.
