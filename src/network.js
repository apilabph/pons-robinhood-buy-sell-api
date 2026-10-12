export const CHAIN_ID = 4663;
export const RPC_URL = 'https://rpc.mainnet.chain.robinhood.com';
export const ZERO = '0x0000000000000000000000000000000000000000';
export const WETH = '0x0bd7d308f8e1639fab988df18a8011f41eacad73';
export const V3_FACTORY = '0x1f7d7550b1b028f7571e69a784071f0205fd2efa';
export const FACTORIES = Object.freeze([
  { version: 'v1', address: '0xa5aab3f0c6eeadf30ef1d3eb997108e976351feb', codeHash: '0x0a62b8ed1d88d30c7b342ea8361dfaf0ac336706992cf0c8ba38b129f06391d4' },
  { version: 'v1-legacy', address: '0x0c37a24f5d23a486fa692d1500881d698b1f77a4', codeHash: '0x921a0d1b2d854de5435804e8ee118658f05173a0eeebca5f41b41385b97cd1b5' },
  { version: 'v2', address: '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e', codeHash: '0x89a27da6f703e0a7cdd4f233e7cb57604ff75b164530962d3ff7cf8483a67d84' },
].map(Object.freeze));
export const CAPABILITIES = Object.freeze({
  version: '0.1.0-dev', chainId: CHAIN_ID, marketInspection: true,
  tradingEnabled: false, quotes: false, unsignedTransactions: false,
  signing: false, broadcast: false, feesCollected: false,
  plannedServiceFeeBps: 25, feeRecipientConfigured: false,
});
