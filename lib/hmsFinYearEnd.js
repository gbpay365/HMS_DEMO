/**
 * Year-end reporting — parity with financials-year-end.php.
 */
const {
 finTablesOk,
 finPlForYear,
 finAccountBalancesToDate,
 labelPatientContext
} = require('./hmsFinGeneralLedger');

const { formatDisplayDate, formatPeriodRange } = require('./hmsFormatDate');

function isoDisplay(ymd) {
 return formatDisplayDate(ymd);
}

/**
 * @returns {Promise<{
 *  finOk: boolean,
 *  y: number,
 *  pl: { charges: number, produits: number, resultat: number, period_from: string, period_to: string },
 *  balanceRows: Array<{ account_code: string, account_label: string, balance: number }>,
 *  periodDisplay: string,
 *  reportRef: string,
 *  asOfLabel: string
 * }>}
 */
async function finYearEndReport(pool, facilityId, year) {
 const now = new Date().getFullYear();
 let y = parseInt(year, 10);
 if (!Number.isFinite(y) || y < 2000 || y > 2100) y = now;

 const finOk = await finTablesOk(pool);
 const empty = {
  finOk,
  y,
  pl: { charges: 0, produits: 0, resultat: 0, period_from: '', period_to: '' },
  balanceRows: [],
  periodDisplay: '',
  reportRef: `YE-${y}`,
  asOfLabel: `31/12/${y}`
 };

 if (!finOk) return empty;

 const pl = await finPlForYear(pool, facilityId, y);
 const asOf = `${y}-12-31`;
 const bs = await finAccountBalancesToDate(pool, facilityId, asOf);

 const balanceRows = [];
 let n = 0;
 for (const r of bs) {
  if (n++ > 40) break;
  balanceRows.push({
   account_code: r.account_code,
   account_label: labelPatientContext(r.account_label),
   balance: r.balance
  });
 }

 const pf = pl.period_from || `${y}-01-01`;
 const pt = pl.period_to || `${y}-12-31`;

 return {
  finOk: true,
  y,
  pl,
  balanceRows,
  periodDisplay: `${formatDisplayDate(pf)} → ${formatDisplayDate(pt)}`,
  reportRef: `YE-${y}`,
  asOfLabel: `31/12/${y}`
 };
}

module.exports = { finYearEndReport, isoDisplay };
