import { parseAbi } from "viem";

// Minimal view interfaces described by the upstream pinned revision in docs/RESEARCH.md.
export const v1 = parseAbi([
  "function getLaunchedToken(address) view returns ((address token,address deployer,address pairedToken,address positionManager,uint256 positionId,uint256 dexId,uint256 launchConfigId,uint256 restrictionsEndBlock,uint256 supply,bool isToken0,uint24 poolFee,bool exists,uint256 initialBuyAmount))",
  "function graduationStatus(address) view returns (uint256 pairedPrincipal,uint256 threshold,bool graduated)",
]);
export const v2 = parseAbi([
  "function getLaunchedToken(address) view returns ((address token,address curve,address deployer,address creatorFeeRecipient,address pairToken,uint256 graduationThreshold,uint24 poolFee,int24 tickSpacing,uint16 creatorTaxBps,bool buybackEnabled,uint8 phase,uint256 sweptQuote,uint256 sweptTokens,uint256 sweptAt,bool exists))",
]);
export const views = parseAbi([
  "function liquidityPool() view returns (address)",
  "function token() view returns (address)",
  "function factory() view returns (address)",
  "function pairToken() view returns (address)",
  "function graduated() view returns (bool)",
  "function readyToGraduate() view returns (bool)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function getPool(address,address,uint24) view returns (address)",
]);
