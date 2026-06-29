'use strict';

/**
 * Nigeria payroll — PAYE (NTA 2026) + Pension Reform Act + NHF + optional NHIS.
 *
 * Statutory sources
 * ─────────────────
 * • Pension (employee): 8 % of monthly emoluments (basic + housing + transport)
 *   – Pension Reform Act 2014 (as amended)
 * • Pension (employer): 10 % of emoluments (reported on payslip, not deducted from net)
 * • NHF: 2.5 % of basic salary (employee)
 * • NHIS: configurable % of gross (employee) — default 0 until employer enables
 * • PAYE: Nigeria Tax Act 2025 — effective 1 Jan 2026
 *   Progressive annual bands (first ₦800,000 exempt):
 *     0 – 800,000          → 0 %
 *     800,001 – 3,000,000  → 15 %
 *     3,000,001 – 12,000,000 → 18 %
 *     12,000,001 – 25,000,000 → 21 %
 *     25,000,001 – 50,000,000 → 23 %
 *     Above 50,000,000     → 25 %
 * • Rent relief: 20 % of annual rent paid, capped ₦500,000 (tax relief, not a cash deduction)
 *   – Stored in settings.cnhc_rate as annual rent (NGN); 0 if employee does not rent
 *
 * Column reuse (tbl_hms_payroll_record):
 *   cnps_employee             → pension employee
 *   cimr_employee             → NHF
 *   crtv_deduction            → NHIS employee
 *   council_tax_deduction     → unused (0)
 *   development_tax_deduction → unused (0)
 *   cnhc_deduction            → unused (0) — rent relief applied inside PAYE only
 *   income_tax                → PAYE
 */

const { parseBrackets, irppFromTaxable } = require('./hmsPayrollCameroon');

/** Annual PAYE bands under Nigeria Tax Act 2025 (effective 2026). */
function defaultBracketsJson() {
  return JSON.stringify([
    { min: 0, max: 800000, rate: 0 },
    { min: 800001, max: 3000000, rate: 15 },
    { min: 3000001, max: 12000000, rate: 18 },
    { min: 12000001, max: 25000000, rate: 21 },
    { min: 25000001, max: 50000000, rate: 23 },
    { min: 50000001, max: null, rate: 25 },
  ]);
}

const PENSION_EMPLOYEE_DEFAULT = 8.0;
const PENSION_EMPLOYER_DEFAULT = 10.0;
const NHF_DEFAULT = 2.5;
const RENT_RELIEF_CAP_ANNUAL = 500000;
const RENT_RELIEF_RATE = 0.2;

async function payrollSettingsForYear(pool, facilityId, taxYear) {
  const [[row]] = await pool
    .query(
      'SELECT * FROM tbl_hms_payroll_settings WHERE facility_id = ? AND tax_year <= ? ORDER BY tax_year DESC LIMIT 1',
      [facilityId, taxYear]
    )
    .catch(() => [[null]]);
  if (row) return row;
  const [[row2]] = await pool
    .query(
      'SELECT * FROM tbl_hms_payroll_settings WHERE facility_id = ? ORDER BY tax_year DESC LIMIT 1',
      [facilityId]
    )
    .catch(() => [[null]]);
  return row2 || null;
}

function rentReliefAnnual(settings, opts) {
  const fromOpts = parseFloat(opts.annualRentPaid);
  if (Number.isFinite(fromOpts) && fromOpts > 0) {
    return Math.min(RENT_RELIEF_CAP_ANNUAL, Math.round(fromOpts * RENT_RELIEF_RATE));
  }
  const fromSettings = parseFloat(settings?.cnhc_rate);
  if (Number.isFinite(fromSettings) && fromSettings > 0) {
    return Math.min(RENT_RELIEF_CAP_ANNUAL, Math.round(fromSettings * RENT_RELIEF_RATE));
  }
  return 0;
}

/**
 * @param {object} opts — { basicSalary, housingAllowance, transportAllowance, annualRentPaid }
 */
async function hmsPayrollNigeriaCalculate(pool, facilityId, taxYear, grossSalary, opts = {}) {
  const set = await payrollSettingsForYear(pool, facilityId, taxYear);
  if (!set) return null;

  const gross = Math.max(0, parseFloat(grossSalary) || 0);
  const basic = Math.max(0, parseFloat(opts.basicSalary ?? gross) || 0);
  const housing = Math.max(0, parseFloat(opts.housingAllowance) || 0);
  const transport = Math.max(0, parseFloat(opts.transportAllowance) || 0);
  const emoluments = basic + housing + transport;

  const pensionPct = parseFloat(set.cnps_employee_rate) || PENSION_EMPLOYEE_DEFAULT;
  const nhfPct = parseFloat(set.cimr_employee_rate) || NHF_DEFAULT;
  const nhisPct = parseFloat(set.crtv_rate) || 0;

  const pensionEmployee = Math.round(emoluments * (pensionPct / 100));
  const employerPensionPct = parseFloat(set.development_tax_rate) || PENSION_EMPLOYER_DEFAULT;
  const pensionEmployer = Math.round(emoluments * (employerPensionPct / 100));
  const nhf = Math.round(basic * (nhfPct / 100));
  const nhis = nhisPct > 0 ? Math.round(gross * (nhisPct / 100)) : 0;

  const annualGross = gross * 12;
  const annualPension = pensionEmployee * 12;
  const annualNhf = nhf * 12;
  const annualNhis = nhis * 12;
  const annualRentRelief = rentReliefAnnual(set, opts);

  const chargeableAnnual = Math.max(
    0,
    annualGross - annualPension - annualNhf - annualNhis - annualRentRelief
  );
  const taxableMonthly = Math.round((chargeableAnnual / 12) * 100) / 100;

  const brackets = parseBrackets(String(set.tax_brackets || defaultBracketsJson()));
  const annualPaye = Math.round(irppFromTaxable(chargeableAnnual, brackets));
  const payeMonthly = Math.round(annualPaye / 12);

  const preTax = pensionEmployee + nhf + nhis;
  const totalDed = preTax + payeMonthly;
  const net = Math.round(gross - totalDed);

  return {
    gross,
    emoluments,
    pension_employee: pensionEmployee,
    pension_employer: pensionEmployer,
    cnps_employee: pensionEmployee,
    cimr_employee: nhf,
    crtv_deduction: nhis,
    council_tax_deduction: 0,
    development_tax_deduction: 0,
    cnhc_deduction: 0,
    taxable_income: taxableMonthly,
    income_tax: payeMonthly,
    net_salary: net,
    annual_rent_relief: annualRentRelief,
    chargeable_income_annual: chargeableAnnual,
  };
}

module.exports = {
  defaultBracketsJson,
  hmsPayrollNigeriaCalculate,
  PENSION_EMPLOYEE_DEFAULT,
  PENSION_EMPLOYER_DEFAULT,
  NHF_DEFAULT,
  RENT_RELIEF_CAP_ANNUAL,
};
