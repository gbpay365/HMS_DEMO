# HMS business rules

## Two-layer model

| Layer | Controls | Examples |
|-------|----------|----------|
| **ACL** | Who may open a module or click a nav item | `lab.write`, `patient.write`, UI visibility in Access Control |
| **Business rules** | Whether an action is valid for this patient/visit/ticket | Payment validity, duplicate patient, consultation-before-Rx |

**ACL controls access; business rules control validity.** Both must pass. A user with `lab.write` still cannot add a test when payment and doctor-order rules fail.

UI gates in `public/js/hms-clinical-gates.js` are hints only — every POST/API route re-checks on the server.

---

## Patient identity & deduplication

- **Registration:** `lib/patientDuplicate.js` — match on first + last + phone + DOB/age.
- **Storage:** `lib/ensurePatientIdentitySchema.js` — unique `patient_identity_key` hash.
- **Admin review:** `/admin/patient-duplicates` and `npm run dedupe:patients` (CSV; `--apply` to delete after sign-off).

---

## Payment validity

- **Module:** `lib/paymentValidity.js`
- Consultation tickets: default `max_uses=2` (first visit + one follow-up registration).
- `countVisitUsesForCode`: every OPD visit on a code counts; follow-up visits are extra registrations.
- Front desk warning when follow-up uses the last allowance slot (`/clinical/follow-up-opd`).

---

## Laboratory / radiology authorization

- **Gate:** `assertDiagnosticNewTestAllowed` in `lib/clinicalBusinessRules.js`
- **Unified auth:** `lib/authorizeLabTest.js` (validate screen + new test request)
- **Order + ticket:** `lib/assertOrderLineAndTicketValid.js` — expired ticket + surviving order line **blocks** new tests; logs warning for cashier follow-up.

### IPD / ER tiers

| Tier | Condition | New test |
|------|-----------|----------|
| **alert-only** | Charge alert, `opd_order_item_id` NULL | Blocked — use formal order |
| **order-present** | Linked order item or doctor order on consult | Allowed |

---

## Consultation & prescription paths

| Path | Consultation | Payment | Prescription registry |
|------|--------------|---------|------------------------|
| **OPD** | Required (non-ER) | Valid code unless emergency | After active consult or follow-up |
| **Follow-up** | New visit under prior code | Anchor visit must not be ER; code still valid | Same as OPD when eligible |
| **ER** | **Required before Rx** | Retrospective billing | `er_no_consultation` until SOAP row exists |
| **IPD** | Ward context | IPD settlement rules | Allowed when admitted |

ER UI banner: *Prescription requires a consultation record — create one first.*

---

## Internal APIs (HMS_Python parity)

Set `INTERNAL_API_KEY` on HMS_JS. HMS_Python should call these instead of re-implementing rules:

| Endpoint | Purpose |
|----------|---------|
| `POST /internal/validate-consultation` | OPD consult payment gate |
| `POST /internal/check-duplicate-patient` | Registration duplicate check |
| `POST /internal/diagnostic-new-test-gate` | Lab/rad new test |
| `POST /internal/opd-prescription-gate` | Standalone Rx |
| `POST /internal/follow-up-eligible` | Follow-up eligibility |
| `POST /internal/authorize-lab-test` | Unified lab auth |
| `POST /internal/payment-ticket-validity` | Ticket window + uses |

Header: `X-HMS-Internal-Key: <INTERNAL_API_KEY>`

**CI:** `npm run test:rules` — server-side regression tests (bypass UI gates).

**HMS_Python migration:** Until all clinical features proxy to these endpoints, show a banner listing features still using local Python rules.

---

## Variable semantics (consultation form)

| Variable | Meaning |
|----------|---------|
| `consultPaymentBlocked` | Payment ticket invalid/expired — blocks consultation **save** |
| `admitOrderBlocked` | Patient already admitted — blocks new IPD admit **order** (not payment) |

Historical note: `consultPaymentBlocked` was never about IPD admission state; do not reuse for payment UI on ward screens.

---

## Tests

```bash
npm run test:rules
npm run dedupe:patients          # CSV only
node scripts/dedupe-patients-by-name.js --apply   # after admin review
```
