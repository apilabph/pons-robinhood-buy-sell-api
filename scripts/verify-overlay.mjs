// Read-only RPC calls with local code/balance overlays. No signing or broadcast.
import fs from "node:fs";
import solc from "solc";
import {
  encodeFunctionData,
  decodeFunctionResult,
  decodeErrorResult,
  toHex,
  parseAbi,
} from "viem";
import artifact from "../artifacts/TradeSettlement.json" with { type: "json" };
import config from "../src/config.json" with { type: "json" };
const token = process.argv[2],
  mode = process.argv[3] ?? "roundtrip";
if (!/^0x[0-9a-fA-F]{40}$/.test(token ?? ""))
  throw new Error(
    "Provide a public token address, optionally followed by buy.",
  );
const router = "0x00000000000000000000000000000000a911ab01",
  probe = "0x00000000000000000000000000000000a911ab02",
  caller = "0x00000000000000000000000000000000a911ab03";
const source =
  "pragma solidity 0.8.37; interface R{function stage(address)external view returns(uint8,address,uint24);function buy(address,uint256,uint256,uint256,uint8)external payable returns(uint256,uint256,uint256);function sell(address,uint256,uint256,uint256,uint256,uint8)external returns(uint256,uint256);}interface T{function approve(address,uint256)external returns(bool);}contract Probe{receive()external payable{} function run(address router,address token,bool roundtrip,bool quantize)external payable returns(uint256 bought,uint256 buyFee,uint256 sold,uint256 sellFee){(uint8 s,,)=R(router).stage(token);(bought,buyFee,)=R(router).buy{value:msg.value}(token,1,block.timestamp+60,25,s);if(roundtrip){uint256 amount=quantize?bought/1e9*1e9:bought;require(amount>0);require(T(token).approve(router,amount));(sold,sellFee)=R(router).sell(token,amount,1,block.timestamp+60,25,s);}}}";
const compilation = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: { "Probe.sol": { content: source } },
      settings: {
        optimizer: { enabled: true, runs: 200 },
        evmVersion: "paris",
        outputSelection: {
          "*": { "*": ["abi", "evm.deployedBytecode.object"] },
        },
      },
    }),
  ),
);
if ((compilation.errors ?? []).some((x) => x.severity === "error"))
  throw new Error("Probe compilation failed");
const c = compilation.contracts["Probe.sol"].Probe;
let id = 0;
async function rpc(method, params = []) {
  const r = await fetch(process.env.EVM_RPC_URL ?? config.rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json();
  if (j.error) {
    const data =
      typeof j.error.data === "string" ? j.error.data : j.error.data?.data;
    let decoded;
    try {
      decoded = decodeErrorResult({ abi: artifact.abi, data });
    } catch {}
    throw Object.assign(new Error(j.error.message ?? "RPC error"), {
      detail: decoded ?? data,
    });
  }
  return j.result;
}
if (BigInt(await rpc("eth_chainId")) !== BigInt(config.chainId))
  throw new Error("Wrong chain");
const block = await rpc("eth_getBlockByNumber", ["latest", false]);
const override = {
  [router]: { code: artifact.runtimeBytecode },
  [probe]: { code: "0x" + c.evm.deployedBytecode.object },
  [caller]: { balance: toHex(10n ** 18n) },
};
const stageData = await rpc("eth_call", [
  {
    to: router,
    data: encodeFunctionData({
      abi: artifact.abi,
      functionName: "stage",
      args: [token],
    }),
  },
  block.number,
  override,
]);
const stage = decodeFunctionResult({
  abi: artifact.abi,
  functionName: "stage",
  data: stageData,
});
const tx = {
  from: caller,
  to: probe,
  value: toHex(100000000000000n),
  gas: toHex(6000000n),
  data: encodeFunctionData({
    abi: c.abi,
    functionName: "run",
    args: [
      router,
      token,
      mode !== "buy",
      config.slug.startsWith("four") && stage[0] === 0,
    ],
  }),
};
const start = Date.now();
try {
  const result = await rpc("eth_call", [tx, block.number, override]),
    values = decodeFunctionResult({
      abi: c.abi,
      functionName: "run",
      data: result,
    });
  const evidence = {
    verifiedAt: new Date().toISOString(),
    chainId: config.chainId,
    token,
    stage: config.stages[stage[0]],
    market: stage[1],
    mode,
    block: BigInt(block.number).toString(),
    runtimeCodeHash: artifact.runtimeCodeHash,
    simulation: "passed",
    boughtRaw: values[0].toString(),
    buyFeeWei: values[1].toString(),
    soldNetWei: values[2].toString(),
    sellFeeWei: values[3].toString(),
    elapsedMs: Date.now() - start,
    stateOverrides: [
      "undeployed settlement runtime",
      "test probe runtime",
      "synthetic caller native balance",
    ],
    protocolStateOverridden: false,
    signed: false,
    submitted: false,
    fundedLiveTrade: false,
  };
  fs.mkdirSync("docs/evidence", { recursive: true });
  fs.writeFileSync(
    "docs/evidence/overlay-" + stage[0] + "-" + mode + ".json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence));
} catch (e) {
  console.log(
    JSON.stringify(
      {
        token,
        stage: config.stages[stage[0]],
        mode,
        error: e.message,
        detail: e.detail,
      },
      (_, x) => (typeof x === "bigint" ? x.toString() : x),
    ),
  );
  process.exitCode = 1;
}
