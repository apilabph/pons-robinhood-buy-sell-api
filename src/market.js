import { decodeFunctionResult, encodeFunctionData, getAddress, isAddress, keccak256 } from 'viem';
import { CHAIN_ID, FACTORIES, V3_FACTORY, WETH, ZERO } from './network.js';
import { ApiError, requireThat, hexData, quantity } from './rpc.js';
import { v1, v2, views } from './abi.js';

const equal = (a, b) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
export function tokenAddress(value) {
  requireThat(typeof value === 'string' && isAddress(value, { strict: true }) && !equal(value, ZERO), 'INVALID_TOKEN', 'Provide a nonzero EVM token address with a valid checksum or all lowercase.', 400);
  try { return getAddress(value); } catch { throw new ApiError('INVALID_TOKEN', 'Token address checksum is invalid.', 400); }
}
export function classifyV2(phase, graduated, ready) {
  requireThat(Number.isInteger(phase) && phase >= 0 && phase <= 3, 'UNKNOWN_PHASE', 'Unknown PONS V2 phase.');
  if (phase === 0) {
    requireThat(!graduated, 'INCONSISTENT_STAGE', 'Factory and curve disagree about graduation.');
    return ready ? 'curve-closed-awaiting-sweep' : 'bonding-curve';
  }
  requireThat(graduated, 'INCONSISTENT_STAGE', 'Factory phase requires a swept curve.');
  return ['unused', 'swept-awaiting-pool', 'pool-created', 'rescued'][phase];
}
function blockInfo(block, now) {
  requireThat(block && quantity(block.number) && quantity(block.timestamp) && /^0x[0-9a-fA-F]{64}$/.test(block.hash), 'INVALID_BLOCK', 'Invalid RPC block header.');
  const age = BigInt(Math.floor(now / 1000)) - BigInt(block.timestamp);
  requireThat(age >= -30n && age <= 120n, 'STALE_BLOCK', 'RPC snapshot is stale or has a future timestamp.');
  return block;
}

export async function inspectMarket(rpc, input, { factories = FACTORIES, now = Date.now } = {}) {
  const token = tokenAddress(input);
  const chain = await rpc('eth_chainId');
  requireThat(quantity(chain) && BigInt(chain) === BigInt(CHAIN_ID), 'WRONG_CHAIN', 'RPC is not Robinhood Chain mainnet.');
  const block = blockInfo(await rpc('eth_getBlockByNumber', ['latest', false]), now());
  const at = block.number;
  async function code(address, expected) {
    const value = await rpc('eth_getCode', [address, at]);
    requireThat(hexData(value) && value.length > 2, 'MISSING_CODE', 'An expected contract has no code.');
    if (expected) requireThat(keccak256(value) === expected, 'CONTRACT_CHANGED', 'Factory code differs from the reviewed observation.');
    return keccak256(value);
  }
  async function read(address, abi, name, args = []) {
    const data = encodeFunctionData({ abi, functionName: name, args });
    const result = await rpc('eth_call', [{ to: address, data }, at]);
    requireThat(hexData(result), 'INVALID_CONTRACT_RESULT', 'Contract result is not hex data.');
    try { return decodeFunctionResult({ abi, functionName: name, data: result }); }
    catch { throw new ApiError('INVALID_CONTRACT_RESULT', 'Contract result does not match the expected view ABI.'); }
  }
  // No cache of stages or code identity. Parallel reads all use the explicit block number.
  await Promise.all([code(token), ...factories.map(f => code(f.address, f.codeHash))]);
  const registrations = await Promise.all(factories.map(async factory => ({ factory,
    record: await read(factory.address, factory.version === 'v2' ? v2 : v1, 'getLaunchedToken', [token]) })));
  const known = registrations.filter(r => r.record.exists);
  requireThat(known.length > 0, 'UNKNOWN_TOKEN', 'Token is not registered with a pinned PONS factory.', 404);
  requireThat(known.length === 1, 'AMBIGUOUS_TOKEN', 'Multiple PONS factories claim this token.');
  const { factory, record } = known[0];
  requireThat(equal(record.token, token), 'REGISTRATION_MISMATCH', 'Factory record refers to a different token.');
  let market;
  if (factory.version === 'v2') {
    const curveCodeHash = await code(record.curve);
    const [curveToken, curveFactory, pair, graduated, ready] = await Promise.all([
      read(record.curve, views, 'token'), read(record.curve, views, 'factory'),
      read(record.curve, views, 'pairToken'), read(record.curve, views, 'graduated'), read(record.curve, views, 'readyToGraduate'),
    ]);
    requireThat(equal(curveToken, token) && equal(curveFactory, factory.address) && equal(pair, record.pairToken), 'CURVE_MISMATCH', 'Curve identity disagrees with its factory registration.');
    market = { stage: classifyV2(record.phase, graduated, ready), phase: record.phase,
      curve: record.curve, curveCodeHash, quoteAsset: record.pairToken,
      quoteAssetWithinPlannedScope: equal(record.pairToken, ZERO) || equal(record.pairToken, WETH),
      poolIdentityVerified: false, taxesVerified: false };
  } else {
    requireThat(equal(record.pairedToken, WETH), 'UNSUPPORTED_PAIR', 'V1 inspector currently covers WETH pairs only.', 422);
    const pool = await read(token, views, 'liquidityPool');
    await code(pool);
    const [canonical, poolFactory, token0, token1, fee, graduation] = await Promise.all([
      read(V3_FACTORY, views, 'getPool', [token, WETH, record.poolFee]), read(pool, views, 'factory'),
      read(pool, views, 'token0'), read(pool, views, 'token1'), read(pool, views, 'fee'),
      read(factory.address, v1, 'graduationStatus', [token]),
    ]);
    const pairMatches = (equal(token0, token) && equal(token1, WETH)) || (equal(token1, token) && equal(token0, WETH));
    requireThat(equal(canonical, pool) && equal(poolFactory, V3_FACTORY) && pairMatches && fee === record.poolFee && record.isToken0 === equal(token0, token), 'POOL_MISMATCH', 'V1 pool is inconsistent with its factory registration.');
    market = { stage: 'uniswap-v3-pool', pool, quoteAsset: WETH, poolFeeUnits: fee,
      poolFeeDenominator: 1000000, graduationThresholdReached: graduation[2],
      migrationRequiredAtGraduation: false, restrictionsEndBlock: record.restrictionsEndBlock.toString(),
      earlyRestrictionsElapsed: BigInt(at) > record.restrictionsEndBlock, poolIdentityVerified: true };
  }
  const end = blockInfo(await rpc('eth_getBlockByNumber', [at, false]), now());
  requireThat(end.number === at && end.hash === block.hash, 'SNAPSHOT_CHANGED', 'Snapshot block changed during inspection; retry the read.');
  return { chainId: CHAIN_ID, token, factory: factory.address, factoryVersion: factory.version,
    snapshot: { number: BigInt(at).toString(), hash: block.hash, timestamp: Number(BigInt(block.timestamp)) },
    ...market, tradingEnabled: false,
    warning: 'Read-only observation from a trusted RPC. Not a quote, tradeability guarantee or transaction. Stage can change after this snapshot.' };
}
