/**
 * HMS journal entry form — glue between FinancialsPageApp and Account_Core journalCounterparts.
 */

import {
  counterpartHint,
  filterCounterpartAccounts,
  lineSide,
  lineTotals,
  ohadaClassFromCode,
  pickDefaultCounterpart,
  postingSideForLine,
  resolveLinePostingSide,
  sideFieldState,
} from './journalCounterparts';
import { catalogEntryForAccount, defaultLineDescription, pickDefaultCatalogService } from './hospitalServiceCatalog';

export function parseJournalAmount(raw) {
  const n = parseInt(String(raw ?? '').replace(/\D+/g, ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function emptyJournalLine() {
  return { accountId: '', debit: '', credit: '', memo: '', costCentre: '', catalogServiceKey: '' };
}

export function normalizeAccountSearch(query) {
  return String(query || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function filterAccountsBySearch(hmsAccounts, query) {
  const q = normalizeAccountSearch(query);
  if (!q || q.length < 2) return hmsAccounts || [];
  const tokens = q.split(/\s+/).filter(Boolean);
  return (hmsAccounts || []).filter((a) => {
    const code = a.account_code || a.code || '';
    const label = a.account_label || a.label || a.label_en || '';
    const hay = normalizeAccountSearch(`${code} ${label}`);
    return tokens.every((t) => hay.includes(t));
  });
}

export function accountCode(hmsAcct) {
  return String(hmsAcct?.account_code || hmsAcct?.code || '').trim();
}

export function journalLinesFromBody(body, min = 2) {
  const keys = Object.keys(body || {}).filter((k) => /^acc_\d+$/.test(k));
  const count = Math.max(min, keys.length ? Math.max(...keys.map((k) => parseInt(k.split('_')[1], 10))) + 1 : min);
  const lines = [];
  for (let i = 0; i < count; i++) {
    lines.push({
      accountId: String(body[`acc_${i}`] ?? ''),
      debit: String(body[`dr_${i}`] ?? ''),
      credit: String(body[`cr_${i}`] ?? ''),
      memo: String(body[`memo_${i}`] ?? ''),
      costCentre: String(body[`cc_${i}`] ?? ''),
      catalogServiceKey: String(body[`catalog_${i}`] ?? ''),
    });
  }
  while (lines.length < min) lines.push(emptyJournalLine());
  return lines;
}

export function journalLineTotals(lines) {
  const cpLines = hmsLinesToCounterpartLines(lines, []);
  const { debit, credit, diff } = lineTotals(cpLines);
  return { debit, credit, diff, balanced: debit === credit && debit > 0 };
}

export function accountById(accounts, accountId) {
  if (!accountId) return null;
  return accounts.find((a) => String(a.id) === String(accountId)) || null;
}

export function toJournalAccount(hmsAcct) {
  const code = String(hmsAcct?.account_code || hmsAcct?.code || '').trim();
  return {
    id: String(hmsAcct.id),
    code,
    label: String(hmsAcct.account_label || hmsAcct.label || hmsAcct.label_en || '').trim(),
    ohada_class: hmsAcct.ohada_class ?? ohadaClassFromCode(code),
    account_type: String(hmsAcct.account_type || '').toLowerCase(),
    normal_side: hmsAcct.normal_side || null,
  };
}

export function buildPostingAccounts(hmsAccounts) {
  return (hmsAccounts || []).map(toJournalAccount).filter((a) => a.code);
}

export function buildAccountsByCode(postingAccounts) {
  return new Map(postingAccounts.map((a) => [a.code, a]));
}

export function hmsLinesToCounterpartLines(hmsLines, hmsAccounts) {
  return (hmsLines || []).map((ln) => {
    const acct = accountById(hmsAccounts, ln.accountId);
    const code = acct ? String(acct.account_code || acct.code || '') : '';
    return {
      accountCode: code,
      debitAmount: parseJournalAmount(ln.debit),
      creditAmount: parseJournalAmount(ln.credit),
    };
  });
}

export function counterpartSide(side) {
  if (side === 'debit') return 'credit';
  if (side === 'credit') return 'debit';
  return null;
}

export function applyCounterpartAmount(line, cpSide, amount) {
  const amt = parseJournalAmount(amount);
  if (amt <= 0) return { ...line, debit: '', credit: '' };
  if (cpSide === 'debit') return { ...line, debit: String(amt), credit: '' };
  if (cpSide === 'credit') return { ...line, credit: String(amt), debit: '' };
  return line;
}

export function amountsForAccount(acct, catalogByAccount) {
  const code = acct?.account_code || acct?.code || '';
  const ja = acct ? toJournalAccount(acct) : null;
  const entry = catalogEntryForAccount(catalogByAccount, code);
  const service = entry ? pickDefaultCatalogService(entry) : null;
  const defaultPrice = service?.price || (entry?.default_price ? parseInt(String(entry.default_price), 10) : 0) || 0;
  const memo = defaultLineDescription(code, ja?.label || '', catalogByAccount);
  let side = null;
  if (ja) side = ja.normal_side || null;
  let debit = '';
  let credit = '';
  if (side === 'debit' && defaultPrice > 0) debit = String(defaultPrice);
  if (side === 'credit' && defaultPrice > 0) credit = String(defaultPrice);
  return { debit, credit, memo, side, amount: defaultPrice || parseJournalAmount(debit || credit) };
}

export function accountGroupsForLine(hmsAccounts, lineIndex, hmsLines, journalCode, showAll) {
  if (showAll || lineIndex < 1) {
    return { suggested: [], other: hmsAccounts, hint: '' };
  }
  const posting = buildPostingAccounts(hmsAccounts);
  const byCode = buildAccountsByCode(posting);
  const cpLines = hmsLinesToCounterpartLines(hmsLines, hmsAccounts);
  const prevHms = accountById(hmsAccounts, hmsLines[lineIndex - 1]?.accountId);
  if (!prevHms) return { suggested: [], other: hmsAccounts, hint: '' };
  const prevJa = toJournalAccount(prevHms);
  const prevCpLine = cpLines[lineIndex - 1];
  const prevSide =
    lineSide(prevCpLine) ||
    postingSideForLine(lineIndex - 1, prevCpLine, prevJa, journalCode, cpLines, byCode) ||
    (prevJa.normal_side === 'debit' || prevJa.normal_side === 'credit' ? prevJa.normal_side : null);
  if (!prevSide) return { suggested: [], other: hmsAccounts, hint: '' };
  const counterparts = filterCounterpartAccounts(prevJa, prevSide, posting, journalCode);
  const suggestedIds = new Set(counterparts.map((a) => String(a.id)));
  return {
    suggested: hmsAccounts.filter((a) => suggestedIds.has(String(a.id))),
    other: hmsAccounts.filter((a) => !suggestedIds.has(String(a.id))),
    hint: counterpartHint(prevJa, prevSide),
  };
}

export function postingSideForHmsLine(lineIndex, hmsLine, hmsAccounts, journalCode, hmsLines = null) {
  const posting = buildPostingAccounts(hmsAccounts);
  const byCode = buildAccountsByCode(posting);
  const allLines = Array.isArray(hmsLines) && hmsLines.length ? hmsLines : [hmsLine];
  const cpLines = hmsLinesToCounterpartLines(allLines, hmsAccounts);
  const cpLine = cpLines[lineIndex];
  const ja = toJournalAccount(accountById(hmsAccounts, hmsLine?.accountId || allLines[lineIndex]?.accountId));
  if (!ja?.code) return null;
  return resolveLinePostingSide(lineIndex, cpLine, journalCode, cpLines, byCode);
}

export function sideFieldStateForHmsLine(lineIndex, hmsLine, hmsLines, hmsAccounts, journalCode) {
  const posting = buildPostingAccounts(hmsAccounts);
  const byCode = buildAccountsByCode(posting);
  const cpLines = hmsLinesToCounterpartLines(hmsLines, hmsAccounts);
  const cpLine = cpLines[lineIndex];
  const side = resolveLinePostingSide(lineIndex, cpLine, journalCode, cpLines, byCode);
  return sideFieldState(side);
}

export function pickDefaultCounterpartHms(hmsAccounts, sourceHms, neededSide, journalCode) {
  if (!sourceHms || !neededSide) return null;
  const posting = buildPostingAccounts(hmsAccounts);
  const sourceJa = toJournalAccount(sourceHms);
  const sourceSide = neededSide === 'debit' ? 'credit' : neededSide === 'credit' ? 'debit' : null;
  if (!sourceSide) return null;
  const counterparts = filterCounterpartAccounts(sourceJa, sourceSide, posting, journalCode);
  const picked = pickDefaultCounterpart(counterparts, journalCode);
  if (!picked) return null;
  return accountById(hmsAccounts, picked.id);
}

export function mirrorCounterpartOnLines(hmsLines, hmsAccounts, index, journalCode, catalogByAccount) {
  const ln = hmsLines[index];
  if (!ln?.accountId) return hmsLines;
  const acct = accountById(hmsAccounts, ln.accountId);
  const { debit, credit, memo, side, amount } = amountsForAccount(acct, catalogByAccount);
  let next = hmsLines.map((row, i) => {
    if (i !== index) return row;
    return {
      ...row,
      debit: row.debit || debit,
      credit: row.credit || credit,
      memo: row.memo || memo,
    };
  });

  const posting = buildPostingAccounts(hmsAccounts);
  const byCode = buildAccountsByCode(posting);
  const cpLines = hmsLinesToCounterpartLines(next, hmsAccounts);
  const ja = toJournalAccount(acct);
  const enteredSide =
    lineSide(cpLines[index]) ||
    postingSideForLine(index, cpLines[index], ja, journalCode, cpLines, byCode) ||
    side;
  const lineAmount = amount || parseJournalAmount(enteredSide === 'debit' ? next[index].debit : next[index].credit);
  const cpIdx = index + 1;

  if (cpIdx < next.length && enteredSide) {
    const cpSide = counterpartSide(enteredSide);
    const cpAcct = pickDefaultCounterpartHms(hmsAccounts, acct, cpSide, journalCode);
    if (cpAcct) {
      next = next.map((row, i) => {
        if (i !== cpIdx) return row;
        return applyCounterpartAmount(
          { ...row, accountId: String(cpAcct.id), memo: row.memo || cpAcct.account_label || '' },
          cpSide,
          lineAmount
        );
      });
    }
  } else if (lineAmount > 0) {
    const totals = journalLineTotals(next);
    if (totals.diff !== 0) {
      const abs = Math.abs(totals.diff);
      const counterpartIdx = next.findIndex(
        (row, i) => i !== index && row.accountId && !parseJournalAmount(row.debit) && !parseJournalAmount(row.credit)
      );
      if (counterpartIdx >= 0) {
        const cpAcct = accountById(hmsAccounts, next[counterpartIdx].accountId);
        const cpSide =
          postingSideForHmsLine(counterpartIdx, next[counterpartIdx], hmsAccounts, journalCode, next) ||
          counterpartSide(enteredSide);
        next = next.map((row, i) => (i === counterpartIdx ? applyCounterpartAmount(row, cpSide, abs) : row));
      }
    }
  }
  return next;
}

export function autoBalanceLines(hmsLines, targetIndex = null) {
  const totals = journalLineTotals(hmsLines);
  if (totals.diff === 0) return hmsLines;
  const idx =
    targetIndex ??
    hmsLines.findIndex((ln, i) => i > 0 && ln.accountId && !parseJournalAmount(ln.debit) && !parseJournalAmount(ln.credit));
  const useIdx = idx >= 0 ? idx : hmsLines.length >= 2 ? 1 : -1;
  if (useIdx < 0) return hmsLines;
  const abs = Math.abs(totals.diff);
  return hmsLines.map((ln, i) => {
    if (i !== useIdx) return ln;
    if (totals.diff > 0) return { ...ln, credit: String(abs), debit: '' };
    return { ...ln, debit: String(abs), credit: '' };
  });
}
