# Use your own RPC

Every application RPC call runs on your machine through the endpoint you configure: market/stage reads, fee and balance checks, simulation, submission and confirmation. APILabPH does not supply a customer RPC or receive your RPC credentials. The public website hosts documentation; its former chain endpoints return HTTP 410 CUSTOMER_RPC_REQUIRED after this release is deployed.

## 1. Install

Use Node 22 or 24. Clone this repository, enter its directory and run:

```sh
git clone https://github.com/apilabph/pons-robinhood-buy-sell-api.git
cd pons-robinhood-buy-sell-api
npm ci --ignore-scripts
```

Create an ignored file named `.dev.vars` in the repository root:

```dotenv
CUSTOMER_RPC_URL="https://YOUR_RPC_ENDPOINT"
SETTLEMENT_ROUTER="VERIFIED_DEPLOYED_SETTLEMENT_ADDRESS"
```

Use an HTTPS endpoint for Robinhood Chain mainnet (4663). Missing RPC configuration stops startup; there is no implicit provider fallback. This file contains your provider credential if it is embedded in the URL. Keep it out of Git, screenshots and support messages. No wallet private key belongs in it.

The settlement address is required for quotes, trades and approvals. It must be the reviewed contract with this repository's fixed recipient, 25 bps fee and runtime bytecode. This project's settlement is still pending deployment; a made-up address cannot enable trading. Market inspection can run without it.

## 2. Run locally

```sh
npm run api:local
```

The server listens only at `http://127.0.0.1:8787`. Keep it running while your bot uses it. Set `LOCAL_API_PORT` if another local API uses that port. There is no customer API-key signup. This local server builds unsigned transactions only; it has no signing or broadcast endpoint.

Send the same JSON API requests to the local address. For example, in a second terminal (Bash-compatible shell):

```sh
curl http://127.0.0.1:8787/api/market \
  -H 'Content-Type: application/json' \
  --data '{"token":"TOKEN_ADDRESS"}'
```

Replace the public address placeholders. Buying uses a decimal ETH string; selling uses raw integer token units. A quote is not a trade. A build returns unsigned output after the existing validation and simulation checks. Fee/network/rent and independent price limits still need review before signing.

## 3. Or import directly inside a Node bot

Save `my-bot.mjs` in the repository root:

```js
import { createClient } from './client/index.mjs';

const client = createClient({
  rpcUrl: process.env.CUSTOMER_RPC_URL,
  settlementRouter: process.env.SETTLEMENT_ROUTER,
});

const order = {
  "publicKey": "YOUR_PUBLIC_WALLET",
  "token": "TOKEN_ADDRESS",
  "action": "buy",
  "amount": "0.01",
  "slippageBps": 100,
  "maxServiceFeeBps": 25
};
const result = await client.buildTrade(order);
console.log(result); // unsigned preparation; no trade was submitted
```

Run `node --env-file=.dev.vars my-bot.mjs`. This direct import needs no local HTTP server. Available methods: `quote(order)`, `buildTrade(order)`, `inspectMarket(token)` and `buildApproval(order)`. Importing the module performs no network work and never loads a wallet.

Your own signer signs the reviewed transaction. Your own RPC submits it and tracks the original signature/hash. The optional examples/bot.mjs helper uses the local API by default; give its rpcUrl and your local wallet/public clients the same customer endpoint. No automatic retry should create a second trade when the first confirmation is unknown.

## If submission is uncertain

The optional `executeTrade` example never automatically resends. If the send call throws or returns no valid transaction hash, it throws `SUBMISSION_UNKNOWN`, with `submissionAttempted: true` and `retrySafe: false`. There may be no hash to return: the node can accept a transaction and lose its reply. Pause that trading intent and reconcile your wallet's transaction history and nonce. Do not assume the trade failed because the request failed.

After a valid hash is returned, confirmation errors retain `error.hash` and `error.submitted === true`. A successful replacement/cancellation receipt is not treated as success for the original trade. This helper has no persistent order journal or cross-call deduplication; calling it again is a new send attempt. Your bot must keep its own durable order/nonce tracking.

## Fees, operating limits and verification

The 0.25% service fee and fixed recipient remain part of the reviewed transaction/settlement path. Stage detection, slippage limits and mandatory build simulation remain enabled. A fee is collected only when the fee-bearing swap succeeds on-chain. Open-source users can modify or bypass this integration; the library cannot force fees on unrelated or modified trades.

You are responsible for your RPC provider's allowance, latency and availability. This migration removes APILabPH-hosted RPC preparation; it does not guarantee zero total hosting cost, faster confirmation, or successful trading. The existing release evidence and funded-test limitations still apply. No funded trades were run for this change.

Offline tests use fake transports and fixture accounts to verify that calls go only to the customer endpoint, credentials do not cross destinations, simulation/fees remain checked, and the hosted customer mode makes zero network calls. Review/test before enabling a funded signer.
