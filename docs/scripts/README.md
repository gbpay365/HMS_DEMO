# ZAIZENS — Complementary Implementation Scripts

Run these scripts **in order** on the ZAIZENS HMS Windows server during deployment.
All scripts use the **hardened 15-character database password**: `Ts$fSOA2026!Hms`

| Order | Script | Purpose |
|------:|--------|---------|
| 01 | `01-create-mysql-database.sql` | Create database + user with hardened password (new installs) |
| 01b | `01b-rotate-to-hardened-password.sql` | Rotate legacy `Hellt0cell` → hardened password (existing installs) |
| 02 | `02-zaizens-demo.env` | Production `.env` with hardened DB credentials |
| 03 | `03-mysql-backup.cnf` | MySQL backup credentials (hardened password) |
| 04 | `04-setup-data-folders.ps1` | Create `D:\HMS-Data` structure and uploads junction |
| 05 | `05-install-env.ps1` | Deploy `.env` with restricted ACL |
| 06 | `06-apply-ntfs-hardening.ps1` | Read-only application folder; writable uploads/tmp |
| 07 | `07-install-hms-service.ps1` | Register ZAIZENS-HMS Windows service (NSSM) |
| 08 | `08-zaizens-hms-backup.ps1` | Nightly backup (MySQL + uploads + config) |
| 09 | `09-register-backup-task.ps1` | Schedule backup @ 02:00 daily |
| 10 | `10-integrity-baseline.ps1` | SHA-256 hash baseline after golden deploy |
| 11 | `11-restore-database.ps1` | Interactive database restore from dump file |
| 12 | `12-run-diagnostic.ps1` | Run HMS environment diagnostic |

**Database:** `root` / `Ts$fSOA2026!Hms` / `hms_demo`

**Existing server on legacy password:** run `01b-rotate-to-hardened-password.sql`, then scripts 05 + copy `03-mysql-backup.cnf`, restart HMS.

**Note:** Root `.env` / `.env.production` in the dev repo may still show legacy values until you run script 05 on the server.
