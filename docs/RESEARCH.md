# Research record and implementation update

The original feasibility notes below describe the earlier read-only milestone. As of 0.2.0-beta, native trading source, atomic settlement, unsigned builders, approvals and local bot examples are implemented. V1 and V2 curve state-overlay round trips passed. On-chain deployment, funded verification and V2 V4 mainnet coverage remain pending; see RELEASE.md and REVIEW.md. Quotes execute the current protocol through eth_call rather than assuming a fixed tax duration or reimplementing stale reserve math.

# PONS feasibility - October 13, 2026

The owner selected Robinhood Chain/PONS as the next separate integration, using local bot signing and a fee-earning model similar to Pump. This authorizes a focused prototype; public research has not established paying customers for our version. No third parties were contacted and no paid service was purchased.

## Buyer and useful difference

Target existing wallet and bot developers handling PONS across contract generations. Their recurring integration problem is selecting the real trading venue, handling closed graduation phases, accounting for approvals/taxes and recovering uncertain submissions. Proposed improvements are an inspectable transaction and cost report, explicit service-fee and tax ceilings, and persistent locally signed execution. These remain acceptance criteria, not implemented trading features or claims of uniqueness.

PumpDev documents both locally signed and hosted PONS trades, launch streams, quotes and launch-tax protection. Its published local commission is 0.5%, versus 1% for hosted Lightning. A proposed 0.25% local service commission would be lower, but upstream fees, taxes, gas and support costs still matter. Local signing and automatic routing already exist elsewhere. [PumpDev](https://pumpdev.io/pons-api).

Ponsapi documents wallet-signature authentication, chain data, unsigned trades and hosted execution. Its documentation describes token-gated access and current open access; commercial terms require rechecking before a launch comparison. Direct contract integration is another alternative. [Ponsapi](https://ponsapi.dev/docs).

GitHub examples and a useful API guide are the initial acquisition channel. We have no verified competitor subscriber totals, user interviews, paid pilots or projected revenue. Measure real developer integrations before broadening to every Robinhood launchpad. RPC traffic without successful trades earns nothing: track requests per completed trade and support cost. Existing public RPC access is for development, not reserved production capacity.

## Protocol findings

Robinhood's official network is EVM chain 4663 with ETH as gas. A read-only probe confirmed `eth_chainId` and nonempty code at the published PONS factories. This is separate from the Robinhood brokerage product. [Robinhood network](https://robinhood.com/us/en/support/articles/robinhood-chain-mainnet/).

V1 starts in a WETH Uniswap V3 pool. Reaching the graduation threshold leaves trading in that same pool. Both the active and legacy factories matter for recognition. The documented reference PONS token belongs to the legacy generation. [V1 integration](https://docs.ponsfamily.com/).

V2 uses a curve and four factory phases: curve, swept awaiting pool creation, pool created, and rescued. Sells can close when ready to graduate before the factory phase changes. Launches may use native ETH or other quote assets. Initial trade scope should be native ETH/WETH only. [V2 integration](https://docs.ponsfamily.com/v2).

The upstream repository at commit `97199b7a06a314654ea124593f52c1a530b7f03f` describes both generations. Its published curve file omits launch-tax getters/logic described by current integration documentation, while its factory file contains tax settings. This requires reconciliation with deployed verified contracts. Do not infer current taxation from a time constant or stale source. Blockscout's smart-contract JSON endpoint returned HTML during our attempted read; source/bytecode equivalence has not been established. [Upstream source](https://github.com/ponsdotdev/pons-labs/tree/97199b7a06a314654ea124593f52c1a530b7f03f).

## Release prerequisites

- Owner-controlled EVM public fee recipient: the owner subsequently authorized wallet generation and selected separate fee/test wallets per API. Both now exist in the local encrypted registry, outside GitHub. Only the public recipient may enter future deployment configuration; it has not yet been configured into an executable fee route.
- Reconcile V2 deployed curve/hook bytecode, ABI, taxes, partial-fill/refund behavior and supported router versions.
- Prove an atomic integrator-fee path for buys and sells. Creator/protocol revenue getters do not entitle our service to that revenue. A separate fee transfer before the swap is unacceptable.
- Implement bounded quotes, unsigned transaction construction, approval checks, full simulation, stage rechecks and user-side signing/receipt recovery.
- Review and test each supported route, including migration, fee limits, failed swaps and actual-net-output accounting. Keep real trades user-run and separate from offline/read-only verification.
- Establish RPC/hosting capacity, publish accurate documentation and confirm a useful developer integration. A public deployment and earning claim are premature today.

The first implementation reads and validates market identity/stage. It deliberately returns no transaction bytes, approvals, signatures or claim that a market is safe to buy.
