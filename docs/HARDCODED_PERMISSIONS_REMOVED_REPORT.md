# Hardcoded permissions removal — report

**Date:** 2026-05-14  
**Scope:** All **runtime** hardcoded role→permission maps and permission-based routing for non–core roles were removed. **Admin (role `1`)** and **Super Admin (role `99`)** still use explicit role checks where required (wildcard `*` for ACL, dedicated routes).

---

## 1. Removed: `_defaultPermsForRole()` (`app.js`)

The entire function that mapped numeric roles `2`, `3`, `4`, … to fixed permission arrays was **deleted**.

**Previous behavior:** Used when `tbl_acl_role_permission` query failed, when login had no portal mapping, and when `/dashboard` redirected non-admins.

**Now:** Non–core roles get **`[]`** if the ACL query fails. No implicit grants.

**Removed default arrays (for audit):**

| Role | Removed permission codes (summary) |
|------|-----------------------------------|
| 2 | patient, clinical, scheduling, lab, radiology, prescription, adt, emergency, ipd_medication (read/write mix) |
| 3 | patient, scheduling, billing, opd, adt, ipd_medication |
| 4 | lab, patient |
| 5 | prescription, pharmacy |
| 6 | radiology, patient |
| 7–8 | nursing, patient, adt, clinical, ipd_medication |
| 9 | billing, accounting |
| 10 | inventory |
| 11 | cashier |
| 100–101 | patient, billing, employee, accounting, scheduling, opd, payroll, analytics (varies) |

---

## 2. Removed: post-login permission guessing (`app.js` `POST /login`)

After `aclLayout.staffHomeUrl(role)`, the app **no longer**:

- Loads permissions only to infer a portal URL  
- Applies redirects such as: cashier → `/portal/cashier`, accountant, nurse, doctor, lab, radiology, pharmacy, or `/portal/front-desk`

**Now:** If there is no DB-configured home portal, redirect to **`/profile`** with an error message instructing admins to set **Role Portals** in Access Control.

---

## 3. Removed: `/dashboard` non-admin permission fallbacks (`app.js`)

Non–admin users hitting `/dashboard` **no longer**:

- Fall back to `_defaultPermsForRole`  
- Redirect by permission codes to cashier, accountant, nurse, doctor, lab, radiology, pharmacy, or front-desk

**Now:** Only `aclLayout.staffHomeUrl`; if missing → same **`/profile`** message as login.

---

## 4. ACL middleware catch (`app.js`)

On DB error when loading `tbl_acl_role_permission`, **`res.locals.userPerms`** is set to **`[]`** instead of default map values.

---

## 5. `requirePatientArchivePermission` (`app.js`)

Removed redundant numeric checks for roles `1` / `99` (they already have `*` in `userPerms`). **Gate:** `*` or `patient.write` only.

---

## 6. `requirePerm` denial redirect (`app.js`)

Home URL fallback changed from **`/dashboard`** to **`/profile`** when no portal is configured (avoids redirect loops for misconfigured roles).

---

## 7. Access Control API — `reset_role_perms` (`routes/staff.js`)

Removed the action that re-seeded a **built-in `defaultRolePerms` map** (duplicate of the old `_defaultPermsForRole` data).

**Replacements:**

- **`copy_role_perms_from`** — Replace target role’s grants with a copy of another role’s `tbl_acl_role_permission` rows (targets `1`/`99` blocked; source must exist in `tbl_role`).  
- **`bulk_module_perms`** — Grant or revoke all permissions in a module (`module_code` or `code` prefix match).

---

## 8. UI / views — role-number shortcuts removed

| Location | Removed | Replaced with |
|----------|---------|----------------|
| `views/partials/header.ejs` | `role === '2'` for IPD inbox & doctor roster | `hasP('clinical.write', …)` / `hasP('clinical.write','prescription.write')` |
| `views/partials/header.ejs` | Default home `/portal/front-desk` | `/profile?err=…` when no portal |
| `views/opd-queue.ejs` | `role === '3'` (“front desk only”) | `!hasP('clinical.write','prescription.write')` via local helper |
| `routes/ipdMed.js` | `role === '2'`, `'7'`, `'8'` in `isDoctor` / `isNurse` / admission redirect | Roles **`1`** and **`99`** only as hardcoded bypass; otherwise **permission lists** (`clinical.write`, `prescription.write`, `nursing.write`) |

**Unchanged (by design):** `employees.ejs` and similar **admin-only UI** checks for roles `1` / `99`; Super Admin link for role `99` in header.

---

## 9. Bootstrap seed (`lib/ensureAclSchema.js`)

The **`defaultRolePerms`** object used for **`INSERT IGNORE`** on first boot **remains** as a **database seed only** (not used at request time). Comments updated to state this explicitly.

---

## 10. Access Control UI revamp (`views/access-control.ejs`)

- **Role Permissions** tab is the **default** landing tab.  
- **Copy from role** strip: replace all grants for the selected role from another role.  
- Per-module **All** / **None** on permission groups (calls `bulk_module_perms`).  
- Removed **Reset defaults** button and `aclResetDefaults` client handler.

---

## Operational note

Ensure every staff role has:

1. Rows in **`tbl_acl_role_permission`** (and/or appropriate workflow), and  
2. A **home portal** in **`tbl_acl_role_portal`**  

before relying on login and sidebar “home” links. The **ensureAclSchema** boot seed still helps **new** databases; existing DBs should be verified in **Access Control**.
