# PONS on Robinhood Chain

- Separate project from Pump and every other chain/launchpad. Follow the owner's review, fix, test, document, commit and push workflow.
- Current milestone is read-only mainnet market verification. Never describe it as a functioning trading or revenue service until unsigned builds, atomic fees, local signing integration and release verification are complete.
- Signing belongs inside users' bots. Never accept seed phrases, private keys or remote signing requests. Never sign, broadcast, approve token spending or move real funds during development or testing.
- Read chain ID and pin contract identities; use one explicit block snapshot for state. Reject unknown factories, inconsistent registration and unsupported phases. V1 graduation does not migrate pools. V2 has four distinct phases; do not collapse them to a boolean.
- Keep fees visible. The proposed service fee is 25 bps, subject to implemented atomic settlement and the owner-designated EVM recipient. The owner authorized separate local fee/test wallets; consult the encrypted local registry outside GitHub before asking for an address or creating duplicates. Never expose keys, substitute another recipient or charge a standalone transfer before a potentially failing swap.
- Read dynamic taxes from validated deployed contracts; do not copy a competitor's fixed tax duration or omit unknown fees. Reconcile upstream source/ABI/deployment versions before releasing transactions.
- No paid infrastructure, live transactions, token launch or deployment is authorized by this repository. Read-only public-chain calls and offline tests are permitted.
- Keep the repository private while developing the unverified adapter. No marketplace or public execution deployment exists yet.

The owner subsequently authorized completing development and public GitHub/Worker publication on October 13, 2026. This supersedes the private-development milestone restriction above. Funded contract deployment and live trades are still deferred until the owner funds and tests the wallets.

The owner requires customer-owned RPC for all application blockchain work. Customer mode runs reads/builds/simulations in the customer process; hosted chain endpoints must perform zero RPC calls. Require an explicit customer RPC with no implicit fallback. Keep the local signer and any routing credentials with the customer. Existing RapidAPI services are outside this migration.
