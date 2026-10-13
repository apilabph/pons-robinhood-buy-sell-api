# Deploy settlement and run locally

The public Worker is documentation only (RPC_MODE=customer). Read [customer RPC setup](CUSTOMER-RPC.md) before using local chain endpoints. Settlement deployment below remains a one-time prerequisite; this RPC migration does not deploy it.

1. Install Node 22 or 24; run the checks in README. Review the Solidity source, fee recipient and compiled artifact. No constructor arguments or owner key are needed.
2. Fund a separate deployment/test wallet with ETH on chain 4663. Deployment spends gas; the API fee wallet does not need funding for ordinary native receipts. Never fund an address merely because it appears in an example.
3. Use the exported `deploymentRequest()` helper in `examples/deploy.mjs` with your local wallet or hardware signer. It returns unsigned deployment data. Inspect it and choose explicitly when to broadcast. This repository's tests never broadcast.
4. Wait for the deployment receipt. Run `verifyDeployment(rpcUrl, contractAddress)` from that module to compare chain, runtime code hash, fee and recipient. A hash mismatch stops setup.
5. Publish the verified settlement address in release metadata. Customers set SETTLEMENT_ROUTER and CUSTOMER_RPC_URL in their own ignored .dev.vars file and start `npm run api:local`. The local builder rechecks chain ID, runtime bytecode and fee constants; it does not trust a supplied address alone. Do not put customer RPC credentials in a hosted Worker.
6. Check the local /api/deployment and read-only market requests. With the funded test wallet, request a tiny buy, inspect calldata and simulation, then sign locally only when ready to spend. Test curve buy/sell, graduation buy/sell, stage-change rejection and actual fee receipts before describing this as production trading.

No contract deployment, token approval or live trade was executed during development. Public documentation hosting is separate from on-chain readiness. If protocol identities or fee recipients change, recompile, review, test, deploy a new contract and explicitly configure it; this contract is not upgradeable.

Never send funds directly to the settlement address. It has no administrative withdrawal method. The service receives fees only from successful trades through the reviewed router.

RPC requirement: each customer uses their own Robinhood Chain endpoint. The APILabPH documentation Worker needs no RPC secret. Helius Solana endpoints cannot serve this EVM chain.
