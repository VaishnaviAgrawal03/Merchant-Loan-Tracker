import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // Set PLAYWRIGHT_CHANNEL=chrome to use an installed Google Chrome instead of Playwright's Chromium.
      use: { ...devices["Desktop Chrome"], channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
    },
  ],
  // Playwright starts both servers itself. The API uses a throwaway in-memory database and runs in
  // development mode, which seeds the demo users (an unset NODE_ENV would mean production: no demo users).
  webServer: [
    {
      command: "npm --prefix ../backend start",
      url: "http://localhost:4000/health",
      env: { NODE_ENV: "development", DB_PATH: ":memory:", PORT: "4000" },
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
    {
      command: isCI ? "npm run start" : "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
