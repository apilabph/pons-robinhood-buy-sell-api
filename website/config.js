export const config = {
  slug: "pons-robinhood-buy-sell-api",
  short: "PONS",
  name: "PONS Robinhood Chain Buy and Sell API",
  host: "pons-robinhood-trade",
  network: "Robinhood Chain · 4663",
  native: "ETH",
  evm: true,
  pons: true,
  accent: "#77ee80",
  port: 8815,
  fee: "0x6A17d358ae138A726b4dda7A95C104440AAdb2DB",
  hero: "Buy and Sell PONS API",
  lead: "Prepare for PONS trading on Robinhood Chain with current-stage checks, explicit fee limits and transactions signed inside your bot.",
  status:
    "Setup pending: the operator needs a reliable Robinhood Chain RPC and settlement deployment. Public RPC has been intermittent; a successful read does not establish reliable capacity. Funded trading and fee collection are not active.",
  statusLabel: "Setup pending",
  stage: "PONS V1 + V2",
  coverage: [
    "PONS V2 native-ETH bonding curves.",
    "PONS V1 WETH / Uniswap V3 pools.",
    "V2 native-ETH / Uniswap V4 adapter is implemented; mainnet simulation verification is pending.",
  ],
  limits: [
    "ERC-20 quote assets, closed curves and intermediate migration phases.",
    "Rescued markets and unknown factories.",
    "Sells taxed on transfer from your wallet into the settlement contract.",
  ],
  evidence:
    "Read-only state-overlay tests exercised legacy V1 and V2 curve buy/sell roundtrips. No deployed settlement or funded trades. V2 native-ETH V4 mainnet verification is pending.",
  special:
    "This is Robinhood Chain, chain ID 4663. It is not a Robinhood brokerage integration. Gas and test funds must be on Robinhood Chain.",
  api: "https://pons-robinhood-trade.apilabph.workers.dev",
  github: "https://github.com/apilabph/pons-robinhood-buy-sell-api",
};
