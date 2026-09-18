# LEOGO Admin Control Center V1

Status: **built for owner review; not locked yet**

The Admin Control Center is a separate application at `/admin/`. This build does not redesign or replace the locked Customer Front.

## Access and security

- Only an authenticated row in `admin_users` with `status = active` may enter.
- The existing LEOGO owner account is bootstrapped as the first `super_admin`.
- Admin authorization is stored in a protected database table, not editable authentication metadata.
- Browser code uses only the Supabase publishable key. No service-role secret is included.
- Sensitive changes are made through permission-checked database functions.
- Row Level Security protects Admin settings and operational data.
- Ordinary authenticated customers cannot call Admin functions or read Admin-only tables.
- Sensitive actions produce append-only Audit Log entries with Admin, timestamp, entity and before/after values.

## Main navigation

1. Dashboard
2. Approval Center
3. Orders
4. Customers
5. Products & Categories
6. Sellers
7. Service Providers
8. Transport & Parcel Delivery
9. Wallet & SACCO
10. Premium
11. Accommodation
12. Payments & Settlements
13. Loyalty & Rewards
14. Reports
15. System Settings
16. Audit Log

Orders remains immediately below Approval Center as specified.

## Connected in V1

- Dashboard totals and recent approval work
- Customer account directory
- Consolidated Approval Center for:
  - Premium Customer applications
  - Verified Premium Profile applications
  - Premium membership payments
  - Wallet deposits and Daily Saving Challenge deposits
  - Wallet loan applications
  - Wallet withdrawals, including the required customer-call checkpoint
  - Accommodation hosts and properties
- Pickup Station creation and editing
- Wallet maintenance, statement and reward settings
- Premium plan price, duration and active status
- Accommodation operational totals
- Central LEOGO Business Details
- Multiple Till, Paybill, bank and other payment accounts
- Payment-account assignment by LEOGO function
- Payment-account activation, deactivation and archive (no destructive deletion)
- Audit Log

## Reserved without duplicate data

The following screens are present in navigation but remain reserved until their production tables and corresponding customer/seller/provider flows are approved:

- Orders and fulfilment ledger
- Products and categories administration
- Seller administration
- Service Provider administration
- Transport/Parcel Provider and delivery-job operations
- Full report generation
- Notification provider settings
- Lipa Pole Pole global rules

This prevents a second, competing implementation from being created beside the existing Customer Front.

## Payment functions

An active payment account can be assigned to any of these functions:

- Wallet / SACCO Deposits
- Savings Challenge
- Loan Repayment
- Marketplace Orders
- Lipa Pole Pole
- Premium Payments
- Accommodation Payments
- Service Payments
- Transport & Parcel Delivery
- Other Revenue

Changing a payment destination, changing an account, or deactivating/archiving an account is audited. Deactivating or archiving an account clears live assignments while preserving the account and historical evidence.

## Approval safeguards

- Rejecting a request requires an Admin reason.
- Buttons lock while a request is being processed to prevent accidental double submission.
- Already-reviewed records cannot be approved twice.
- A wallet withdrawal in `pending_call` must first be marked as customer contacted. Only then may it be approved for processing.
- Wallet balances are changed only by the existing protected Wallet functions.

## Verification completed

- JavaScript syntax check
- HTML duplicate-ID check
- whitespace and patch validation
- Admin summary works for the Super Admin account
- the same Admin RPC rejects an ordinary customer account
- Supabase security and performance advisors reviewed
- responsive layouts provided for desktop, tablet and phone

The live HTTPS page must be regression-tested after deployment before this Admin version is locked.
