'use strict';

const { loadPostingAccounts } = require('./hmsFinPostingCatalog');
const { journalPostManualWithResult } = require('./hmsFinJournalPost');
const { resolveCostCenterIdByCode } = require('./finCostCenters');
const { generateJournalReference, todayIsoDate } = require('./journalEntryReference');
const hmsCountry = require('./hmsCountry');

function costCentreRequiredMessage() {
  return hmsCountry.isNigeria
    ? 'Each line with an amount must have a cost centre (analytical axis).'
    : 'Each line with an amount must have a cost centre (OHADA analytical axis).';
}

function parseMoneyXaf(raw) {
  const n = parseInt(String(raw || '').replace(/\D+/g, ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function ymBounds(d) {
  const s = String(d || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * Parse manual journal lines from form body or JSON payload.
 */
function parseManualJournalLines(body, accounts, { requireCostCentre = false } = {}) {
  const validIds = new Set(accounts.map((a) => parseInt(a.id, 10) || 0));
  const lines = [];
  let err = '';

  const isJson = Array.isArray(body.lines);
  if (isJson) {
    for (const raw of body.lines) {
      const aid = parseInt(String(raw.accountId ?? raw.account_id ?? raw.acc ?? 0), 10) || 0;
      const dr = parseMoneyXaf(raw.debit ?? raw.dr);
      const cr = parseMoneyXaf(raw.credit ?? raw.cr);
      const memo = String(raw.memo ?? raw.line_memo ?? '').trim().slice(0, 255);
      const ccCode = String(raw.costCentre ?? raw.cost_centre ?? raw.cc ?? '').trim().slice(0, 24);
      if (aid < 1) continue;
      if (dr > 0 && cr > 0) {
        err = 'Each line must be either debit or credit, not both.';
        break;
      }
      if (dr < 1 && cr < 1) continue;
      if (requireCostCentre && !ccCode) {
        err = costCentreRequiredMessage();
        break;
      }
      lines.push({ aid, dr, cr, memo, ccCode });
    }
  } else {
    for (let i = 0; i < 40; i++) {
      if (body[`acc_${i}`] === undefined && body[`dr_${i}`] === undefined && body[`cr_${i}`] === undefined) {
        if (i >= 2) break;
        continue;
      }
      const aid = parseInt(String(body[`acc_${i}`] ?? '0'), 10) || 0;
      const dr = parseMoneyXaf(body[`dr_${i}`]);
      const cr = parseMoneyXaf(body[`cr_${i}`]);
      const memo = String(body[`memo_${i}`] || '').trim().slice(0, 255);
      const ccCode = String(body[`cc_${i}`] || '').trim().slice(0, 24);
      if (aid < 1) continue;
      if (dr > 0 && cr > 0) {
        err = 'Each line must be either debit or credit, not both.';
        break;
      }
      if (dr < 1 && cr < 1) continue;
      if (requireCostCentre && !ccCode) {
        err = costCentreRequiredMessage();
        break;
      }
      lines.push({ aid, dr, cr, memo, ccCode });
    }
  }

  if (!err) {
    let td = 0;
    let tc = 0;
    for (const ln of lines) {
      td += ln.dr;
      tc += ln.cr;
    }
    if (lines.length === 0) err = 'Add at least one journal line.';
    else if (lines.length < 2) err = 'Double entry requires at least two lines (debit and credit sides).';
    else if (td !== tc || td < 1) err = 'Total debits must equal total credits and be greater than zero.';
    else {
      for (const ln of lines) {
        if (!validIds.has(ln.aid)) {
          err = 'Invalid account on a line.';
          break;
        }
      }
    }
  }

  return { ok: !err, error: err, lines };
}

async function buildGlLinesFromParsed(pool, accounts, parsedLines) {
  const glLines = [];
  const byId = new Map(accounts.map((a) => [parseInt(a.id, 10) || 0, a]));
  for (const ln of parsedLines) {
    const a = byId.get(ln.aid);
    if (!a) continue;
    const code = String(a.code || '').trim().slice(0, 32);
    const lab = String(a.label_en || a.code || '').trim().slice(0, 160);
    const costCenterId = ln.ccCode ? await resolveCostCenterIdByCode(pool, ln.ccCode) : null;
    if (ln.ccCode && !costCenterId) {
      return { ok: false, error: `Invalid cost centre: ${ln.ccCode}`, glLines: [] };
    }
    glLines.push({
      code,
      label: lab,
      debit: ln.dr,
      credit: ln.cr,
      line_memo: ln.memo,
      cost_center_id: costCenterId,
    });
  }
  return { ok: true, error: '', glLines };
}

/**
 * Post a manual journal entry (draft or posted).
 */
async function postManualJournalEntry(pool, session, body) {
  const fid = parseInt(String(session.facilityId || 1), 10) || 1;
  const uid = parseInt(String(session.userId || session.user?.id || 0), 10) || 0;
  let accounts = await loadPostingAccounts(pool);
  if (!accounts.length) {
    const { seedFinAccounts } = require('./finAccountSeedData');
    await seedFinAccounts(pool).catch(() => {});
    accounts = await loadPostingAccounts(pool);
  }

  const { loadActiveCostCenters } = require('./finCostCenters');
  const costCenters = await loadActiveCostCenters(pool);
  const requireCostCentre = costCenters.length > 0;

  const jdate = ymBounds(body.journal_date || body.journalDate) || todayIsoDate();
  const desc = String(body.description || '').trim();
  const ref = (String(body.reference || '').trim() || generateJournalReference(jdate)).slice(0, 64);

  if (!desc) {
    return { ok: false, error: 'Description is required.' };
  }

  const parsed = parseManualJournalLines(body, accounts, { requireCostCentre });
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const built = await buildGlLinesFromParsed(pool, accounts, parsed.lines);
  if (!built.ok) return { ok: false, error: built.error };

  const asDraft =
    body.save_as_draft === '1' ||
    body.save_as_draft === 1 ||
    body.saveAsDraft === true ||
    body.asDraft === true;

  const result = await journalPostManualWithResult(pool, fid, jdate, ref, desc, uid, built.glLines, {
    asDraft,
    journalCode: String(body.journal_code || body.journalCode || 'OD').trim().slice(0, 8) || 'OD',
    autoCreateSubAccounts: Boolean(body.auto_create_sub_accounts || body.autoCreateSubAccounts),
  });

  if (!result.ok && result.needsSubAccounts) {
    return {
      ok: false,
      needsSubAccounts: true,
      missing: result.missing || [],
      error: result.error || "Can't Post on Main Account , Please Create Sub Account and then Post the Transaction",
    };
  }

  if (!result.ok || !result.journalId) {
    const { journalPostLastError } = require('./hmsFinJournalPost');
    return { ok: false, error: journalPostLastError() || result.error || 'Could not post journal.' };
  }

  const message = result.duplicate
    ? 'Journal was already posted (duplicate source).'
    : asDraft
      ? 'Draft journal saved.'
      : `Journal posted.${result.createdAccounts?.length ? ` Created sub-accounts: ${result.createdAccounts.map((a) => a.code).join(', ')}.` : ''}`;

  return {
    ok: true,
    journalId: result.journalId,
    duplicate: result.duplicate,
    message,
    createdAccounts: result.createdAccounts || [],
  };
}

module.exports = {
  parseMoneyXaf,
  ymBounds,
  parseManualJournalLines,
  buildGlLinesFromParsed,
  postManualJournalEntry,
};
