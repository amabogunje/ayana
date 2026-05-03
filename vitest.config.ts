import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup/env.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    fileParallelism: false,
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [
        "src/lib/operator-permissions.ts",
        "src/lib/operator-validation.ts",
        "src/lib/operator-service.ts",
        "src/lib/website-chat-service.ts",
      ],
      thresholds: {
        lines: 25,
        functions: 20,
        branches: 19,
        statements: 25,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
