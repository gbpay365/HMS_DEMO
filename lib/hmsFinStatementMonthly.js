/**
 * Monthly financial statement — parity with financials-statement-monthly.php.
 */
const {
 finTablesOk,
 finAccountMovementsPeriod,
 labelPatientContext
} = require('./hmsFinGeneralLedger');

function round2(n) {
 return Math.round((Number(n) || 0) * 100) / 100;
}

function lastDayOfMonth(y, m) {
 const dt = new Date(y, m, 0, 12, 0, 0);
 const yy = dt.getFullYear();
 const mm = String(dt.getMonth() + 1).padStart(2, '0');
 const dd = String(dt.getDate()).padStart(2, '0');
 return `${yy}-${mm}-${dd}`;
}

const { formatDisplayDate } = require('./hmsFormatDate');

function isoDisplay(ymd) {
 return formatDisplayDate(ymd);
}

function rowsToMap(rows) {
 const map = {};
 for (const r of rows || []) {
  const code = String(r.account_code ?? '').trim();
  if (code) map[code] = r;
 }
 return map;
}

/**
 * @returns {Promise<{
 *  finOk: boolean,
 *  y: number, m: number,
 *  periodFrom: string, periodTo: string,
 *  periodDisplay: string,
 *  incomeAccts: Array<{ code: string, label: string, cur: number, prev: number, ytd: number }>,
 *  expenseAccts: Array<{ code: string, label: string, cur: number, prev: number, ytd: number }>,
 *  totIncCur: number, totIncPrev: number, totIncYtd: number,
 *  totExpCur: number, totExpPrev: number, totExpYtd: number,
 *  netCur: number, netPrev: number, netYtd: number,
 *  reportRef: string, monthPeriodLabel: string
 * }>}
 */
async function finMonthlyReviewStatement(pool, facilityId, year, month) {
 const now = new Date();
 let y = parseInt(year, 10);
 let m = parseInt(month, 10);
 if (!Number.isFinite(y) || y < 2000 || y > 2100) y = now.getFullYear();
 if (!Number.isFinite(m) || m < 1 || m > 12) m = now.getMonth() + 1;

 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const finOk = await finTablesOk(pool);

 const empty = {
  finOk,
  y,
  m,
  periodFrom: '',
  periodTo: '',
  periodDisplay: '',
  incomeAccts: [],
  expenseAccts: [],
  totIncCur: 0,
  totIncPrev: 0,
  totIncYtd: 0,
  totExpCur: 0,
  totExpPrev: 0,
  totExpYtd: 0,
  netCur: 0,
  netPrev: 0,
  netYtd: 0,
  reportRef: `MFS-${String(y)}${String(m).padStart(2, '0')}`,
  monthPeriodLabel: `${y}-${String(m).padStart(2, '0')}`
 };

 if (!finOk) return empty;

 let pm = m - 1;
 let py = y;
 if (pm < 1) {
  pm = 12;
  py -= 1;
 }

 const periodFrom = `${y}-${String(m).padStart(2, '0')}-01`;
 const periodTo = lastDayOfMonth(y, m);
 const prevFrom = `${py}-${String(pm).padStart(2, '0')}-01`;
 const prevTo = lastDayOfMonth(py, pm);
 const ytdFrom = `${y}-01-01`;

 const rowsCur = await finAccountMovementsPeriod(pool, fid, periodFrom, periodTo);
 const rowsPrev = await finAccountMovementsPeriod(pool, fid, prevFrom, prevTo);
 const rowsYtd = await finAccountMovementsPeriod(pool, fid, ytdFrom, periodTo);

 const curMap = rowsToMap(rowsCur);
 const prevMap = rowsToMap(rowsPrev);
 const ytdMap = rowsToMap(rowsYtd);

 const allCodes = [...new Set([...Object.keys(curMap), ...Object.keys(prevMap), ...Object.keys(ytdMap)])].sort();

 const incomeAccts = [];
 const expenseAccts = [];
 let totIncCur = 0;
 let totIncPrev = 0;
 let totIncYtd = 0;
 let totExpCur = 0;
 let totExpPrev = 0;
 let totExpYtd = 0;

 for (const code of allCodes) {
  if (!code) continue;
  const rc = curMap[code];
  const rp = prevMap[code];
  const ry = ytdMap[code];
  const cl = parseInt(rc?.class ?? rp?.class ?? ry?.class, 10) || 0;
  let lbl = String(rc?.account_label ?? rp?.account_label ?? ry?.account_label ?? '');
  lbl = labelPatientContext(lbl);

  const cDr = parseFloat(rc?.total_debit) || 0;
  const cCr = parseFloat(rc?.total_credit) || 0;
  const pDr = parseFloat(rp?.total_debit) || 0;
  const pCr = parseFloat(rp?.total_credit) || 0;
  const yDr = parseFloat(ry?.total_debit) || 0;
  const yCr = parseFloat(ry?.total_credit) || 0;

  if (cl === 7) {
   const cBal = round2(cCr - cDr);
   const pBal = round2(pCr - pDr);
   const yBal = round2(yCr - yDr);
   if (Math.abs(cBal) > 0.001 || Math.abs(pBal) > 0.001 || Math.abs(yBal) > 0.001) {
    incomeAccts.push({ code, label: lbl, cur: cBal, prev: pBal, ytd: yBal });
    totIncCur += cBal;
    totIncPrev += pBal;
    totIncYtd += yBal;
   }
  } else if (cl === 6) {
   const cBal = round2(cDr - cCr);
   const pBal = round2(pDr - pCr);
   const yBal = round2(yDr - yCr);
   if (Math.abs(cBal) > 0.001 || Math.abs(pBal) > 0.001 || Math.abs(yBal) > 0.001) {
    expenseAccts.push({ code, label: lbl, cur: cBal, prev: pBal, ytd: yBal });
    totExpCur += cBal;
    totExpPrev += pBal;
    totExpYtd += yBal;
   }
  }
 }

 totIncCur = round2(totIncCur);
 totIncPrev = round2(totIncPrev);
 totIncYtd = round2(totIncYtd);
 totExpCur = round2(totExpCur);
 totExpPrev = round2(totExpPrev);
 totExpYtd = round2(totExpYtd);

 return {
  finOk: true,
  y,
  m,
  periodFrom,
  periodTo,
  periodDisplay: `${isoDisplay(periodFrom)} — ${isoDisplay(periodTo)}`,
  incomeAccts,
  expenseAccts,
  totIncCur,
  totIncPrev,
  totIncYtd,
  totExpCur,
  totExpPrev,
  totExpYtd,
  netCur: round2(totIncCur - totExpCur),
  netPrev: round2(totIncPrev - totExpPrev),
  netYtd: round2(totIncYtd - totExpYtd),
  reportRef: `MFS-${String(y)}${String(m).padStart(2, '0')}`,
  monthPeriodLabel: `${y}-${String(m).padStart(2, '0')}`
 };
}

module.exports = { finMonthlyReviewStatement, isoDisplay };
