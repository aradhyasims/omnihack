// Starts the background worker inside the web process for development and single-instance
// deployments. Set RUN_WORKER_IN_PROCESS=false when running the dedicated worker container.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
