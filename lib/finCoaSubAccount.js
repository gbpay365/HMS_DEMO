'use strict';

/**
 * OHADA sub-account resolution — never post to mother/header accounts.
 * Operational leaves (e.g. 552601 cash) may post directly; category templates
 * (e.g. 421200 salary advance) require a postable child (421201, 421202…).
 */

const { PAYMENT_METHOD_ACCOUNTS } = require('./paymentMethodGlAccounts');

const DIRECT_POSTABLE_CODES = new Set(PAYMENT_METHOD_ACCOUNTS.map((r) => r.code));

function getParentCode(code, allCodes) {
  const c = String(code || '').trim();
  if (!c) return null;
  let best = null;
  for (const p of allCodes) {
    if (p === c) continue;
    if (c.startsWith(p) && c.length > p.length) {
      if (!best || p.length > best.length) best = p;
    }
  }
  return best;
}

function isNumericCode(code) {
  return /^\d+$/.test(String(code || '').trim());
}

function templateRequiresSubAccount(code) {
  return !DIRECT_POSTABLE_CODES.has(String(code || '').trim());
}

async function loadActiveAccounts(pool, facilityId) {
  const fid = Math.max(1, parseInt(facilityId, 10) || 1);
  const [rows] = await pool
    .query(
      `SELECT id, code, account_number, label_en, name, ohada_class, account_type, is_posting, active, parent_id
         FROM tbl_fin_account
        WHERE active = 1 AND (facility_id = ? OR facility_id IS NULL OR facility_id = 0)
        ORDER BY code ASC`,
      [fid]
    )
    .catch(() => [[]]);
  return rows || [];
}

function accountByCode(accounts) {
  const map = new Map();
  for (const row of accounts) {
    const code = String(row.code || row.account_number || '').trim();
    if (code && !map.has(code)) map.set(code, row);
  }
  return map;
}

function childrenOf(parentCode, accounts) {
  const parent = String(parentCode || '').trim();
  const codes = accounts.map((a) => String(a.code || '').trim());
  return accounts.filter((a) => {
    const code = String(a.code || '').trim();
    if (!code || code === parent) return false;
    const p = getParentCode(code, codes);
    return p === parent;
  });
}

function canPostDirectly(account, childRows) {
  if (!account || parseInt(account.active, 10) !== 1) return false;
  if (parseInt(account.is_posting, 10) !== 1) return false;
  const code = String(account.code || '').trim();
  const postableChildren = (childRows || []).filter(
    (c) => parseInt(c.is_posting, 10) === 1 && parseInt(c.active, 10) === 1
  );
  if (postableChildren.length > 0) return false;
  if (!templateRequiresSubAccount(code)) return true;
  return false;
}

function proposeNextSubAccountCode(parentCode, existingCodes) {
  const parent = String(parentCode || '').trim();
  if (!isNumericCode(parent)) throw new Error(`Invalid parent account code: ${parent}`);
  const len = parent.length;
  const prefix = parent.slice(0, len - 1);
  const family = new Set(existingCodes.map((c) => String(c).trim()).filter((c) => c.length === len && c.startsWith(prefix)));

  for (let d = 0; d <= 9; d++) {
    const candidate = prefix + String(d);
    if (candidate === parent) continue;
    if (!family.has(candidate)) return candidate;
  }

  let suffix = 1;
  while (suffix < 1000) {
    const candidate = parent + String(suffix);
    if (!existingCodes.includes(candidate)) return candidate;
    suffix++;
  }
  throw new Error(`No available sub-account code under ${parent}`);
}

