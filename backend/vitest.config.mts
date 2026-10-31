import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // *.int.test.ts need a real database: npm run test:integration
    exclude: [...configDefaults.exclude, "src/**/*.int.test.ts"],
    // config/env.ts validates these at import time; the unit tests never connect.
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      JWT_ACCESS_SECRET: "test-access-secret-test-access-secret-0000",
      JWT_REFRESH_SECRET: "test-refresh-secret-test-refresh-secret-000",
      JWT_ADMIN_SECRET: "test-admin-secret-test-admin-secret-00000",
      ADMIN_PASSWORD: "test-admin-password",
    },
  },
});
