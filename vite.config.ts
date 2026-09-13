import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  server: { port: 8080, strictPort: true, host: "127.0.0.1" },
  worker: { format: "es" },
});
