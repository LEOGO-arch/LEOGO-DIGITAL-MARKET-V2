# LEOGO SEO — staging only

This is a standalone Cloudflare Worker, not a replacement for the existing LEOGO storefront. Do not merge this branch into main or configure a production route. Staging Supabase project: uxikemfrzqatsbqutida. The catalogue SQL has been applied only to staging. It includes a synthetic category for tests; remove that category from any production version.

## Deploy to a separate Cloudflare Worker

In the Cloudflare dashboard create a Worker named leogo-seo-staging and connect the GitHub repository branch seo/staging-public-catalogue. Set root directory to seo-staging and deploy command to npx wrangler deploy. Alternatively use authenticated Wrangler locally from seo-staging (wrangler deploy). Set the Worker secret STAGING_CATALOGUE_KEY to the staging project's publishable key or legacy anon JWT. Never use a service role key, never use production Supabase keys, and never commit keys. Use workers.dev only; do not add a custom domain or route. Enable Cloudflare Access for the staging Worker before inviting testers. Noindex and robots.txt are additional crawler controls, not access control.

## Tests
Run node --test worker.test.mjs with Node 22+. Verify on the deployed workers.dev URL: GET /, /sitemap.xml, /robots.txt, /category/phase1_artificial/, and /products/3c69be82-a433-4496-b729-58e452f6a0a2/. Confirm 200, noindex, no-store and 404 for missing products. Do not submit staging sitemap to Google. Three eligible synthetic products should appear at KSh 110; expired flash sale returns normal price. The SQL is read-only at request time and excludes suspended, unsubscribed, restricted, non-normal, variant, international and MOQ listings; it fails closed if local shipping price disagrees with approved LEOGO price.

## Release gates
No checkout links until a verified isolated storefront URL exists. Prices are catalogue prices only, not Market Day or final checkout quotations; no Product Offer markup until parity is verified. Validate actual public media paths and descriptions, review category allowlist, rate limits, pagination/large catalogue scaling, database permissions and restricted products before production. Production SQL, production hosting, redirects, DNS, payment callbacks and sitemap switching require separate approval and end-to-end staging verification. Never run the staging SQL in production without removing synthetic category and reviewing eligibility. The Worker is deliberately hard-pinned to staging and refuses production domains. The full LEOGO app migration is a separate deployment, not part of this Worker.
