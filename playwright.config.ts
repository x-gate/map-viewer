import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:8080",
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
    command: "bun run dev",
    url: "http://127.0.0.1:8080",
    reuseExistingServer: !process.env.CI,
  },
});
