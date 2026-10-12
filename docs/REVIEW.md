# Internal code review

October 13, 2026. Source, settlement contract, HTTP/RPC boundary, local examples, documentation and reproducible artifacts reviewed. A mocked local-client execution test rejects altered fee calldata and stops a quote below the bot?s own price limit before signing. This is an internal engineering review, not an independent smart-contract audit.

## Findings fixed

- Charge buy fees on actual native input consumed, within the total budget. Preserve donated balances and refund unused input. V3 partial fills unwrap the unspent wrapped currency before refund.
- Check minimum output after protocol effects and service fees. Failed minimum checks roll back both swap and fee.
- Sell pulls must arrive in full; taxed transferFrom, rebasing inconsistencies and residual input fail atomically. Approvals are exact, cleared after protocol use, and never unlimited. Nonzero insufficient user allowances require a zero reset. False-returning approval simulations are rejected.
- Recheck stage during on-chain execution; unknown states, counterfeit venues, unsupported quote assets and unreviewed router bytecode fail closed. The API uses one block for quote reads and checks for a reorganization and a later stage change.
- Protocol calls use fixed targets, reentrancy protection and pinned fee constants. PONS V4 callbacks require the expected manager and exact pending payload; callbacks cannot be replayed.
- Public RPC has no signing/broadcast methods, client-supplied URL, key input or unbounded response. Provider messages are suppressed. HTTP bodies and edge request rates are bounded.
- solc's vulnerable tmp dependency is overridden to 0.2.7. npm audit reports zero vulnerabilities.

## Verification and limits

43 automated tests passed locally, including EVM bytecode execution for fee/refund atomicity, rejected token transfers, reentrancy, failure rollback, wrong chain and allowance cleanup. API tests exercise each declared stage and direction using fixtures, plus deployment mismatches, stage races, block changes and HTTP/RPC failures. Existing PONS inspector tests remain in place. These mocks are not proof of protocol coverage.

Read-only mainnet state-overlay round trips passed for: v2-bonding-curve, v1-uniswap-v3. Only our undeployed router/probe code and synthetic caller funding were overlaid; protocol storage was not changed. The evidence records exact hashes, blocks and measured outputs. No real funds, signatures or broadcasts were used.

PONS V2 Uniswap V4 graduation is implemented but has not yet passed a live protocol simulation in this release. Some recent graduated samples used an unsupported ERC20 quote. Public Robinhood RPC also returned HTTP protection/rate errors during discovery. Funded tests and settlement deployment remain prerequisites for activating hosted trades. Dynamic protocol upgrades, taxes, RPC availability and execution-time market changes remain operating risks; simulation does not guarantee inclusion or success.
