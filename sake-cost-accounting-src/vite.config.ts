import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  base: "/staff-portal/sake-cost-accounting-mockup/",
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL("../sake-cost-accounting-mockup", import.meta.url)),
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: "./tests/setup.ts",
    exclude: ["tests/e2e/**", "node_modules/**"],
  },
});
