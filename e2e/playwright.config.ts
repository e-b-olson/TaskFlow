import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  use: {
    // Points to the frontend service. In docker test env: http://test-frontend:80
    // For local runs: docker compose -f docker-compose.test.yml up -d, then use port 3001
    baseURL: process.env.BASE_URL || "http://localhost:3001",
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
