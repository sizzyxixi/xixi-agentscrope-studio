// Serve the design preview and forward real API requests to the development app.
import { createServer, request } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] || "work/store-demo-preview");
const port = Number(process.argv[3] || 3010);
const upstream = new URL(process.env.STORE_DEMO_API_ORIGIN || "http://127.0.0.1:3000");
createServer(async (req, res) => {
  if (req.url?.startsWith("/api/")) {
    const proxy = request({ hostname: upstream.hostname, port: upstream.port || 80, method: req.method, path: req.url, headers: { ...req.headers, host: upstream.host } }, response => {
      res.writeHead(response.statusCode || 502, response.headers);
      response.pipe(res);
    });
    proxy.on("error", () => { if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" }); res.end(JSON.stringify({ detail: "真实登录服务暂时不可用，请启动主应用服务。" })); });
    proxy.setTimeout(20000, () => proxy.destroy(new Error("Upstream timeout")));
    req.pipe(proxy);
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
    const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!file.startsWith(root + path.sep) || !(await stat(file)).isFile()) throw new Error("Not found");
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end("Not found"); }
}).listen(port, "127.0.0.1", () => console.log(`Store demo: http://127.0.0.1:${port}`));
