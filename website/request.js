import { config } from "./config.js";

export function requestFor(values, strict = false) {
  const operation = values.operation || (config.evm ? "market" : "quote");
  if (
    !["quote", "trade", ...(config.evm ? ["market"] : [])].includes(operation)
  )
    throw Error("Choose a supported operation.");
  const addressPattern = config.evm
    ? /^0x[0-9a-fA-F]{40}$/
    : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const getAddress = (key, fallback) => {
    const value = String(values[key] || "").trim();
    if (strict && !addressPattern.test(value))
      throw Error(
        "Enter a valid public " +
          key +
          " address. Private keys never belong here.",
      );
    return value || fallback;
  };
  const body = {
    [config.evm ? "token" : "mint"]: getAddress(
      "token",
      config.evm ? "TOKEN_ADDRESS" : "TOKEN_MINT",
    ),
  };
  if (operation === "market") return { path: "/api/market", body };
  body.publicKey = getAddress("wallet", "YOUR_PUBLIC_WALLET");
  if (config.needsMarket)
    body.market = getAddress("market", "ORIGINAL_DBC_CURVE_ADDRESS");
  body.action = values.action ?? (strict ? undefined : "buy");
  if (!["buy", "sell"].includes(body.action))
    throw Error("Choose buy or sell.");
  const amount = String(values.amount ?? "").trim();
  if (!amount && (strict || Object.hasOwn(values, "amount")))
    throw Error("Enter an amount. Clearing the field does not select a default trade size.");
  body.amount = amount || (body.action === "buy" ? "0.01" : "1000000000");
  const decimals = config.evm ? 18 : 9;
  const pattern =
    body.action === "buy"
      ? new RegExp("^(0|[1-9][0-9]{0,2})(?:\\.([0-9]{1," + decimals + "}))?$")
      : /^(0|[1-9][0-9]{0,38})$/;
  if (strict) {
    if (!pattern.test(body.amount))
      throw Error(
        body.action === "buy"
          ? "Use a positive decimal " +
              config.native +
              " amount (up to " +
              decimals +
              " decimal places)."
          : "Sell amounts must be a positive integer in raw token units.",
      );
    const [whole, fraction = ""] = body.amount.split(".");
    const raw =
      body.action === "buy"
        ? BigInt(whole) * 10n ** BigInt(decimals) +
          BigInt(fraction.padEnd(decimals, "0"))
        : BigInt(whole);
    if (
      raw <= 0n ||
      (body.action === "buy" && raw > 100n * 10n ** BigInt(decimals)) ||
      (body.action === "sell" &&
        raw > (config.evm ? (1n << 128n) - 1n : (1n << 64n) - 1n))
    )
      throw Error(
        "Amount is outside the supported range. Buys are capped at 100 " +
          config.native +
          ".",
      );
    if (config.four && body.action === "sell" && raw % 1000000000n !== 0n)
      throw Error(
        "For Four.Meme bonding-curve sells, use a raw amount divisible by 1,000,000,000. Do not round a balance upward.",
      );
  }
  body.slippageBps = Number(values.slippage ?? 100);
  if (
    !Number.isInteger(body.slippageBps) ||
    body.slippageBps < 1 ||
    body.slippageBps > (config.evm ? 1000 : 5000)
  )
    throw Error(
      "Slippage is outside the supported range. 100 basis points means 1%.",
    );
  body.maxServiceFeeBps = 25;
  return { path: "/api/" + operation, body };
}

export function codeFor(request, language) {
  const url = "http://127.0.0.1:8787" + request.path;
  const body = JSON.stringify(request.body, null, 2);
  if (language === "curl") {
    const quote = (value) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
    return (
      "curl " +
      quote(url) +
      " \\\n  -H 'Content-Type: application/json' \\\n  --data-raw " +
      quote(body)
    );
  }
  if (language === "python")
    return (
      "import json\nimport urllib.request\nimport urllib.error\n\npayload = json.loads(" +
      JSON.stringify(JSON.stringify(request.body)) +
      ")\nrequest = urllib.request.Request(\n    " +
      JSON.stringify(url) +
      ',\n    data=json.dumps(payload).encode(),\n    headers={"Content-Type": "application/json"},\n    method="POST",\n)\ntry:\n    with urllib.request.urlopen(request, timeout=30) as response:\n        print(json.load(response))\nexcept urllib.error.HTTPError as error:\n    print(error.code, error.read().decode())\n# This request does not sign or send a trade.'
    );
  return (
    "const response = await fetch(" +
    JSON.stringify(url) +
    ', {\n  method: "POST",\n  headers: { "Content-Type": "application/json" },\n  body: JSON.stringify(' +
    body.split("\n").join("\n  ") +
    '),\n  signal: AbortSignal.timeout(30000),\n});\nconst result = await response.json();\nif (!response.ok) throw new Error(\n  result.error?.code + ": " + result.error?.message\n);\nconsole.log(result);\n// Your bot verifies, signs and sends a trade separately.'
  );
}

export function explainError(code) {
  const help = {
    SETUP_REQUIRED:
      "The service operator still needs to deploy and configure the settlement contract. Changing your wallet or slippage will not fix this.",
    RPC_UNAVAILABLE:
      "The upstream blockchain provider is unavailable or limiting requests. Check your own RPC endpoint and provider allowance before retrying.",
    RPC_ERROR:
      "The blockchain read failed. Try again later; changing slippage is not a general fix.",
    RATE_LIMIT:
      "Respect your RPC provider’s retry guidance and reduce concurrent requests.",
    RATE_LIMITED:
      "Respect your RPC provider’s retry guidance and reduce concurrent requests.",
    MIGRATION_PENDING:
      "The token is moving to its next trading stage. Wait, then request a fresh quote. An old transaction may no longer match the market.",
    STAGE_CHANGED:
      "The market changed while the request was being prepared. Get a fresh quote and review it before signing.",
    SNAPSHOT_CHANGED:
      "The chain snapshot changed during the read. Make a fresh request; do not reuse the old result.",
    ROUTE_UNAVAILABLE:
      "The router could not find a supported route. A newly launched token may not be indexed yet. Wait or check supported markets.",
    WALLET_NOT_FUNDED:
      "A transaction build needs native currency for gas and account setup. Use your funded trading wallet public address.",
    INSUFFICIENT_BALANCE:
      "Check the input balance and leave native currency available for network gas.",
    INSUFFICIENT_TOKEN_BALANCE:
      "Check your token balance and its decimals. Sells use raw units, not a displayed decimal balance.",
    APPROVAL_REQUIRED:
      "In your local bot, request an exact approval at /api/approval, verify and sign it, wait for confirmation, then rebuild the sell. Never approve an unknown spender.",
    FEE_LIMIT_EXCEEDED:
      "The service fee is 25 basis points (0.25%). Review the fee before changing your maximum.",
    SIMULATION_FAILED:
      "The proposed trade failed its current-state check. Review balances, supported markets and protocol restrictions. Increasing slippage does not fix every failure.",
    UNSUPPORTED_PAIR:
      "This release supports native-currency pairs only. Check the coverage section before trying another token.",
  };
  return (
    help[code] ||
    "Read the API message and coverage notes. If it persists, open a GitHub issue with the error code and request ID. Do not include keys, credentials or signed transactions."
  );
}
