import { defineConfig } from "@playwright/test";
const api = process.env.FIELDOPS_E2E_API === "true";
export default defineConfig({
  testDir: "./e2e",
  testMatch: api ? "api.spec.ts" : "workspace.spec.ts",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: api ? "http://127.0.0.1:5175" : "http://127.0.0.1:5174",
    headless: true,
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
            "VITE_DATA_SOURCE=api FIELDOPS_API_PROXY=http://127.0.0.1:3001 npm run dev -- --port 5175",
          url: "http://127.0.0.1:5175",
          timeout: 30000,
        },
      ]
    : {
        command: "VITE_DATA_SOURCE=demo npm run dev -- --port 5174",
        url: "http://127.0.0.1:5174",
        reuseExistingServer: !process.env.CI,
      },
});
