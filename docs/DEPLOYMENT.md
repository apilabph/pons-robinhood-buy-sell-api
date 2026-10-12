# Deploy this API

1. Install Node 22 or 24; run the checks in README. Review the Solidity source, fee recipient and compiled artifact. No constructor arguments or owner key are needed.
2. Fund a separate deployment/test wallet with ETH on chain 4663. Deployment spends gas; the API fee wallet does not need funding for ordinary native receipts. Never fund an address merely because it appears in an example.
3. Use the exported `deploymentRequest()` helper in `examples/deploy.mjs` with your local wallet or hardware signer. It returns unsigned deployment data. Inspect it and choose explicitly when to broadcast. This repository's tests never broadcast.
4. Wait for the deployment receipt. Run `verifyDeployment(rpcUrl, contractAddress)` from that module to compare chain, runtime code hash, fee and recipient. A hash mismatch stops setup.
5. Add SETTLEMENT_ROUTER to the Worker's environment and EVM_RPC_URL as a protected Worker secret if using a dedicated provider. Neither value comes from API requests. Then run `npx wrangler deploy`. Keep private RPC credentials out of wrangler.toml and Git.
6. Check /api/deployment and read-only market requests. With the funded test wallet, request a tiny buy, inspect calldata and simulation, then sign locally only when ready to spend. Test curve buy/sell, graduation buy/sell, stage-change rejection and actual fee receipts before describing this as production trading.

No contract deployment, token approval or live trade was executed during development. Public documentation hosting is separate from on-chain readiness. If protocol identities or fee recipients change, recompile, review, test, deploy a new contract and explicitly configure it; this contract is not upgradeable.

Never send funds directly to the settlement address. It has no administrative withdrawal method. The service receives fees only from successful trades through the reviewed router.

Current hosting prerequisite: configure a dedicated Robinhood Chain EVM_RPC_URL secret. Both the official shared endpoint and PublicNode returned HTTP errors from the Worker. Local reads and state-overlay simulations succeeded, but those do not establish hosted availability. No new provider account or paid subscription has been created. Helius endpoints configured for the Solana services cannot serve this EVM chain.
