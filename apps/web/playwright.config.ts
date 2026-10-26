import { defineConfig } from "@playwright/test";
const api = process.env.FIELDOPS_E2E_API === "true";
export default defineConfig({
  testDir: "./e2e",
  testMatch: api ? "api.spec.ts" : "workspace.spec.ts",
  fullyParallel: false,
  expect: { timeout: 10000 },
  workers: 1,
  use: {
    baseURL: api ? "http://127.0.0.1:5175" : "http://127.0.0.1:5174",
    headless: true,
    actionTimeout: 15000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    },
  },
  webServer: api
    ? [
        {
          command: "node scripts/e2e-api-server.cjs",
          url: "http://127.0.0.1:3001/api/v1/health/ready",
          timeout: 60000,
        },
        {
          command:
            "node scripts/e2e-vite-server.cjs api",
          url: "http://127.0.0.1:5175",
          timeout: 30000,
        },
      ]
    : {
        command: "node scripts/e2e-vite-server.cjs demo",
        url: "http://127.0.0.1:5174",
        reuseExistingServer: !process.env.CI,
      },
});
