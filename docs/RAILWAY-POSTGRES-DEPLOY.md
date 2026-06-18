# Railway + PostgreSQL deployment (HMS_DEMO)

This demo build supports **PostgreSQL** via `HMS_DB_DRIVER=postgres`.

## Railway variables (web service)

**Link** the Postgres plugin to your web service, then set:

```
HMS_DB_DRIVER=postgres
DATABASE_URL=${{Postgres.DATABASE_URL}}
HMS_SKIP_SCHEMA_MIGRATIONS=1
SESSION_SECRET=<long-random-string>
NODE_ENV=production
```

### Remove these (MySQL leftovers — they break Postgres)

Delete from the **web service** if present:

- `DB_HOST` (especially `localhost`)
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

Railway injects `PGHOST`, `PGPASSWORD`, etc. on the **database** service; the web service only gets them when you reference `DATABASE_URL` or `${{Postgres.*}}` variables.

### Verify variables

After deploy, `/__health` should show:

- `"DB_SOURCE": "DATABASE_URL"` or `"PGHOST"`
- `"DB_HOST": "postgres.railway.internal"` (or your proxy host — **not** `localhost`)
- `"DATABASE_URL_SET": "(set)"` or `"PGHOST_SET": "(set)"`

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
