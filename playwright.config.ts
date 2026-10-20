import { defineConfig, devices } from "@playwright/test";

// Browser end-to-end tests run against a dev/staging server with the demo seed loaded
// (`npm run db:seed`). They create uniquely-named accounts, so they can be re-run.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] }, grep: /@mobile/ },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : { command: "npm run dev", url: "http://localhost:3000/api/health", reuseExistingServer: true, timeout: 180_000 },
});
