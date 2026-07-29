import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  retries: 0,
  use: {
    // Points to the isolated test-api service (port 5002), NOT the production app.
    // Start with: docker compose -f docker-compose.test.yml up -d
    baseURL: process.env.BASE_URL || "http://localhost:5002",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
