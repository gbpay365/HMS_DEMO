# Integration REST APIs

These JSON endpoints are **stable companions** to the server-rendered (EJS) clinical modules. The primary UI posts to `/maternity/*` and `/vaccination/*` page routes; the REST APIs exist for mobile clients, external integrations, and future SPA wiring.

All routes require an authenticated session (`requireAuth`) and module permissions (`maternity.read` / `maternity.write`, `vaccination.read` / `vaccination.write`, or clinical/nursing equivalents).

## Maternity — `/api/maternity/*`

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/maternity/patients` | Register maternity patient |
| GET | `/api/maternity/patients` | List maternity patients |
| GET | `/api/maternity/patients/:id` | Patient by maternity id |
| GET | `/api/maternity/patients/hms/:patientId` | Patient by HMS registry id |
| GET | `/api/maternity/patients/:id/summary` | Chart summary |
| POST | `/api/maternity/antenatal` | ANC visit |
| GET | `/api/maternity/antenatal/:maternityPatientId` | ANC history |
| POST | `/api/maternity/risk-assessment` | Risk assessment |
| GET | `/api/maternity/risk-assessment/:maternityPatientId` | Risk history |
| POST | `/api/maternity/scans` | Ultrasound scan |
| GET | `/api/maternity/scans/:maternityPatientId` | Scan history |
| POST | `/api/maternity/labor` | Admit to labor |
| GET | `/api/maternity/labor/active` | Active labor list |
| POST | `/api/maternity/partograph/:laborId` | Partograph entry |
| GET | `/api/maternity/partograph/:laborId` | Partograph data |
| POST | `/api/maternity/delivery` | Record delivery |
| POST | `/api/maternity/newborn` | Register newborn |
| POST | `/api/maternity/postnatal` | Postnatal visit |
| GET | `/api/maternity/postnatal/:maternityPatientId` | Postnatal history |
| POST | `/api/maternity/complications` | Record complication |
| GET | `/api/maternity/complications/:maternityPatientId` | Complication history |
| GET | `/api/maternity/reports/dashboard` | Dashboard stats |
| GET | `/api/maternity/reports/high-risk` | High-risk patients |

SSR pages: `/maternity`, `/maternity/chart/:id`, etc. — see `routes/maternity.js`.

## Vaccination — `/api/vaccination/*`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/vaccination/stats` | Dashboard statistics |
| GET | `/api/vaccination/patients` | Patient list / search |
| GET | `/api/vaccination/patient/:patient_id` | Patient vaccination summary |
| POST | `/api/vaccination/administer` | Administer dose |
| POST | `/api/vaccination/queue` | Add to vaccination queue |

SSR pages: `/vaccination`, `/vaccination/chart/:id`, etc. — see `routes/vaccination.js`.

## Notes for integrators

- Send `Accept: application/json` or use paths under `/api/` for JSON responses.
- Do not remove these routes without checking for external consumers (mobile apps, regional reporting).
- Permission model matches the SSR module; use service accounts with least privilege.
