import { defineConfig } from "@playwright/test";
const production = !!process.env.E2E_PREVIEW;
const url = production ? "http://127.0.0.1:8083" : "http://127.0.0.1:8080";
export default defineConfig({
  workers: 2,
  expect: { timeout: 10000 },
  testDir: "tests/e2e",
  fullyParallel: true,
  use: {
    baseURL: url,
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      channel: "chrome",
      args: [
        "--enable-webgl",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: {
    command: production ? "bun run preview --port 8083" : "bun run dev",
    url,
    reuseExistingServer: !production && !process.env.CI,
  },
});
