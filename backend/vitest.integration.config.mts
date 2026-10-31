import { defineConfig } from "vitest/config";

// Integration tests run against a real, throw-away database:
//   DATABASE_URL=postgres://... npm run db:setup && npm run test:integration
// Everything else in the env is test-only, like in vitest.config.mts.
export default defineConfig({
  test: {
    include: ["src/**/*.int.test.ts"],
    fileParallelism: false,
    env: {
      JWT_ACCESS_SECRET: "test-access-secret-test-access-secret-0000",
      JWT_REFRESH_SECRET: "test-refresh-secret-test-refresh-secret-000",
      JWT_ADMIN_SECRET: "test-admin-secret-test-admin-secret-00000",
      ADMIN_PASSWORD: "test-admin-password",
      NODE_ENV: "test",
    },
  },
});
