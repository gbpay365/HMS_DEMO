'use strict';
const fs = require('fs');
const path = require('path');

const map = {
  'Loading Dashboard…': 'dashboard',
  'Loading Patient Directory…': 'patients',
  'Loading patient chart…': 'patient_chart',
  'Loading Doctors Directory…': 'doctors',
  'Loading Staff Directory…': 'staff',
  'Loading Appointments…': 'appointments',
  'Loading Front Desk…': 'front_desk',
  'Loading OPD Queue…': 'opd_queue',
  'Loading Billing…': 'billing',
  'Loading Cashier…': 'cashier',
  'Loading Inventory…': 'inventory',
  'Loading Laboratory Registry…': 'laboratory',
  'Loading Pharmacy…': 'pharmacy',
  'Loading Prescriptions…': 'prescriptions',
  'Loading Emergency Department…': 'emergency',
  'Loading ER KPI Dashboard…': 'emergency_kpi',
  'Loading ER chart…': 'emergency_visit',
  'Loading consultation picker…': 'consultation_start',
  'Loading consultation session…': 'consultation_new',
  'Loading Radiology…': 'radiology',
  'Loading Radiology workflow…': 'radiology_workflow',
  'Loading portal…': 'portal',
  'Loading doctor portal…': 'portal_doctor',
  'Loading Solution Subscriptions…': 'subscriptions',
  'Loading order…': 'order',
  'Loading alerts…': 'alerts',
  'Loading admin access…': 'admin_access',
  'Loading accounting…': 'financials',
};

function replacement(key) {
  return `typeof t === 'function' ? t('loading_pages.${key}', { ns: 'common' }) : 'Loading…'`;
}

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith('.ejs')) {
      let s = fs.readFileSync(p, 'utf8');
      let changed = false;
      for (const [label, key] of Object.entries(map)) {
        const patterns = [
          `reactLoadingLabel: '${label}'`,
          `reactLoadingLabel: "${label}"`,
          `reactLoadingLabel || '${label}'`,
        ];
        for (const pat of patterns) {
          if (s.includes(pat)) {
            const rep = pat.includes('||')
              ? `reactLoadingLabel || (${replacement(key)})`
              : `reactLoadingLabel: (${replacement(key)})`;
            s = s.split(pat).join(rep);
            changed = true;
          }
        }
      }
      if (changed) {
        fs.writeFileSync(p, s);
        console.log('updated', p);
      }
    }
  }
}

walk(path.join(__dirname, '..', 'views'));
