# Internal code review

## Code review - October 14, 2026

Reviewed input validation, customer RPC boundaries, local HTTP handling, account and market identities, routing/settlement, fee and slippage handling, signing examples, failure recovery, documentation and regression coverage. Existing contract sources were read; this patch changes no contract or deployed bytecode. This is internal code review, not an independent audit.

- **Medium: ambiguous submission failures.** A node can accept a transaction before the send call loses its reply. The helper formerly propagated that raw exception. It now marks the outcome as SUBMISSION_UNKNOWN, submissionAttempted true and retrySafe false, suppresses provider details, and makes no second send. Missing/malformed hashes follow the same rule. Regressions cover lost acknowledgements, malformed hashes, exact send counts and secret redaction, in addition to existing receipt replacement/revert/timeout checks.
- **Low: unread HTTP error responses.** The EVM read-only RPC client formerly threw on HTTP failure without cancelling the response body. It now cancels unread bodies on non-2xx responses, releasing the stream on rate limits and other errors. A streamed 429 regression reproduced the old failure and now passes.

Validation results are recorded in [the local check evidence](evidence/code-review-2026-10-14.json). Regression tests exercise mocked transports and fixture accounts. Existing fee, stage, simulation, customer-only RPC and documentation-only host tests are included in the full suite.

Update your clone with `git pull --ff-only`, run `npm ci --ignore-scripts`, and restart the local API/bot to use these changes. Customer processes do not update when a public documentation site is deployed. The public host's customer-RPC mode and website previews are unchanged. No Worker deployment, live trade, wallet operation, mainnet contract deployment or chain request was performed for this review. Funded verification remains outstanding; settlement deployment is still required. Prices, migrations and third-party upgrades can still invalidate a prepared transaction.


## Customer RPC migration — October 13, 2026

The customer process now performs chain reads, transaction preparation and simulation through its explicit RPC. The hosted Worker defaults to documentation-only mode and returns HTTP 410 CUSTOMER_RPC_REQUIRED for former chain operations, even if old operator secrets remain. Local signing/submission stays with the bot. The fee rate/recipient and protocol validation are unchanged.

Review fixed implicit public-RPC fallback, stale hosted quickstarts, missing-RPC error handling and browser chain forwarding. 60 automated tests, syntax/specification checks, Worker dry-run and dependency audit passed. The local website passed Edge interaction, six-width layout and sampled contrast checks; it sends no chain requests. [Recorded local evidence](evidence/customer-rpc-local-review.json). No funded trade, settlement deployment or live chain request was performed for this migration.

Customers must follow [the migration guide](CUSTOMER-RPC.md). EVM settlement and funded-trade requirements remain. Code-only website previews remain local. Deployment/readback evidence is recorded separately.


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

## Local website review — October 13, 2026

Reviewed the separate website, generated request examples and loopback-only preview server. Fixed zero slippage being silently replaced with the default. Public inputs stay text in the DOM and generated JavaScript; POSIX cURL values are shell-quoted. Preview requests reject private/unknown fields, incomplete quote bodies, foreign origins/hosts, oversized inputs and every transaction/build/approval endpoint. Only pinned-origin reads are forwarded; credentials are not forwarded. Clarified quote versus simulation versus submission, request timing versus confirmation, and funded-trade readiness. Browser QA uses mocked UI cases; actual read-only checks are separate. No contract or trading behavior changed.

## Follow-up review - October 13, 2026

Reviewed API input/RPC boundaries, stage classification, route or settlement construction, fee handling, local integration examples and the developer website. This was an internal review, not an independent security audit.

- Fixed false trade-success reporting in the local bot example. Viem can resolve receipt polling with a successful cancellation or replacement. The helper now requires the original submitted hash, preserves that hash on confirmation errors, includes a replacement hash when available, and never retries automatically. Gas-only replacements also require separate caller verification. Mocked tests cover success, cancellation, unknown receipt identity, revert and timeout; no live transaction was sent.
- Bounded request uploads by time as well as bytes: three seconds and 4096 bytes, strict UTF-8 JSON, no compressed bodies. Stalled and chunked uploads, false Content-Length, invalid UTF-8 and unsupported encodings are tested before any RPC call. OpenAPI documents 408, 413 and 415 responses.

Verification: 54 tests passed; syntax/OpenAPI checks, Worker dry-run build and npm audit passed with zero reported vulnerabilities. Recompilation reproduced the committed Solidity runtime artifact without bytecode changes. Funded trading was not tested. See the release record for the deployment/readback status of this patch.

## Final local website review - October 13, 2026

Fixed two request-state issues: empty/numeric-zero amounts and empty directions could silently fall back to sample values, and an earlier quote could remain visible after the inputs changed. Regression tests reproduced the old acceptance before the fix. Empty/invalid submitted values are rejected; old response JSON and timing are cleared on edits, and delayed results for older inputs are discarded. The browser cannot copy an empty-amount sample as a valid generated request.

Added explicit operator-versus-customer RPC guidance to the quick start and FAQ. Clarified POSIX-shell cURL requirements and corrected the preview proxy description. All local website checks, syntax/specification checks, Edge interaction/error/keyboard tests, six viewport widths and sampled contrast checks passed. Reviewed desktop/mobile screenshots. See [local review evidence](evidence/website-final-local-review.json) for the scope and results. Existing funded-test and settlement-deployment limitations remain. This change does not deploy the redesigned websites or alter trading contracts.
