import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/browser",
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5186/geome-project-setup-module/",
    headless: true,
  },
  projects: [
    {
      name: "desktop",
      testIgnore: "**/iphone.spec.mjs",
      use: { channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
    },
    {
      name: "iphone",
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
  ],
  webServer: {
    command:
      "node scripts/serve.mjs --port 5186 --base /geome-project-setup-module/",
    url: "http://127.0.0.1:5186/geome-project-setup-module/",
    reuseExistingServer: false,
  },
});
