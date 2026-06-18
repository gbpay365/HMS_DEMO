/**
 * patch-allowance-defaults.js
 * ────────────────────────────────────────────────────────────────────────────
 * One-shot script: directly UPDATE tbl_hms_allowance_settings so all medical
 * allowances have the correct percentages, calc types, and legal bases.
 *
 * Run ONCE from the project root:
 *   node scripts/patch-allowance-defaults.js
 *
 * Safe to re-run: all updates are idempotent.
 */

'use strict';

const path = require('path');
const { loadEnv } = require('../lib/loadEnv');
loadEnv();

const mysql = require('mysql2/promise');
const { defaultAllowancesForSector } = require('../lib/hmsAllowanceCameroon');

async function run() {
  const pool = await mysql.createPool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '3306'),
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 2,
  });

  const defaults = defaultAllowancesForSector('medical');
  const defaultMap = new Map(defaults.map((d) => [d.code, d]));

  try {
    const [facilities] = await pool.query(
      `SELECT DISTINCT facility_id FROM tbl_hms_allowance_settings WHERE sector = 'medical'`
    );

    if (facilities.length === 0) {
      console.log('[patch] No rows found — nothing to patch.');
      return;
    }

    for (const { facility_id } of facilities) {
      console.log(`\n[patch] facility_id = ${facility_id}`);

      for (const def of defaults) {
        const [[current]] = await pool.query(
          `SELECT * FROM tbl_hms_allowance_settings
           WHERE facility_id = ? AND sector = 'medical' AND code = ?`,
          [facility_id, def.code]
        );

        if (!current) {
          await pool.query(
            `INSERT INTO tbl_hms_allowance_settings
             (facility_id, sector, code, label, label_fr, calc_type, enabled,
              pct_value, fixed_amount, per_unit_amount, cap_pct, cap_amount,
              applies_to_roles, legal_basis, description, sort_order)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              facility_id, 'medical', def.code, def.label, def.label_fr,
              def.calc_type, def.enabled ?? 1,
              def.pct_value ?? null, def.fixed_amount ?? null,
              def.per_unit_amount ?? null, def.cap_pct ?? null, def.cap_amount ?? null,
              def.applies_to_roles ?? null, def.legal_basis || '', def.description || '',
              def.sort_order ?? 99,
            ]
          );
          console.log(`  [INSERT] ${def.code}`);
          continue;
        }

        const sets = [];
        const vals = [];

        // Fix pct_value for % of basic allowances that are wrong or zero
        if (def.calc_type === 'pct_basic' && def.pct_value != null) {
          const curPct = parseFloat(current.pct_value);
          if (!curPct || curPct !== def.pct_value) {
            sets.push('pct_value = ?');
            vals.push(def.pct_value);
          }
        }

        // Fix per_unit_amount for per-shift allowances
        if (def.calc_type === 'per_shift' && def.per_unit_amount != null) {
          const curUnit = parseFloat(current.per_unit_amount);
          if (!curUnit || curUnit !== def.per_unit_amount) {
            sets.push('per_unit_amount = ?');
            vals.push(def.per_unit_amount);
          }
        }

        // Clear erroneous pct_value on per-shift/fixed allowances
        if ((def.calc_type === 'per_shift' || def.calc_type === 'fixed') && current.pct_value != null) {
          sets.push('pct_value = NULL');
        }

        // Clear cap_pct for allowances that should have none
        if (def.cap_pct == null && current.cap_pct != null) {
          sets.push('cap_pct = NULL');
        }
        // Restore cap_pct for seniority
        if (def.cap_pct != null && parseFloat(current.cap_pct) !== def.cap_pct) {
          sets.push('cap_pct = ?');
          vals.push(def.cap_pct);
        }

        // Restore legal_basis if missing
        if (!String(current.legal_basis || '').trim() && def.legal_basis) {
          sets.push('legal_basis = ?');
          vals.push(def.legal_basis);
        }

        // Restore description if missing
        if (!String(current.description || '').trim() && def.description) {
          sets.push('description = ?');
          vals.push(def.description);
        }

        if (sets.length === 0) {
          console.log(`  [OK]    ${def.code}`);
          continue;
        }

        vals.push(facility_id, def.code);
        await pool.query(
          `UPDATE tbl_hms_allowance_settings SET ${sets.join(', ')}
           WHERE facility_id = ? AND sector = 'medical' AND code = ?`,
          vals
        );
        console.log(`  [FIXED] ${def.code}: ${sets.join(', ')}`);
      }
    }

    // Final verification
    console.log('\n[patch] ── Verification ────────────────────────────────────');
    const [rows] = await pool.query(
      `SELECT code, calc_type, pct_value, per_unit_amount, cap_pct, legal_basis
       FROM tbl_hms_allowance_settings
       WHERE sector = 'medical'
       ORDER BY sort_order`
    );
    for (const r of rows) {
      const def = defaultMap.get(r.code);
      let status = '✓';
      const issues = [];
      if (def) {
        if (def.calc_type === 'pct_basic' && parseFloat(r.pct_value) !== def.pct_value)
          issues.push(`pct should be ${def.pct_value} got ${r.pct_value}`);
        if (def.cap_pct == null && r.cap_pct != null)
          issues.push(`cap should be null got ${r.cap_pct}`);
        if (!r.legal_basis) issues.push('legal_basis missing');
        if (issues.length) status = '✗';
      }
      const rateStr = r.pct_value != null ? `${r.pct_value}%` : r.per_unit_amount != null ? `${r.per_unit_amount} XAF` : '—';
      console.log(
        `  ${status} ${r.code.padEnd(28)} ${rateStr.padEnd(12)} cap=${String(r.cap_pct).padEnd(6)} basis=${r.legal_basis ? 'present' : 'MISSING'}` +
        (issues.length ? `  ← ${issues.join('; ')}` : '')
      );
    }

    console.log('\n[patch] Done. Reload the Payroll Settings page.\n');
  } finally {
    await pool.end();
  }
}

run().catch((e) => {
  console.error('[patch] ERROR:', e.message || e);
  process.exit(1);
});
