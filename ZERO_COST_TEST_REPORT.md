# Zero-cost Intel Core i3 deployment test

**Selected platform:** Cloudflare Pages only.

## Passed

- Static landing page and console
- Overview, Models, Fleet, and Shelby views
- Canary failure, rollback, and completion to 100%
- Browser-side SHA-256 model registration flow
- Redesigned landing page and application console
- Clay-inspired visual system across all screens
- Hugeicons CDN integration and 10+ icon usages per page
- Mobile landing and console at 390×844 without horizontal overflow
- Zero application JavaScript errors
- Cloudflare Pages health function
- Cloudflare Pages safe public-config function
- Shelby secret not returned to the client
- Wrangler TOML and package JSON parsing
- Public deployment payload: approximately 45 KB
- Public-file secret scan

## Resource profile

- No Docker
- No local compilation with GitHub integration
- No database
- No VM
- No paid domain
- Hosting and HTTPS supplied by Cloudflare Pages

## QA environment note

The sandbox could not resolve `cdn.hugeicons.com`, so visual captures showed the layout with empty icon slots. The official Hugeicons CDN stylesheet is correctly linked on both pages and allowed by the Cloudflare Content Security Policy. It should load normally after public deployment.

## Important limitation

The interactive product demo is fully deployable at zero cost. Real Shelby uploads are not enabled because they require Early Access credentials and confirmation that the current Shelby Node SDK runs correctly in Cloudflare's Workers runtime. The key must never be placed in browser code.
