# Railway + PostgreSQL deployment (HMS_DEMO)

This demo build supports **PostgreSQL** via `HMS_DB_DRIVER=postgres`.

## Railway variables (web service)

Set on the **HMS app service** (reference Postgres plugin or paste values):

```
HMS_DB_DRIVER=postgres
DATABASE_URL=${{Postgres.DATABASE_URL}}
# Or use the public proxy from your PC for migrations:
# DATABASE_PUBLIC_URL=postgresql://postgres:PASSWORD@HOST:PORT/railway

SESSION_SECRET=<long-random-string>
NODE_ENV=production
HMS_SKIP_SCHEMA_MIGRATIONS=1
```

Railway injects `DATABASE_URL` automatically when you link the Postgres service.

**Do not** set `DB_HOST=localhost` on Railway — that breaks the connection.

## Load data (one-time, from your PC)

1. Copy `scripts/railway-postgres.env.example` → `scripts/railway-postgres.env`
2. Set `DATABASE_PUBLIC_URL` to the Railway **public** Postgres URL
3. Run from local XAMPP MySQL:
   ```bash
   node scripts/migrate-mysql-to-postgres.js
   ```

## Verify

After deploy, open `/__health` — expect `"DB_DRIVER": "postgres"` and `"db": { "reachable": true }`.

## Notes

- MySQL-only schema boot migrations are skipped on Postgres (`HMS_SKIP_SCHEMA_MIGRATIONS=1`).
- SQL is translated at runtime (`lib/pgSqlAdapter.js`). Some advanced MySQL features may still fail — report errors from Railway logs.
- For production at scale, Railway **MySQL** + the main `HMS_JS` tree is still the supported path.
