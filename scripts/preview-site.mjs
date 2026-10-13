import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../website/config.js";
const siteRoot = fileURLToPath(new URL("../website/", import.meta.url));
const types = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/style.css": ["style.css", "text/css; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/request.js": ["request.js", "text/javascript; charset=utf-8"],
  "/config.js": ["config.js", "text/javascript; charset=utf-8"],
  "/favicon.svg": ["favicon.svg", "image/svg+xml"],
  "/robots.txt": ["robots.txt", "text/plain; charset=utf-8"],
  "/sitemap.xml": ["sitemap.xml", "application/xml"],
};
const csp =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
export function createPreviewServer({ fetcher = fetch } = {}) {
  let active = 0;
  return http.createServer(async (req, res) => {
    const send = (status, body, type = "application/json; charset=utf-8") => {
      res.writeHead(status, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": csp,
      });
      res.end(req.method === "HEAD" ? undefined : body);
    };
    try {
      const port = req.socket.localPort;
      const hosts = ["127.0.0.1:" + port, "localhost:" + port];
      if (!hosts.includes(req.headers.host))
        return send(403, '{"error":{"code":"HOST_REJECTED"}}');
      if (
        req.headers.origin &&
        !hosts.map((h) => "http://" + h).includes(req.headers.origin)
      )
        return send(403, '{"error":{"code":"ORIGIN_REJECTED"}}');
      const url = new URL(req.url, "http://" + req.headers.host);
      if (["GET", "HEAD"].includes(req.method) && types[url.pathname]) {
        const [file, type] = types[url.pathname];
        return send(200, await fs.readFile(path.join(siteRoot, file)), type);
      }
      const allowed =
        req.method === "GET" && url.pathname === "/api/capabilities";
      if (!allowed || url.search)
        return send(
          404,
          '{"error":{"code":"PREVIEW_READ_ONLY","message":"Local preview serves documentation and static capabilities only."}}',
        );
      if (active >= 2)
        return send(
          429,
          '{"error":{"code":"RATE_LIMIT","message":"Wait for the current preview request to finish."}}',
        );
      active++;
      try {
        const upstream = await fetcher(config.api + url.pathname, {
          method: req.method,
          headers: {},
          redirect: "error",
          signal: AbortSignal.timeout(25000),
        });
        const reader = upstream.body?.getReader();
        let total = 0;
        const parts = [];
        if (reader) {
          try {
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              total += value.length;
              if (total > 262144) {
                await reader.cancel();
                throw Error("Response too large");
              }
              parts.push(value);
            }
          } finally {
            reader.releaseLock();
          }
        }
        const text = Buffer.concat(parts).toString("utf8");
        JSON.parse(text);
        return send(upstream.status, text);
      } finally {
        active--;
      }
    } catch {
      if (!res.headersSent)
        send(
          502,
          '{"error":{"code":"PREVIEW_UPSTREAM_UNAVAILABLE","message":"The read-only API request could not be completed. No transaction was submitted."}}',
        );
    }
  });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.SITE_PORT || config.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw Error("Use a port from 1024 to 65535.");
  const server = createPreviewServer();
  server.listen(port, "127.0.0.1", () =>
    console.log(config.short + " local website: http://127.0.0.1:" + port),
  );
  server.on("error", (e) => {
    console.error(e.code);
    process.exitCode = 1;
  });
}
