#!/usr/bin/env node
/**
 * Phase D — migrate legacy Bootstrap form/button classes to HMS primitives.
 * Usage: node scripts/migrate-ejs-legacy-ui.mjs [file...]
 * With no args, migrates the default Phase D batch under views/.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const DEFAULT_FILES = [
  'views/lims-config.ejs',
  'views/lims-request-new.ejs',
  'views/maternity-chart.ejs',
  'views/maternity-register.ejs',
  'views/maternity-labor.ejs',
  'views/maternity-patients.ejs',
  'views/employee-add.ejs',
  'views/employee-edit.ejs',
  'views/partials/employee-doctor-specialisation.ejs',
  'views/partials/employee-hr-fields.ejs',
  'views/hr-leave-balances.ejs',
  'views/hr-holidays.ejs',
  'views/hr-request-leave.ejs',
  'views/hr-my-leave-balance.ejs',
  'views/hr-attendance.ejs',
  'views/access-control.ejs',
  'views/departments.ejs',
  'views/my-profile.ejs',
  'views/payroll-settings.ejs',
];

const BATCH2_FILES = [
  'views/credit-account.ejs',
  'views/ipd-hospitalization-detail.ejs',
  'views/hms-appointment-slots-config.ejs',
  'views/procurement-po-new.ejs',
  'views/procurement-rfq.ejs',
  'views/vaccination-administer.ejs',
  'views/partials/procurement-po-edit-form.ejs',
  'views/appointments-online-booking.ejs',
  'views/laboratory-templates.ejs',
  'views/radiology-templates.ejs',
];

const BATCH3_FILES = [
  'views/wallet.ejs',
  'views/doctor-roster.ejs',
  'views/nurse-roster.ejs',
  'views/billing-receipts.ejs',
  'views/facility-edit.ejs',
  'views/payment-validity.ejs',
];

function migrateContent(src) {
  let s = src;

  // Alerts → hms-flash
  s = s.replace(/\balert alert-success\b/g, 'hms-flash hms-flash--success');
  s = s.replace(/\balert alert-danger\b/g, 'hms-flash hms-flash--error');
  s = s.replace(/\balert alert-warning\b/g, 'hms-flash hms-flash--error');
  s = s.replace(/\balert alert-info\b/g, 'hms-flash hms-flash--success');

  // Inputs — order: combined classes first
  s = s.replace(/\bform-control form-control-sm\b/g, 'hms-input w-full text-sm');
  s = s.replace(/\bform-control hms-input\b/g, 'hms-input w-full');
  s = s.replace(/\bhms-input form-control\b/g, 'hms-input w-full');
  s = s.replace(/\bform-control\b/g, 'hms-input w-full');
  s = s.replace(/\bform-select\b/g, 'hms-input w-full');

  // Strip redundant Bootstrap btn when hms-btn already present
  s = s.replace(/\bbtn btn-(?:primary|secondary|success|warning|danger|outline-primary|outline-secondary|outline-success|outline-danger)(?:\s+btn-(?:sm|lg|block|xs))?\s+(?=hms-btn)/g, '');
  s = s.replace(/\bbtn btn-(?:primary|secondary|success|warning|danger)(?:\s+btn-(?:sm|lg|block))?\s+(?=hms-btn)/g, '');
  s = s.replace(/\bbtn-block\s+(?=hms-btn)/g, '');
  s = s.replace(/\bfont-weight-bold\s+(?=hms-btn)/g, '');

  // btn-outline-* → hms-btn variants (when no hms-btn yet)
  s = s.replace(/\bbtn btn-outline-primary\b/g, 'hms-btn hms-btn-outline-primary');
  s = s.replace(/\bbtn btn-outline-secondary\b/g, 'hms-btn hms-btn-secondary');
  s = s.replace(/\bbtn btn-outline-success\b/g, 'hms-btn hms-btn-outline-success');
  s = s.replace(/\bbtn btn-outline-danger\b/g, 'hms-btn hms-btn-outline-danger');
  s = s.replace(/\bbtn btn-outline-warning\b/g, 'hms-btn hms-btn-warning');

  // Solid buttons
  s = s.replace(/\bbtn btn-primary\b/g, 'hms-btn hms-btn-primary');
  s = s.replace(/\bbtn btn-secondary\b/g, 'hms-btn hms-btn-secondary');
  s = s.replace(/\bbtn btn-success\b/g, 'hms-btn hms-btn-success');
  s = s.replace(/\bbtn btn-warning\b/g, 'hms-btn hms-btn-warning');
  s = s.replace(/\bbtn btn-danger\b/g, 'hms-btn hms-btn-danger');
  s = s.replace(/\bbtn btn-sm btn-primary\b/g, 'hms-btn hms-btn-primary hms-btn-sm');
  s = s.replace(/\bbtn btn-primary btn-sm\b/g, 'hms-btn hms-btn-primary hms-btn-sm');

  // Size modifiers on hms-btn
  s = s.replace(/\bhms-btn\s+btn-sm\b/g, 'hms-btn hms-btn-sm');
  s = s.replace(/\bhms-btn\s+btn-lg\b/g, 'hms-btn hms-btn-lg');
  s = s.replace(/\bhms-btn\s+btn-block\b/g, 'hms-btn hms-btn-block');
  s = s.replace(/\bbtn-sm\s+(?=hms-btn)/g, 'hms-btn-sm ');

  // Remove inline gradient overrides on primary buttons
  s = s.replace(/\s+style="background:linear-gradient\([^"]*\);border:none;border-radius:\d+px;"/g, '');
  s = s.replace(/\s+style="background:linear-gradient\([^"]*\);border:none;border-radius:\d+px;padding:[^"]*"/g, '');
  s = s.replace(/\s+style="background:var\(--mat-primary\);border:none"/g, '');
  s = s.replace(/\s+style="border-radius:8px;"/g, '');

  return s;
}

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [...DEFAULT_FILES, ...BATCH2_FILES, ...BATCH3_FILES];

let changed = 0;
for (const rel of files) {
  const fp = path.join(root, rel);
  if (!fs.existsSync(fp)) {
    console.warn('skip (missing):', rel);
    continue;
  }
  const before = fs.readFileSync(fp, 'utf8');
  const after = migrateContent(before);
  if (after !== before) {
    fs.writeFileSync(fp, after, 'utf8');
    changed++;
    console.log('migrated:', rel);
  }
}
console.log(`Done — ${changed} file(s) updated.`);
