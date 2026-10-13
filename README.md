# PONS Robinhood Chain Buy and Sell API

Build buy and sell transactions for PONS Robinhood Chain with keys kept inside your bot. The API checks the token's current stage, simulates the trade, and sets a minimum net output. Independent integration; not an official launchpad product.

**0.2.0-beta: source and hosted documentation published; funded trading is pending.** The settlement contract has not been deployed. Market inspection is implemented. Hosted public-RPC reads have returned both 503 rate-limit failures and successful results; the October 13 local website readback succeeded, but reliable production capacity is not established. Configure a dedicated Robinhood Chain EVM_RPC_URL before launch; local public-RPC checks have succeeded. Quote/trade/approval endpoints return `SETUP_REQUIRED` until the operator deploys and configures the reviewed contract. No fees are being collected by this new service yet. This is separate from RapidAPI and the Pump API.

[Hosted docs](https://pons-robinhood-trade.apilabph.workers.dev) · [OpenAPI](openapi.json) · [Release status](docs/RELEASE.md)

## Try market inspection now

```bash
curl https://pons-robinhood-trade.apilabph.workers.dev/api/market \
  -H "Content-Type: application/json" \
  -d '{"token":"TOKEN_ADDRESS"}'
```

Replace TOKEN_ADDRESS with a real ETH-paired launchpad token address. No API key is required. Public beta limits are six requests per minute per IP and twenty per minute per service at the edge; shared RPC/hosting limits also apply.

## Buy after settlement setup

```bash
curl https://pons-robinhood-trade.apilabph.workers.dev/api/trade \
  -H "Content-Type: application/json" \
  -d '{"publicKey":"YOUR_PUBLIC_WALLET","token":"TOKEN_ADDRESS","action":"buy","amount":"0.01","slippageBps":100,"maxServiceFeeBps":25}'
```

The wallet must have funds for the trade **and gas**. Buy amounts are decimal ETH strings. For a sell, set `action:"sell"` and supply a raw integer token amount. No private key belongs in any API request.

If a sell returns `APPROVAL_REQUIRED`, send the same body to `/api/approval`, inspect and sign that exact approval locally, wait for its receipt, then rebuild. A nonzero insufficient allowance is reset to zero first. Unlimited approvals are never requested.

The response contains an unsigned transaction, simulated output, fee, refund, stage, block snapshot and deadline. Your bot checks these, signs locally and submits through its own RPC. The API never signs, sends transactions or retries a failed trade automatically. See [local bot integration](examples/bot.mjs): prepareTrade returns a transaction for your review; executeTrade uses your already configured local wallet client, checks your strategy minimum, submits once and waits for a receipt. It never asks the API to sign. If submission status is uncertain, inspect the transaction/nonce before retrying. Confirmation errors retain the submitted hash in error.hash and set error.submitted to true. A replacement or cancellation receipt is not reported as a completed trade; error.replacementHash identifies it when available. Even gas-only replacements need separate verification by your bot.

## Supported markets

PONS V2 native-ETH bonding curves, PONS V1 WETH/Uniswap V3 pools and PONS V2 native-ETH/Uniswap V4 graduation pools. Closed curves, intermediate migration phases, rescued markets and ERC20 quote assets are rejected. This is Robinhood Chain, not a Robinhood brokerage API.

Tokens that charge a tax when transferred from your wallet to the settlement contract cannot be sold through this beta. Reverting, rebasing or nonstandard tokens can fail simulation. Protocol taxes, hook fees and restrictions are evaluated by the actual chain call; a quote is not a guarantee of future execution.

## Fees and safeguards

The service fee is **0.25% (25 basis points)**, sent atomically in ETH to `0x6A17d358ae138A726b4dda7A95C104440AAdb2DB`. Buy fees are 0.25% of native currency actually spent by the protocol, included within your total budget; unused input is refunded. Sell fees are deducted from the native proceeds received from the protocol before payout. Protocol fees/taxes and network gas are separate.

A failed swap reverts the service fee. Network gas can still be charged. API calls alone do not earn trading fees, and forks can remove this fee. The fee recipient and rate are compiled constants, not request parameters.

The settlement contract verifies the stage again during execution. A changed stage reverts; rebuild instead of reusing a stale transaction. Absolute minimum output is checked against the buyer's received token balance or the seller's native payout **after** our fee. The API verifies exact deployed bytecode and fee constants before returning a trade.

## Operator setup and development

```bash
npm ci --ignore-scripts
npm run compile
npm test
npm run check
npm run build:check
npm audit --audit-level=moderate
```

See [deployment](docs/DEPLOYMENT.md) for the one-time on-chain setup. User funding and live tests are deferred. Do not point SETTLEMENT_ROUTER at a token, wallet, proxy or unrelated router; a bytecode mismatch is rejected.

The reviewed Solidity artifact is reproducible with the pinned compiler. Keys stay in local wallets; never commit them or put them in shell arguments. Cloudflare and RPC quotas are shared. No paid hosting upgrade, uptime SLA, speed guarantee or independent security audit is claimed. Build latency and chain confirmation are separate measurements.

## Separate developer website (local review)

A redesigned website is ready for local review in [website/](website/README.md). Run `npm run site:preview`, then open http://127.0.0.1:8815. It includes a read-only playground, three-language examples, fees, coverage and troubleshooting. Local browser and automated checks are documented in [website verification](docs/WEBSITE.md). The redesign has not been deployed and no custom domain is configured.

Requests must use uncompressed UTF-8 JSON, stay within 4096 bytes and finish uploading within three seconds. Incomplete uploads return HTTP 408; oversized bodies return 413; unsupported content types or encoding return 415. These limits apply before any chain reads.
