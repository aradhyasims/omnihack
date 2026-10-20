// Human-readable API reference rendered from the OpenAPI document (no third-party scripts).
import { openapi } from "@/server/openapi";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function GET() {
  const rows = Object.entries(openapi.paths)
    .flatMap(([path, ops]) =>
      Object.entries(ops as unknown as Record<string, { summary: string; security?: unknown }>).map(
        ([method, op]) =>
          `<tr><td><span class="m ${method}">${method.toUpperCase()}</span></td><td><code>/api${esc(path)}</code></td><td>${esc(op.summary)}</td><td>${op.security ? "Session" : "Public"}</td></tr>`,
      ),
    )
    .join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OmniHack API reference</title>
<style>body{font-family:system-ui,Segoe UI,sans-serif;margin:0;color:#0b1020;background:#f5f6fb}main{max-width:1000px;margin:auto;padding:40px 16px}h1{margin:0 0 8px}p{color:#474e6d;line-height:1.6}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d9dcea;border-radius:12px;overflow:hidden;font-size:14px}td,th{padding:10px 12px;border-bottom:1px solid #eceef6;text-align:left;vertical-align:top}th{background:#eceef6;font-size:12px;text-transform:uppercase;color:#636a89}
.m{font:700 11px monospace;padding:2px 6px;border-radius:4px;color:#fff}.get{background:#0891b2}.post{background:#4f46e5}code{font-size:13px}a{color:#4f46e5}</style></head>
<body><main><h1>OmniHack API v1</h1><p>${esc(openapi.info.description)}</p><p>Machine-readable spec: <a href="/api/v1/openapi.json">/api/v1/openapi.json</a></p>
<table><thead><tr><th>Method</th><th>Path</th><th>Description</th><th>Auth</th></tr></thead><tbody>${rows}</tbody></table></main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
