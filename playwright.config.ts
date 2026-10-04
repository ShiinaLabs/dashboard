import { defineConfig, devices } from "@playwright/test";

const e2eBaseUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.pw.e2e.ts",
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: e2eBaseUrl || "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: e2eBaseUrl ? undefined : {
    command: "pnpm run mock",
    url: "http://localhost:5173/login",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
