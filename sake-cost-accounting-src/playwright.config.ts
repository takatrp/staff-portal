import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 3,
  timeout: 60_000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173/staff-portal/sake-cost-accounting-mockup/",
    trace: "retain-on-failure",
    actionTimeout: 10_000,
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/staff-portal/sake-cost-accounting-mockup/",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], browserName: "chromium", viewport: { width: 1440, height: 900 } } },
    { name: "wide-tablet", use: { ...devices["Desktop Chrome"], browserName: "chromium", viewport: { width: 1024, height: 768 } } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], browserName: "chromium", viewport: { width: 768, height: 1024 } } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], browserName: "chromium", viewport: { width: 390, height: 844 } } },
  ],
});
