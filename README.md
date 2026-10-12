# PONS Buy and Sell API for Robinhood Chain

Development project for an independent PONS trading integration. **The current version only inspects markets. It cannot buy, sell, quote, sign transactions or collect fees.** Robinhood Chain is a blockchain; this project does not connect to Robinhood brokerage accounts.

The inspector recognizes registered PONS tokens, distinguishes V1 pools from V2 curve/graduation phases, and labels results with the block it read. It rejects changed factory code, inconsistent registrations and stale snapshots. This is useful groundwork for routing a trade; it does not establish that a token is safe or currently sellable.

Repository: [apilabph/pons-robinhood-buy-sell-api](https://github.com/apilabph/pons-robinhood-buy-sell-api). Development is private. Hosting: local development only. RapidAPI: none. This project is separate from the Pump APIs.

## Try the inspector

Use Node 22 or 24. No wallet, funding or customer API key is needed for these read-only requests.

```sh
npm ci --ignore-scripts
npm test
npm start
```

The server listens on `127.0.0.1:8788`. From another terminal:

```sh
curl -X POST http://127.0.0.1:8788/v1/market \
  -H "Content-Type: application/json" \
  -d '{"token":"0x39dBED3a2bd333467115dE45665cC57F813C4571"}'
```

Or in PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8788/v1/market `
  -ContentType 'application/json' `
  -Body '{"token":"0x39dBED3a2bd333467115dE45665cC57F813C4571"}'
```

The reference token was observed as `v1-legacy`, with `stage: "uniswap-v3-pool"` and `tradingEnabled: false`. A V1 graduation threshold does not change its pool. V2 reports a different lifecycle:

| Stage | Meaning of this observation |
| --- | --- |
| `bonding-curve` | Factory phase 0; curve has not reported readiness to graduate |
| `curve-closed-awaiting-sweep` | Still phase 0, but curve reports readiness; do not assume sells remain available |
| `swept-awaiting-pool` | Phase 1; reserves swept and pool creation pending |
| `pool-created` | Phase 2; factory reports a pool, but this inspector has not verified its V4 identity |
| `rescued` | Phase 3; terminal rescue state, unsupported for trading |

Every response is a snapshot. Another transaction can change the stage immediately afterward. V2 dynamic taxes, hooks, trade amounts and fee settlement remain unverified.

`GET /health` reports process liveness. `GET /v1/capabilities` states exactly what exists. See [API specification](openapi.json) and [API details](docs/API.md).

## Fees and wallets

The intended service fee is **0.25%**, subject to a verified atomic settlement design and an owner-controlled EVM public recipient. No fee is charged by this prototype. Protocol fees, taxes and gas are separate; the future API must disclose them and respect customer limits. The owner authorized separate local fee/test wallets; they have been generated and stored outside this repository. The fee address has not been activated in an execution route. An address alone does not activate trading.

Signing will happen inside each customer's bot. Never send this service a seed phrase or private key. No hosted signing or remote execution is implemented.

## Development and release status

```sh
npm test
npm run check
npm audit --audit-level=moderate
npm run verify:live
```

The live script reads public chain state only; it does not simulate or submit a trade. `ROBINHOOD_RPC_URL` can select an operator-managed HTTPS endpoint through the environment. Never commit a credential-bearing URL or put it in command arguments. The default public RPC is not reserved production capacity.

Before a trading release: reconcile deployed V2 ABI/taxes with published source; validate the graduated pool/router; implement quotes, transaction construction, approvals and atomic fee settlement; simulate buys/sells and failures; add local execution/recovery; review and test; establish operating limits. Later, user-run funded tests must verify completed trades and actual fee receipts. None of those outcomes should be inferred from inspector tests.

[Research and blockers](docs/RESEARCH.md) · [Review and verification](docs/REVIEW.md) · [Third-party notices](THIRD_PARTY_NOTICES.md)
