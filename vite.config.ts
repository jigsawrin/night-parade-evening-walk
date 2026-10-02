import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  // 最初に読む JS の上限の見張りは scripts/bundle-size.mjs（npm run check:size）
  build: { target: "es2022", chunkSizeWarningLimit: 1400 },
  server: { port: 5173 },
});
