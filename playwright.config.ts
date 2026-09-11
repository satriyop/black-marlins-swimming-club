import { defineConfig } from "@playwright/test";

const port = process.env.SMOKE_PORT || "3011";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 0,
  use: { baseURL, trace: "off" },
  webServer: {
    command: `node .output/server/index.mjs`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
    env: {
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: port,
      BETTER_AUTH_SECRET: "ci-smoke-secret-not-for-prod",
      BETTER_AUTH_URL: baseURL,
      VITE_AUTH_ENABLED: "true",
    },
  },
});