async function createFinSubAccount(pool, opts) {
  const code = String(opts.code || '').trim();
  const parentCode = String(opts.parentCode || '').trim();
  const label = String(opts.label || code).trim().slice(0, 255);
  const facilityId = Math.max(1, parseInt(opts.facilityId, 10) || 1);
  if (!isNumericCode(code)) throw new Error('Sub-account code must be numeric.');
  if (!parentCode) throw new Error('Parent account code is required.');

  const accounts = await loadActiveAccounts(pool, facilityId);
  const byCode = accountByCode(accounts);
  const allCodes = [...byCode.keys()];

  if (byCode.has(code)) throw new Error(`Account ${code} already exists.`);

  const parent = byCode.get(parentCode);
  if (!parent) throw new Error(`Parent account ${parentCode} not found.`);

  if (code === parentCode) throw new Error('Sub-account code must differ from the mother account.');

  const ohadaClass = parseInt(parent.ohada_class, 10) || parseInt(String(code)[0], 10) || 0;
  const accountType = String(opts.account_type || parent.account_type || 'asset').slice(0, 32);

  const [ins] = await pool.query(
    `INSERT INTO tbl_fin_account
       (facility_id, code, account_number, label_en, name, ohada_class, account_type, parent_id, is_posting, sort_order, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1)`,
    [facilityId, code, code, label, label, ohadaClass, accountType, parent.id, parseInt(code, 10) || 0]
  );

  await pool.query('UPDATE tbl_fin_account SET is_posting = 0 WHERE id = ?', [parent.id]).catch(() => {});

  const created = {
    id: ins.insertId,
    code,
    label,
    parentCode,
    ohada_class: ohadaClass,
    account_type: accountType,
  };

  try {
    const { notifyCoreAccountChanged } = require('./coreAccountWebhook');
    await notifyCoreAccountChanged(pool, created, 'account.created');
  } catch (_) {
    /* optional integration */
  }

  return created;
}

/**
 * Resolve a template/mother code to a postable leaf for journal lines.
 */
async function resolvePostingAccount(pool, templateCode, opts = {}) {
  const motherCode = String(templateCode || '').trim();
  const facilityId = Math.max(1, parseInt(opts.facilityId, 10) || 1);
  const autoCreate = Boolean(opts.autoCreate);
  const labelSuffix = String(opts.labelSuffix || '').trim();

  if (!motherCode) {
    return { ok: false, error: 'Account code is required.', needsSubAccount: false };
  }

  const accounts = await loadActiveAccounts(pool, facilityId);
  const byCode = accountByCode(accounts);
  const allCodes = [...byCode.keys()];
  const mother = byCode.get(motherCode);

  if (!mother) {
    return {
      ok: false,
      error: `Account ${motherCode} does not exist in the chart of accounts. Transaction cannot be posted.`,
      needsSubAccount: false,
      motherCode,
    };
  }

  const motherLabel = String(mother.label_en || mother.name || motherCode).trim();
  const kids = childrenOf(motherCode, accounts);
  const postableKids = kids.filter((c) => parseInt(c.is_posting, 10) === 1 && parseInt(c.active, 10) === 1);

  if (canPostDirectly(mother, kids)) {
    return { ok: true, code: motherCode, label: motherLabel, created: [], motherCode };
  }

  if (postableKids.length > 0) {
    const pick = postableKids.sort((a, b) => String(a.code).localeCompare(String(b.code)))[0];
    return {
      ok: true,
      code: String(pick.code).trim(),
      label: String(pick.label_en || pick.name || pick.code).trim(),
      created: [],
      motherCode,
    };
  }

  const proposedCode = proposeNextSubAccountCode(motherCode, allCodes);
  const proposedLabel = labelSuffix ? `${motherLabel} — ${labelSuffix}` : `${motherLabel} — sub-account`;

  if (!autoCreate) {
    return {
      ok: false,
      needsSubAccount: true,
      motherCode,
      motherLabel,
      proposedCode,
      proposedLabel,
      error: "Can't Post on Main Account , Please Create Sub Account and then Post the Transaction",
    };
  }

  const created = await createFinSubAccount(pool, {
    code: proposedCode,
    label: proposedLabel,
    parentCode: motherCode,
    facilityId,
    account_type: mother.account_type,
  });

  return {
    ok: true,
    code: created.code,
    label: created.label,
    created: [created],
    motherCode,
  };
}

/**
 * Resolve debit/credit mother templates for a journal entry.
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ facilityId?: number, autoCreate?: boolean, sides: Array<{ role: string, motherCode: string, labelSuffix?: string }> }} opts
 */
