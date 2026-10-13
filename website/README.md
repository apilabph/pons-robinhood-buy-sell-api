# PONS developer website

The owner requested a separate website for each API and local verification before buying domains or deploying the redesigned sites. This directory is the reviewed local website source. The existing hosted API and its earlier documentation page remain deployed independently. No domain was purchased or connected.

## Preview locally

On Windows, double-click **Preview Website.cmd** in the repository root, then open the localhost link it displays. Node 22 or 24 must be installed.

From a terminal in this repository:

```sh
npm run site:preview
```

Open http://127.0.0.1:8815. Stop the server with Ctrl+C. The server binds only to 127.0.0.1. SITE_PORT can override the default port. Static files are in website/; no frontend dependency installation or build is needed.

The playground uses a small local proxy to keep browser requests on the same origin and restrict which hosted API operations it can call. Only capability reads, market inspection and quotes are allowed. The proxy pins the destination to https://pons-robinhood-trade.apilabph.workers.dev, validates request fields, rejects foreign Origin/Host headers and never forwards cookies or Authorization. It cannot proxy transaction builds, approvals, signing or broadcasts. Request contents are not persisted. Read-only calls still consume the hosted beta quota.

## What visitors get

- A prominent Buy and Sell headline, the API name directly below, and a matching header label on desktop and mobile.
- A product-specific landing page, mobile layout and independent-integration identity.
- Guided requests with JavaScript, Python and POSIX-shell cURL examples.
- Correct amount-unit explanations, a fee ceiling and operation-specific requirements.
- Error code explanations and next actions, without an automatic retry loop.
- Live capability checks on demand; no background polling or tracking.
- Accurate stage coverage, beta limits, fee disclosure, GitHub support and release evidence.

The browser never connects to a wallet. The trade option generates build code; it does not execute a build or trade. Current status and coverage text are explicit editorial content in website/index.html and website/config.js. Update them only after verifying the corresponding release.

## Visual theme

A dark canvas, green headings and bright green rounded actions, as requested by the owner. References: the green controls and rounded presentation of the [official PONS website](https://ponsfamily.com/launchpad), and the dark presentation of [Robinhood Chain](https://robinhood.com/chain), inspected in Edge on October 13, 2026. The palette is a design reference, not an affiliation claim. APILabPH keeps its own arrow mark, copy, examples and independent-integration identity.

Theme variables in `website/style.css` cover the page, navigation, controls, code panels, notices and feedback. The browser theme color, favicon and config accent match. Light text and green links remain readable on the dark surfaces; filled green controls use dark text. System fonts keep the preview self-contained without external font requests.

## Checks and evidence

Run `npm run site:check` for request-generation, public-address/amount validation, string escaping, read-only proxy, origin restrictions and credential-field rejection tests. These checks also run under `npm test`.

All five local sites were checked in installed Microsoft Edge via Playwright at 1440×1000 and 390×844. Code tabs, operation changes, exact sell amounts, disabled browser trade submission, success/error guidance and FAQ interaction passed with no JavaScript errors or horizontal overflow. UI success/error cases use mocked responses; see docs/evidence/website-local-browser.json. Screenshots are in docs/evidence/website-desktop.png and website-mobile.png.

The launchpad theme revision was also checked at widths 320, 390, 760, 768, 1024 and 1440 pixels. All kept the headline visible without horizontal overflow. Sampled text contrast was at least 8.54:1; the checked input border was 4.79:1 and placeholder text was 9.84:1. See docs/evidence/website-theme-review.json. These are targeted layout and contrast checks, not a complete accessibility audit.

Actual read-only calls through the local proxy are recorded separately in website-local-readback.json. These do not prove a funded trade or reliable production capacity. No private keys were used.

## Later publication and custom domain

Keep this site in this API's repository. When the owner chooses its domain, update canonical, Open Graph, robots and sitemap URLs to that site origin. The API origin may remain separate in website/config.js; example URLs and same-origin /api routes must agree with the chosen deployment arrangement.

The recommended deployment serves these assets and the existing API under the same Worker/custom domain. A separate static host needs a production-grade, bounded, same-origin read proxy or a reviewed CORS change. The local preview server is not a production server. The current Worker is not wired to this new website directory, so running wrangler deploy alone does not publish the redesign.

Before publication: verify routing/CSP, mobile and keyboard behavior, links, public API requests and readiness copy. Recheck Search Console ownership and indexing after a domain exists. A sitemap does not guarantee indexing or ranking. API settlement setup and funded-trade verification remain separate requirements.

## Final local review - October 13, 2026

The quick start and FAQ now distinguish operator RPC reads/build simulation from the customer RPC used for local verification, submission and confirmation. RPC provider allowances remain separate from the service fee. No credentials are requested by the playground.

Fixed empty/zero amounts and blank trade directions being replaced with defaults, and stale results remaining visible after request fields change. A delayed response for old inputs is discarded. Generated requests with a missing amount cannot be copied; cURL examples identify their POSIX-shell requirement. Regression coverage and browser evidence are recorded in docs/evidence/website-final-local-review.json. This review does not establish funded trading or deploy the redesigned website.
