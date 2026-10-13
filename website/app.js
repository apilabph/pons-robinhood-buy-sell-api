import { config } from "./config.js";
import { requestFor, codeFor, explainError } from "./request.js";
const $ = (id) => document.getElementById(id);
const form = $("request-form");
let language = "javascript";
let previousAction = "buy";
let request = null;
let busy = false;
const values = () => Object.fromEntries(new FormData(form));
function update() {
  const mode = $("operation").value;
  const market = mode === "market";
  $("trade-fields").hidden = market;
  $("trade-fields")
    .querySelectorAll("input,select")
    .forEach((input) => {
      input.disabled = market;
    });
  const action = $("action").value;
  if (action !== previousAction) {
    $("amount").value = action === "buy" ? "0.01" : "1000000000";
    previousAction = action;
  }
  $("amount-unit").textContent =
    action === "buy" ? config.native + " input" : "Raw token units";
  $("amount-help").textContent =
    action === "buy"
      ? "Trade budget only. Leave extra for gas" +
        (config.evm ? "." : " and account rent.")
      : "Example: 1 token with 6 decimals = 1000000 raw units.";
  $("run").disabled = busy || mode === "trade";
  $("run").textContent = market
    ? "Inspect token"
    : mode === "trade"
      ? "Build in your bot"
      : "Request quote";
  $("run-note").textContent =
    mode === "trade"
      ? "This playground generates build code only. Run it from your bot, then inspect and sign locally when ready."
      : market
        ? "Reads on-chain data. No wallet connection or trade."
        : config.evm
          ? "A quote needs settlement setup and a funded wallet for simulation. It does not submit a trade."
          : "Quotes are estimates without simulation. A transaction build performs simulation separately.";
  try {
    request = requestFor(values());
    $("request-code").textContent = codeFor(request, language);
    $("request-path").textContent = "POST " + request.path;
  } catch (error) {
    request = null;
    $("request-code").textContent = error.message;
  }
}
form.addEventListener("input", update);
form.addEventListener("change", update);
document.querySelectorAll("[data-language]").forEach((button) =>
  button.addEventListener("click", () => {
    language = button.dataset.language;
    document
      .querySelectorAll("[data-language]")
      .forEach((item) =>
        item.setAttribute("aria-pressed", String(item === button)),
      );
    update();
  }),
);
$("copy-code").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("request-code").textContent);
    $("copy-state").textContent = "Copied.";
  } catch {
    $("copy-state").textContent =
      "Clipboard unavailable. Select and copy the code above.";
  }
});
function feedback(message, kind = "") {
  $("feedback").textContent = message;
  $("feedback").className = "feedback " + kind;
}
async function jsonRequest(path, body) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
    redirect: "error",
  });
  const text = await response.text();
  if (text.length > 262144)
    throw Error("The response was too large to display.");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw Error("The service returned an unreadable response. Retry later.");
  }
  return { response, data };
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || $("operation").value === "trade") return;
  let prepared;
  try {
    prepared = requestFor(values(), true);
  } catch (error) {
    feedback(error.message, "error");
    return;
  }
  busy = true;
  update();
  feedback("Reading the current chain state...");
  $("result-json").hidden = true;
  const started = performance.now();
  try {
    const { response, data } = await jsonRequest(prepared.path, prepared.body);
    $("result-json").textContent = JSON.stringify(data, null, 2);
    $("result-json").hidden = false;
    $("response-timing").textContent =
      Math.round(performance.now() - started) +
      " ms for this browser request. Not transaction confirmation time.";
    if (!response.ok) {
      const code = data.error?.code || "HTTP_" + response.status;
      feedback(
        code +
          ": " +
          (data.error?.message || "Request failed.") +
          " " +
          explainError(code),
        "error",
      );
    } else {
      const stage = data.stage || data.venue || "See response";
      feedback(
        prepared.path === "/api/market"
          ? "Observed stage: " +
              stage +
              ". Market inspection does not prove a trade can execute."
          : "Quote received for " +
              stage +
              ". Review output units, minimum output and fee fields. This is not a completed trade.",
        "success",
      );
    }
  } catch (error) {
    feedback(
      error.name === "TimeoutError"
        ? "The request timed out. Nothing was signed or sent. Wait before retrying."
        : "Could not read the service: " + error.message,
      "error",
    );
  } finally {
    busy = false;
    update();
  }
});
$("check-status").addEventListener("click", async () => {
  $("check-status").disabled = true;
  $("status-result").textContent = "Checking API capabilities...";
  try {
    const { response, data } = await jsonRequest("/api/capabilities");
    if (!response.ok)
      throw Error(data.error?.code || "HTTP " + response.status);
    const checked = new Date().toLocaleTimeString();
    $("status-result").textContent = config.evm
      ? "Checked " +
        checked +
        ": settlement " +
        (data.settlementConfigured
          ? "configured; each build still verifies it"
          : "not configured") +
        ". Funded trading remains unverified." +
        (data.rpcReadiness === "public-provider-rate-limited"
          ? " The API reports public-RPC rate limits; market availability can vary."
          : "")
      : "Checked " +
        checked +
        ": API " +
        data.version +
        " responds. Funded trades tested: " +
        (data.fundedTradesTested === true ? "yes" : "no") +
        ". This is not a live-trade test.";
  } catch {
    $("status-result").textContent =
      "Status could not be verified. Read the release notes or retry later; documentation availability does not prove trading readiness.";
  } finally {
    $("check-status").disabled = false;
  }
});
update();
