# Finvu backend

Setup and environment variables: see the [root README](../README.md).

## Tests

```bash
npm run typecheck
npm test                  # unit tests, no database needed
```

Access control tests run against a real Postgres. Use a throw-away database: the tests insert their own users and delete them afterwards.

```bash
export DATABASE_URL=postgresql://user:password@localhost:5432/finvu_test
npm run db:setup          # empty database: legacy schema + all migrations
npm run test:integration  # src/**/*.int.test.ts
```

They are not in CI yet. To add them, put a step running `npm run test:integration` after the `db:setup` step in `.github/workflows/deploy.yml`, with the same `DATABASE_URL`.
