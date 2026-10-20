// HTTP load test for read-heavy public traffic and the public API.
// Usage: BASE_URL=http://localhost:3100 node scripts/load-test.mjs [durationSeconds] [connections]
// Run against a production build (`next build && next start`), never against `next dev`.
import autocannon from "autocannon";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const duration = Number(process.argv[2] ?? 15);
const connections = Number(process.argv[3] ?? 25);

const scenarios = [
  ["Homepage", "/"],
  ["Competition search", "/competitions?type=HACKATHON&phase=open"],
  ["Competition page", "/competitions/smart-campus-ideathon-demo"],
  ["Public API list", "/api/v1/competitions"],
  ["Certificate verification API", "/api/v1/certificates/OH-2222-3333-4444/verify"],
  ["Health", "/api/health"],
];

const rows = [];
for (const [name, path] of scenarios) {
  // Certificate verification is rate-limited by design; spread load across fake client IPs.
  const result = await autocannon({
    url: base + path,
    connections,
    duration,
    requests: [
      {
        setupRequest: (req) => ({
          ...req,
          headers: { ...req.headers, "x-forwarded-for": `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}` },
        }),
      },
    ],
  });
  const codes = Object.fromEntries(
    Object.entries(result)
      .filter(([k]) => /^\dxx$/.test(k))
      .map(([k, v]) => [k, v]),
  );
  rows.push({
    scenario: name,
    "req/s (avg)": Math.round(result.requests.average),
    "p50 ms": result.latency.p50,
    "p90 ms": result.latency.p90,
    "p99 ms": result.latency.p99,
    requests: result.requests.total,
    errors: result.errors + result.timeouts,
    non2xx: result.non2xx,
    codes: JSON.stringify(codes),
  });
}
console.log(`\nLoad test: ${connections} concurrent connections × ${duration}s per scenario against ${base}\n`);
console.table(rows);
