import { defineConfig, devices } from "@playwright/test";

// Runs against the real API on its local SQLite file (started below), with E2E_USERNAME and
// E2E_PASSWORD set to the owner made by `npm run create-owner` in api/.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure" },
  projects: [
    { name: "phone-android", use: { ...devices["Pixel 7"] } },
    { name: "phone-iphone", use: { ...devices["iPhone 14"] } },
    { name: "tablet", use: { ...devices["iPad Mini"], browserName: "chromium" } },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: "npm --prefix ../api run dev",
      url: "http://localhost:3000/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    { command: "npm run dev", url: "http://localhost:5173", reuseExistingServer: true },
  ],
});
