# ZAIZENS License Server

Vendor-hosted **license server** and **serial generator** for hospital HMS installations.

## Setup

```bash
cd license-generator
npm install
npm run generate-keys
```

1. Copy **public** keys into each hospital `.env` (`LICENSE_RSA_PUBLIC_KEY_PEM`, `LICENSE_ED25519_PUBLIC_KEY_PEM`).
2. Copy **private** keys into `license-generator/.env` (never deploy private keys to client hospitals).
3. Set a strong admin token: `LICENSE_GENERATOR_ADMIN_TOKEN=your-secret`
4. Start the server:

```bash
npm start
```

- **Serial generator:** http://localhost:5055/
- **Admin dashboard:** http://localhost:5055/dashboard

Deploy on a public HTTPS host (e.g. `https://licenses.yourcompany.com`).

## Hospital configuration

On each client HMS installation, add to `.env`:

```env
LICENSE_SERVER_URL=https://licenses.yourcompany.com
LICENSE_SERVER_SYNC_INTERVAL_MS=900000
```

The hospital app will:

1. Register its installation ID with the license server
2. Send heartbeats every 15 minutes (configurable)
3. Pull remote revoke commands and auto-delivered serials
4. Submit subscription request codes when admins request a module

## Workflows

### Offline (manual)

1. Hospital Admin opens **Solution Subscriptions** → **Request subscription**
2. Hospital sends request code to vendor
3. Vendor uses **Serial generator** or dashboard → **Generate serial**
4. Hospital activates serial locally

### Online (recommended)

1. Hospital requests subscription (code is sent to license server automatically)
2. Vendor opens **Dashboard** → selects client → **Generate & queue delivery**
3. Hospital syncs (automatic every 15 min, or **Sync now** in subscriptions UI)
4. Serial is applied and module access starts

### Remote revocation (security)

From the **Dashboard**, select a client installation:

- **Revoke module** — disables one solution on the client at next sync
- **Revoke all licenses** — emergency disable of every module

Revocations are queued and applied when the client heartbeats. Use when you suspect tampering, cracking, or unauthorized use.

### Instant push (no heartbeat wait)

Set the **same** secret on license server and every hospital:

```env
# License server .env
LICENSE_SERVER_WEBHOOK_SECRET=your-long-random-secret

# Hospital HMS .env
LICENSE_SERVER_WEBHOOK_SECRET=your-long-random-secret
HMS_PUBLIC_URL=https://hospital.example.com
```

When you revoke or issue a serial from the dashboard, the license server POSTs to  
`https://hospital.example.com/api/hms/license-server/push` so the client syncs immediately.

Manual **Push now** is also available on each installation in the dashboard.

### Offline email alerts

On the license server:

```env
LICENSE_SERVER_ALERT_EMAIL=licensing@yourcompany.com
LICENSE_SERVER_OFFLINE_MINUTES=45
LICENSE_SMTP_HOST=smtp.example.com
LICENSE_SMTP_FROM="ZAIZENS License Server <licensing@yourcompany.com>"
```

You receive an email when a client misses heartbeats for 45 minutes (configurable), and another when it comes back online.

## API summary

### Client API (hospital → server)

Headers: `X-Installation-Id`, `X-Client-Key`

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/client/register` | First-time registration |
| POST | `/api/v1/client/heartbeat` | Status sync + pull commands |
| POST | `/api/v1/client/request` | Submit subscription request |
| POST | `/api/v1/client/commands/:id/ack` | Acknowledge applied command |

Hospital webhook (called by license server):

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/hms/license-server/push` | Instant sync (HMAC signed) |

### Admin API (vendor dashboard)

Header: `X-Admin-Token` (if `LICENSE_GENERATOR_ADMIN_TOKEN` is set)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/stats` | Dashboard counters |
| GET | `/api/admin/installations` | List clients |
| GET | `/api/admin/installations/:id` | Client detail |
| POST | `/api/admin/installations/:id/revoke-solution` | Queue module revoke |
| POST | `/api/admin/installations/:id/revoke-all` | Queue bulk revoke |
| POST | `/api/admin/installations/:id/push-now` | Instant sync webhook |
| POST | `/api/admin/installations/:id/generate-serial` | Issue serial (+ optional auto-delivery) |

### Legacy generator API

- `POST /api/decode-request`
- `POST /api/generate-serial`

## Database

SQLite database at `license-generator/data/license-server.db` (override with `LICENSE_SERVER_DB_PATH`).

## Security

- Request codes are RSA-OAEP encrypted; only the vendor private key can read them.
- Serial numbers are Ed25519-signed; hospitals verify with the embedded public key only.
- Each serial is bound to the hospital **installation ID**.
- Client API keys are generated per installation and stored on both server and hospital DB.
- Always use HTTPS in production.