async function resolveJournalMotherAccounts(pool, opts = {}) {
  const facilityId = Math.max(1, parseInt(opts.facilityId, 10) || 1);
  const autoCreate = Boolean(opts.autoCreate);
  const sides = Array.isArray(opts.sides) ? opts.sides : [];
  const resolved = {};
  const missing = [];
  const created = [];

  for (const side of sides) {
    const role = String(side.role || '').trim() || 'line';
    const r = await resolvePostingAccount(pool, side.motherCode, {
      facilityId,
      autoCreate,
      labelSuffix: side.labelSuffix || role,
    });
    if (!r.ok) {
      if (r.needsSubAccount) missing.push({ role, ...r });
      else return { ok: false, error: r.error, missing, created, resolved };
      continue;
    }
    resolved[role] = { code: r.code, label: r.label, motherCode: r.motherCode };
    if (r.created?.length) created.push(...r.created);
  }

  if (missing.length) {
    return {
      ok: false,
      needsSubAccounts: true,
      missing,
      created,
      resolved,
      error: "Can't Post on Main Account , Please Create Sub Account and then Post the Transaction",
    };
  }

  return { ok: true, resolved, created, missing: [] };
}

/**
 * Resolve all journal lines from mother/template codes to postable sub-accounts.
 * @param {import('mysql2/promise').Pool} pool
 * @param {Array<{ code?: string, account_code?: string, label?: string, line_memo?: string, memo?: string, debit?: number, credit?: number }>} lines
 * @param {{ facilityId?: number, autoCreate?: boolean }} opts
 */
async function resolveJournalEntryLines(pool, lines, opts = {}) {
  const facilityId = Math.max(1, parseInt(opts.facilityId, 10) || 1);
  const autoCreate = Boolean(opts.autoCreate);
  const input = Array.isArray(lines) ? lines : [];
  const sides = [];
  const roles = [];

  let idx = 0;
  for (const ln of input) {
    const code = String(ln.code ?? ln.account_code ?? '').trim();
    const dr = Math.round((parseFloat(ln.debit) || 0) * 100) / 100;
    const cr = Math.round((parseFloat(ln.credit) || 0) * 100) / 100;
    if (!code || (dr <= 0 && cr <= 0)) continue;
    const role = `line-${idx}`;
    idx += 1;
    roles.push(role);
    sides.push({
      role,
      motherCode: code,
      labelSuffix: String(ln.label ?? ln.line_memo ?? ln.memo ?? '').slice(0, 80),
    });
  }

  if (!sides.length) {
    return { ok: true, lines: input, created: [], resolved: {} };
  }

  const resolved = await resolveJournalMotherAccounts(pool, { facilityId, autoCreate, sides });
  if (!resolved.ok) {
    return { ok: false, ...resolved, lines: input };
  }

  const out = input.map((ln) => ({ ...ln }));
  let lineIdx = 0;
  for (const ln of out) {
    const code = String(ln.code ?? ln.account_code ?? '').trim();
    const dr = Math.round((parseFloat(ln.debit) || 0) * 100) / 100;
    const cr = Math.round((parseFloat(ln.credit) || 0) * 100) / 100;
    if (!code || (dr <= 0 && cr <= 0)) continue;
    const role = `line-${lineIdx}`;
    lineIdx += 1;
    const hit = resolved.resolved[role];
    if (hit) {
      ln.code = hit.code;
      if (ln.account_code != null) ln.account_code = hit.code;
      if (!ln.label) ln.label = hit.label;
    }
  }

  return { ok: true, lines: out, created: resolved.created || [], resolved: resolved.resolved };
}

function defaultAutoCreateSubAccounts(sourceType, explicit) {
  if (explicit != null) return Boolean(explicit);
  const st = String(sourceType || '').trim().toLowerCase();
  if (st === 'manual_import' || st === 'manual_od') return false;
  return String(process.env.HMS_JOURNAL_AUTO_SUB_ACCOUNTS ?? '1').trim() !== '0';
}

module.exports = {
  DIRECT_POSTABLE_CODES,
  getParentCode,
  templateRequiresSubAccount,
  proposeNextSubAccountCode,
  loadActiveAccounts,
  childrenOf,
  canPostDirectly,
  createFinSubAccount,
  resolvePostingAccount,
  resolveJournalMotherAccounts,
  resolveJournalEntryLines,
  defaultAutoCreateSubAccounts,
};
