# Inspector review - October 13, 2026

Scope: development-only market inspection. This review does not certify any trading, fee collection or deployed V2 implementation.

## Findings fixed

- Address normalization by itself is not a checksum check. The request validator now rejects an invalid mixed-case checksum before RPC access; covered by a negative test.
- Breaking an HTTP body iterator on an oversized request can destroy the connection before the 413 response. The bounded reader now avoids destroying the stream on iterator exit, drains/closes rejected requests and passes an HTTP oversize test.
- A phase-0 V2 record can already have a closed curve. Stage classification reads readiness and reports `curve-closed-awaiting-sweep`; unknown/inconsistent phases reject rather than suggest a buy/sell route.
- A V1 graduated flag does not imply pool migration. Inspection verifies the same canonical V3 pool and reports no required migration.
- Snapshot reads use an explicit block number and check its header again before returning. Tests reject changed blocks, stale timestamps, changed factory code, duplicate registration, malformed ABI output and counterfeit pools.

The read transport restricts methods to chain/header/code/view calls, bounds timeout and response size, rejects redirects and suppresses upstream details. HTTP accepts only a token; there is no remote RPC, key, signing or broadcast input. This is a loopback development server, not a production authentication/rate-limiting design.

## Verification

- 27 Node tests passed locally, covering market identity/stage failures, transport boundaries and HTTP request/concurrency limits.
- Syntax/specification checks passed. `npm audit --audit-level=moderate` reported zero vulnerabilities in the installed dependency tree.
- Read-only mainnet check at `2026-10-12T19:33:44.810Z`: chain 4663, block `86923456`, hash `0x39875aebd259a85857698cc39ac9e662204439993b4b0d4e574121edad17076a`; reference token `0x39dBED3a2bd333467115dE45665cC57F813C4571` matched the legacy factory and canonical V3 pool `0x10CC6BD38112cAc182db90B6a71d8Bb5939526bA`.
- That single read took 1,465 ms locally; it is not a quote, transaction-build or confirmation benchmark. No live trade was simulated, signed or broadcast.
- CI runs the offline suite on Node 22 and 24. Its result is available in GitHub Actions after push; local results alone do not establish CI completion.

## Remaining work

V2 tax/source reconciliation and live coverage remain open. Factory code hashes record an observed deployment, not proof that its public source matches. V2 pool identity, approvals, quote math, refunds, trade construction and atomic service fees are unimplemented. The owner authorized separate local fee/test wallet creation; keys stay outside this repository. A generated recipient does not remove any protocol or release prerequisites. Production hosting/capacity, performance verification and user-run funded trade tests remain outstanding.
