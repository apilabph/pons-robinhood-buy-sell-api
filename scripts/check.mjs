import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
for (const dir of ["src", "scripts", "examples", "test"]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (/\.(js|mjs)$/.test(f)) {
      const r = spawnSync(process.execPath, ["--check", path.join(dir, f)], {
        stdio: "inherit",
      });
      if (r.status) process.exit(r.status);
    }
  }
}
const api = JSON.parse(fs.readFileSync("openapi.json", "utf8"));
if (api.openapi !== "3.1.0" || !api.paths["/api/trade"])
  throw new Error("Invalid OpenAPI");
for (const f of fs.readdirSync("contracts")) {
  const text = fs.readFileSync("contracts/" + f, "utf8");
  for (const m of text.matchAll(/bytes20\(hex"([0-9a-f]+)"\)/g))
    if (m[1].length !== 40) throw new Error("Malformed contract address");
}
console.log("Syntax, OpenAPI and embedded address checks passed.");
