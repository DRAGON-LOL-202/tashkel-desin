import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["tests/globalSetup.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    env: { NODE_ENV: "test", DB_POOL_MAX: "1" },
  },
});
