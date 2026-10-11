# LEOGO Admin Customer Messaging — safe activation checklist

## What this adds
Admin → Customer SMS & Email sends personalized messages to one selected LEOGO customer or a selected group (up to 100 registered customers per send) through the existing Afrinet order-SMS queue or existing Gmail SMTP order-email queue. The sender must explicitly review and confirm the channel, purpose, audience, and message before queueing. Every campaign is audited, and its provider-acceptance status is visible in Admin history.

## Release sequence
1. Deploy only to isolated staging connected to a separate Supabase project, not production. Confirm the frontend uses staging credentials.
2. Apply `supabase/migrations/20261010100000_admin_customer_messaging_v1.sql` to staging. Ensure transactional order SMS/email tables and admin authorization helpers already exist.
3. Deploy revised `supabase/functions/send-order-email/index.ts` to the staging send-order-email Edge Function. SMS reuses send-order-sms unchanged.
4. Set up **test-only** sender/SMS credentials or stub provider API responses. Do NOT reuse live customer phone numbers or emails. Test no-contact, invalid contact, duplicate contact, opt-in false/true, service vs promotion, 1 / 100 / 101 recipients, permission rejection, request-key idempotency, hourly throttle.
5. Confirm customer profile preferences save and reload, marketing defaults off, invalid Admin credentials cannot queue, campaign history shows accepted/pending/failed, and HTML message output is escaped.
6. Confirm existing order-created, shipped, delivered, Pickup Station and security notifications still send, and marketplace, Wallet, Rider, Seller and COD workflows are unchanged.
7. Back up production schema and verify migration provenance before applying additive SQL, then deploy email worker and frontend changes in a coordinated production release. No customer is messaged simply because this code is deployed.
8. Run production smoke test with **one owner-authorized test customer** and explicit approval before any genuine customer/group dispatch.

## Notes
- Customer-selected promotional SMS/email opt-ins default to false. Service notices are sent only by Admin with both Customer Read and Settings Manage permissions.
- Email is available only when the existing Gmail sender is configured and enabled.
- SMS through Afrinet may incur provider charges. SMS max 400 characters; email max 4000.
- Provider status `sent` means *accepted by the provider*, not confirmed delivered/opened.
- The server caps requests at 100 unique customer IDs, deduplicates email/phone contacts, rate-limits each Admin to 10 campaigns per hour, and uses a request key for retry idempotency.
- No new SMS vendor or SMTP password storage is introduced.
