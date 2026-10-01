# PR4 Group Order follow-up

The October 1 review found broken Group Order navigation, premature refund completion,
an expired below-MOQ state, shipping edits that attempted a second active campaign,
timezone shifts when reopening dates, and missing customer shipping/type presentation.

The follow-up replaces the five incorrect single-element collection calls, formats
campaign inputs in local time, reuses active campaigns while retaining committed-term
guards, and keeps refund resolution open until every submitted proof is reviewed and
every verified payment is refunded. Payment rejection rechecks expired MOQ campaigns.

Customer changes are confined to product presentation: shipping details, the campaign
price, and routing Group products to Join Group Order. Closed, future and exhausted
campaigns cannot be joined. Existing Normal/Pre-Order cart actions, checkout fee rules,
ordinary order tables, Rider, Sorting Center and Pickup Station RPCs remain unchanged.

## Verification

```sh
TZ=Africa/Nairobi node --test tests/shipping-moq.cjs
TZ=UTC node --test tests/shipping-moq.cjs
```

Seven focused JavaScript tests cover navigation, dates, shipping estimates, Group cart
routing and availability. Run the three SQL files in `tests/` against a LEOGO schema
with existing approved Seller/product, Customer, Admin, Rider and Pickup Partner
fixtures. They set transaction-local identity claims and roll back all fixture updates,
orders, notifications, audit entries and storage metadata. They assert Group lifecycle,
late proof verification, locked terms, permissions and ordinary delivery regressions.

Pre-release checks passed with the replacement functions installed only inside rollback
transactions. Browser coverage requires signed-in test accounts for protected panels;
public live smoke checks do not substitute for those authenticated journeys.
