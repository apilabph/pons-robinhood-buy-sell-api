import { config } from "./config.js";
import { requestFor, codeFor } from "./request.js";
const $ = (id) => document.getElementById(id);
const form = $("request-form");
let language = "javascript";
let previousAction = "buy";
let request = null;
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
  $("run").disabled = true;
  $("run").textContent = "Run in your local API";
  $("run-note").textContent = "Generate code here, then run it against your local API. All chain calls use your own RPC; this page sends none.";
  try {
    request = requestFor(values());
    $("request-code").textContent = codeFor(request, language);
    $("request-path").textContent = "POST " + request.path;
  } catch (error) {
    request = null;
    $("request-path").textContent = "Complete the request fields";
    $("request-code").textContent = error.message;
  }
  $("copy-code").disabled = !request;
}
function clearResult() {
  $("result-json").hidden = true;
  $("result-json").textContent = "";
  $("response-timing").textContent = "";
}
function inputsChanged() {
  clearResult();
  $("copy-state").textContent = "";
  feedback("Code updated. Run the request against your own local API.");
  update();
}
form.addEventListener("input", inputsChanged);
form.addEventListener("change", inputsChanged);
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
async function jsonRequest(path) {
  const response = await fetch(path, {
    method: "GET",
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
form.addEventListener("submit", (event) => {
  event.preventDefault();
  feedback("Run the generated code against your own local API. This page makes no blockchain requests.");
});
$("check-status").addEventListener("click", async () => {
  $("check-status").disabled = true;
  $("status-result").textContent = "Checking API capabilities...";
  try {
    const { response, data } = await jsonRequest("/api/capabilities");
    if (!response.ok)
      throw Error(data.error?.code || "HTTP " + response.status);
    const checked = new Date().toLocaleTimeString();
    $("status-result").textContent = data.rpcMode === "customer"
      ? "Checked " + checked + ": customer RPC mode. Run chain requests locally; this host serves documentation only."
      : config.evm
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
