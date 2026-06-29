'use strict';

const hmsCountry = require('./hmsCountry');
const cameroon = require('./hmsPayrollCameroon');
const nigeria = require('./hmsPayrollNigeria');

function defaultBracketsJson() {
  return hmsCountry.isNigeria ? nigeria.defaultBracketsJson() : cameroon.defaultBracketsJson();
}

/**
 * Country-aware statutory payroll calculation.
 * @param {object} [opts] — Nigeria: { basicSalary, housingAllowance, transportAllowance, annualRentPaid }
 */
async function hmsPayrollCalculate(pool, facilityId, taxYear, grossSalary, opts = {}) {
  if (hmsCountry.isNigeria) {
    return nigeria.hmsPayrollNigeriaCalculate(pool, facilityId, taxYear, grossSalary, opts);
  }
  return cameroon.hmsPayrollCameroonCalculate(pool, facilityId, taxYear, grossSalary);
}

module.exports = {
  defaultBracketsJson,
  hmsPayrollCalculate,
  hmsPayrollCameroonCalculate: cameroon.hmsPayrollCameroonCalculate,
  hmsPayrollNigeriaCalculate: nigeria.hmsPayrollNigeriaCalculate,
};
