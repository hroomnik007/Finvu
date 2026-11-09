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

CI (`.github/workflows/ci.yml`) runs them on every pull request and before every deploy, against a throw-away Postgres 17.
