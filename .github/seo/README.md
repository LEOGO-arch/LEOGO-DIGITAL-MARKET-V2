# LEOGO GitHub static SEO publishing

This is an additive public discovery layer. The main LEOGO storefront, partner and staff portals and all payment/checkout logic stay unchanged. Existing Pages source remains main/root. The SEO function is installed on staging and production; the SQL file is the exact definition applied. Do not reapply it without checking migration history.

## Publishing
Run `node --test .github/seo/render.test.mjs`. The workflow Refresh LEOGO public SEO catalogue runs hourly and can be manually dispatched (dry-run by default). It fetches the dedicated read-only RPC with the existing public frontend key; never uses a service-role key. It generates only seo-catalogue/ and sitemap.xml, commits only those paths, uses a normal non-force push and explicitly requests the existing Pages build. If branch protection or token permissions reject the push/build, do not weaken controls; investigate and use reviewed publication. Check Actions and Pages after each release. A failed fetch/validation preserves the prior published files.

## Safety
The initial production snapshot contains only eligible product names and categories; no seller IDs, free-text descriptions, images, reviews, prices or stock quantities are persisted in generated pages. Current price and eligibility are fetched live on a product page; the shopping link is hidden until eligibility is confirmed. Variant, complex shipping and MOQ prices are not guessed. Market Day and final price/delivery remain in existing checkout; no Product Offer structured data yet. Restricted, inactive, suspended and unsubscribed listings are filtered server-side. Static page names and sitemap entries are removed on the next successful rebuild; GitHub Pages cannot guarantee instant removal or Google de-indexing. For urgent removals run the workflow immediately and verify publication. Category approval/classification must remain accurate.

The renderer validates an explicit category allowlist. New categories must be reviewed before adding them to SQL and renderer. No production data is used in staging fixtures. For staging preview, run `node .github/seo/publish.mjs --fixture /path/to/fixture.json --output /tmp/new-preview-directory` (new directory outside repository). Staging pages are noindex and have no shopping links. Do not deploy them publicly.

## Rollback and future hosting
Disable the refresh workflow before reverting this release. Restore the homepage-only sitemap and remove only generated seo-catalogue/ files, then publish and verify Pages. Keep current Cloudflare DNS and HTTPS. The Cloudflare Worker migration remains a separate future release. GitHub Pages is temporary development/testing infrastructure; review its commercial use restrictions before launch.
