# LEOGO optional Google Analytics (GA4)

This code is **disabled by default**. The official LEOGO GA4 web stream must first be created; until its actual Measurement ID is configured, the new script makes no network calls, displays no banner, writes no storage, and changes no marketplace behaviour.

## Activation
1. Visit https://analytics.google.com/ using the official LEOGO Google account.
2. Create a GA4 property named LEOGO Digital Market, select the Kenya reporting timezone and the appropriate currency.
3. Create a Web data stream at https://leogo.co.ke/.
4. Copy the measurement ID in the form `G-XXXXXXXXXX`. This ID is a public web identifier, **not a password or service-account key**.
5. After reviewing the site's public privacy notice, set the exact measurement ID in the only empty `data-measurement-id=""` attribute on the `js/ga4-analytics.js` script in `index.html`.
6. Verify with Tag Assistant and GA4 Realtime: before consent there must be no Google Analytics network request; Decline must prevent one; Allow must trigger only a sanitized page_view. Do Not Track disables it.
7. Deploy only after these checks pass.

## Safety
* Existing `js/customer-traffic.js` (Supabase reporting) stays untouched. Google Analytics is separate, optional and **not yet active**.
* Basic consent mode: the Google tag does not load until a visitor actively allows analytics. Ad-storage and ad-personalization settings remain denied.
* Uses only a fixed public homepage URL and title. No query parameters, hashes, referrers, search text, names, email, order IDs, wallet data or payments are passed by this integration. It creates no e-commerce conversion events.
* A visitor can decline or reopen the privacy panel to change their choice. Turning off analytics updates consent; changes cannot retroactively erase data already collected. A full cookie/privacy notice and any applicable compliance review remain necessary.
* This feature will not activate without an explicit, valid official measurement ID. **Never insert an invented G-ID**.

## Test
`node --test tests/ga4-analytics.test.mjs`
