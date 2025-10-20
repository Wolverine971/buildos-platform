// apps/worker/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Exclude integration tests by default (require database credentials)
    // Run with: pnpm test:integration or pnpm test tests/integration
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/tests/integration/**", // Skip integration tests by default
    ],
  },
  resolve: {
    alias: {
      "@": "./src",
    },
  },
});
