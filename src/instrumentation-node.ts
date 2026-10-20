import { startWorkerLoop } from "./server/jobs/worker";

const g = globalThis as unknown as { __omnihackWorker?: boolean };
if (process.env.RUN_WORKER_IN_PROCESS !== "false" && process.env.NODE_ENV !== "test" && !g.__omnihackWorker) {
  g.__omnihackWorker = true;
  startWorkerLoop();
  console.info("[worker] in-process background worker started");
}
