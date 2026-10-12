import fs from "node:fs";
import solc from "solc";
import { keccak256 } from "viem";
const sources = Object.fromEntries(
  fs
    .readdirSync("contracts")
    .filter((x) => x.endsWith(".sol"))
    .map((x) => [x, { content: fs.readFileSync("contracts/" + x, "utf8") }]),
);
const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: "paris",
    metadata: { bytecodeHash: "none" },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
      },
    },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter((x) => x.severity === "error");
if (errors.length) {
  console.error(errors.map((x) => x.formattedMessage).join("\n"));
  process.exit(1);
}
const c = output.contracts["TradeSettlement.sol"].TradeSettlement,
  artifact = {
    compiler: solc.version(),
    settings: input.settings,
    abi: c.abi,
    bytecode: "0x" + c.evm.bytecode.object,
    runtimeBytecode: "0x" + c.evm.deployedBytecode.object,
    runtimeCodeHash: keccak256("0x" + c.evm.deployedBytecode.object),
  };
fs.mkdirSync("artifacts", { recursive: true });
fs.writeFileSync(
  "artifacts/TradeSettlement.json",
  JSON.stringify(artifact, null, 2) + "\n",
);
console.log({
  compiler: artifact.compiler,
  runtimeBytes: c.evm.deployedBytecode.object.length / 2,
  runtimeCodeHash: artifact.runtimeCodeHash,
});
