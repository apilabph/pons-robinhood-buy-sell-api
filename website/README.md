# PONS developer website

The owner requires all blockchain RPC usage on the customer side. This local website now generates code for the customer-run API at http://127.0.0.1:8787. It never forwards market, quote, build, approval or trade requests. The only optional hosted read is static capability metadata, which requires no RPC.

Use `npm run site:preview` for the local documentation preview. Use `npm run api:local` separately with CUSTOMER_RPC_URL in your ignored .dev.vars for the actual local API. [Customer setup guide](../docs/CUSTOMER-RPC.md).

The existing themes and fees remain. The redesigned websites still await publication; local UI verification does not establish funded trading. Previous website review evidence describes the earlier hosted-read playground. See the current review record for this migration.

## Visual theme

A dark canvas, green headings and bright green rounded actions, as requested by the owner. References: the green controls and rounded presentation of the [official PONS website](https://ponsfamily.com/launchpad), and the dark presentation of [Robinhood Chain](https://robinhood.com/chain), inspected in Edge on October 13, 2026. The palette is a design reference, not an affiliation claim. APILabPH keeps its own arrow mark, copy, examples and independent-integration identity.

Theme variables in `website/style.css` cover the page, navigation, controls, code panels, notices and feedback. The browser theme color, favicon and config accent match. Light text and green links remain readable on the dark surfaces; filled green controls use dark text. System fonts keep the preview self-contained without external font requests.
