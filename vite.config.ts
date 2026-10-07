import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { offlinePlugin } from "./build/offline-plugin.mjs";
export default defineConfig({
  plugins: [react(), offlinePlugin()],
  base: "./",
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
  build: { outDir: "dist" },
});
