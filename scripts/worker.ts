// Dedicated background worker process: `npm run worker`.
import { startWorkerLoop } from "../src/server/jobs/worker";

console.info("[worker] OmniHack worker started");
const stop = startWorkerLoop(3000);
setInterval(() => {}, 1 << 30);
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    stop();
    console.info("[worker] stopped");
    process.exit(0);
  });
}
