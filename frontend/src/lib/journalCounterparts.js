/**
 * OHADA double-entry — counterpart filtering and side locking (Account_Core parity).
 */

import {
  isPaymentMethodAccountCode,
  PAYMENT_METHOD_ACCOUNT_CODES,
} from './paymentMethodAccounts';

export { isPaymentMethodAccountCode, PAYMENT_METHOD_ACCOUNT_CODES };

export function ohadaClassFromCode(code) {
  const c = String(code || '').trim();
  if (!c || !/^\d/.test(c)) return 0;
  return parseInt(c[0], 10);
}

export function lineSide(line) {
  const debit = Number(line?.debitAmount) || 0;
  const credit = Number(line?.creditAmount) || 0;
  if (debit > 0 && credit === 0) return 'debit';
  if (credit > 0 && debit === 0) return 'credit';
  return null;
}

export function mapJournalTypeToCode(journalType) {
  switch (journalType) {
    case 'TJE':
      return 'OD';
    default:
      return 'OD';
  }
}

export function naturalSideForAccount(account, journalCode = 'OD') {
  if (!account?.code) return null;
  const cls = account.ohada_class ?? ohadaClassFromCode(account.code);
  const type = account.account_type;
  if (cls === 7 || type === 'income' || type === 'revenue') return 'credit';
  if (cls === 6 || type === 'expense' || type === 'cost') return 'debit';
  if (cls === 5) return 'debit';
  if (cls === 4 && String(account.code).startsWith('411')) return 'debit';
  if (cls === 4) return 'credit';
  if (journalCode === 'VTE') return 'credit';
  return null;
}

export function expectedSideForLine(lineIndex, allLines, journalCode, accountsByCode) {
  if (lineIndex <= 0) return null;
  const prev = allLines[lineIndex - 1];
  if (!prev) return null;

  const prevEntered = lineSide(prev);
  if (prevEntered) return prevEntered === 'debit' ? 'credit' : 'debit';

  const prevAcct = accountsByCode.get(String(prev.accountCode || ''));
  if (prevAcct) {
    const prevSide = naturalSideForAccount(prevAcct, journalCode);
    if (prevSide) return prevSide === 'debit' ? 'credit' : 'debit';
  }
  return null;
}

export function resolveLinePostingSide(lineIndex, line, journalCode, allLines, accountsByCode) {
  const acct = accountsByCode.get(String(line?.accountCode || ''));
  if (acct) {
    return postingSideForLine(lineIndex, line, acct, journalCode, allLines, accountsByCode);
  }
  return expectedSideForLine(lineIndex, allLines, journalCode, accountsByCode);
}

export function postingSideForLine(lineIndex, line, account, journalCode, allLines, accountsByCode) {
  const existing = lineSide(line);
  if (existing) return existing;

  if (lineIndex > 0) {
    const expected = expectedSideForLine(lineIndex, allLines, journalCode, accountsByCode);
    if (expected) return expected;
  }

  return naturalSideForAccount(account, journalCode);
}

export function sideFieldState(postingSide) {
  if (postingSide === 'debit') {
    return { debitEnabled: true, creditEnabled: false, label: 'Debit only' };
  }
  if (postingSide === 'credit') {
    return { debitEnabled: false, creditEnabled: true, label: 'Credit only' };
  }
  return { debitEnabled: false, creditEnabled: false, label: '' };
}

export function sideHintForLine(lineIndex, line, _account, journalCode, allLines, accountsByCode) {
  const side = resolveLinePostingSide(lineIndex, line, journalCode, allLines, accountsByCode);
  if (!side) return '';
  return side === 'debit' ? 'Enter amount in Debit (XAF)' : 'Enter amount in Credit (XAF)';
}

const TREASURY_CODES = [...PAYMENT_METHOD_ACCOUNT_CODES, '531000', '512000', '571000', '521000'];
const RECEIVABLE_CODES = ['411000'];
const PAYABLE_CODES = ['401000', '421000', '441000', '445710'];

function paymentMethodCounterparts(pool, journalCode) {
  const paymentPool = pool.filter((a) => isPaymentMethodAccountCode(a.code) || isReceivable(a.code));
  if (paymentPool.length) {
    return sortByPriority(paymentPool, [...PAYMENT_METHOD_ACCOUNT_CODES, ...RECEIVABLE_CODES], journalCode);
  }
  return sortByPriority(pool, [...TREASURY_CODES, ...RECEIVABLE_CODES], journalCode);
}

function sortByPriority(accounts, priorityCodes, journalCode) {
  const journalFirst =
    journalCode === 'CA'
      ? ['552601', '531000', '571000']
      : journalCode === 'BQ'
        ? ['552604', '512000', '521000']
        : [];
  const order = [...journalFirst, ...priorityCodes];
  const rank = new Map(order.map((c, i) => [c, i]));
  return [...accounts].sort((a, b) => {
    const ra = rank.has(a.code) ? rank.get(a.code) : 999;
    const rb = rank.has(b.code) ? rank.get(b.code) : 999;
    if (ra !== rb) return ra - rb;
    return a.code.localeCompare(b.code);
  });
}

function isTreasury(code) {
  return ohadaClassFromCode(code) === 5;
}

function isReceivable(code) {
  return ohadaClassFromCode(code) === 4 && String(code).startsWith('411');
}

function isPayable(code) {
  const c = String(code);
  return ohadaClassFromCode(c) === 4 && !c.startsWith('411');
}

function isRevenue(account) {
  const cls = account.ohada_class ?? ohadaClassFromCode(account.code);
  return cls === 7 || account.account_type === 'income' || account.account_type === 'revenue';
}

function isExpense(account) {
  const cls = account.ohada_class ?? ohadaClassFromCode(account.code);
  return cls === 6 || account.account_type === 'expense' || account.account_type === 'cost';
}

function isHospitalRevenueCode(code) {
  const c = String(code);
  return (
    c.startsWith('7016') ||
    c.startsWith('7026') ||
    c.startsWith('7036') ||
    c.startsWith('7046') ||
    c.startsWith('7066')
  );
}

export function filterCounterpartAccounts(sourceAccount, sourceSide, allAccounts, journalCode = 'OD') {
  let pool = allAccounts.filter((a) => a.code !== sourceAccount.code);

  if (sourceSide === 'credit') {
    if (isRevenue(sourceAccount)) {
      pool = pool.filter((a) => isPaymentMethodAccountCode(a.code) || isTreasury(a.code) || isReceivable(a.code));
      return paymentMethodCounterparts(pool, journalCode);
    }
    if (isPayable(sourceAccount.code)) {
      pool = pool.filter((a) => isTreasury(a.code) || isExpense(a));
      return sortByPriority(pool, [...TREASURY_CODES], journalCode);
    }
    if (isTreasury(sourceAccount.code)) {
      pool = pool.filter((a) => isRevenue(a) || isExpense(a));
      return sortByPriority(
        pool.filter((a) => isRevenue(a)),
        [],
        journalCode
      ).concat(sortByPriority(pool.filter((a) => isExpense(a)), [], journalCode));
    }
  }

  if (sourceSide === 'debit') {
    if (isRevenue(sourceAccount)) {
      pool = pool.filter((a) => isPaymentMethodAccountCode(a.code) || isTreasury(a.code) || isReceivable(a.code));
      return paymentMethodCounterparts(pool, journalCode);
    }
    if (isExpense(sourceAccount)) {
      pool = pool.filter((a) => isTreasury(a.code) || isPayable(a.code));
      return sortByPriority(pool, [...TREASURY_CODES, ...PAYABLE_CODES], journalCode);
    }
    if (isTreasury(sourceAccount.code) || isReceivable(sourceAccount.code)) {
      pool = pool.filter((a) => isRevenue(a) || isExpense(a));
      const revenue = pool.filter((a) => isRevenue(a));
      const hospitalFirst = [
        ...revenue.filter((a) => isHospitalRevenueCode(a.code)),
        ...revenue.filter((a) => !isHospitalRevenueCode(a.code)),
      ];
      return hospitalFirst.concat(pool.filter((a) => isExpense(a)));
    }
    if (isPayable(sourceAccount.code)) {
      pool = pool.filter((a) => isTreasury(a.code) || isExpense(a));
      return sortByPriority(pool, [...TREASURY_CODES], journalCode);
    }
  }

  return pool;
}

export function pickDefaultCounterpart(counterparts, journalCode) {
  if (!counterparts.length) return null;
  if (journalCode === 'CA') {
    return (
      counterparts.find((a) => a.code === '552601') ||
      counterparts.find((a) => a.code === '531000') ||
      counterparts.find((a) => isTreasury(a.code)) ||
      counterparts[0]
    );
  }
  if (journalCode === 'BQ') {
    return (
      counterparts.find((a) => a.code === '552604') ||
      counterparts.find((a) => a.code === '512000') ||
      counterparts.find((a) => isTreasury(a.code)) ||
      counterparts[0]
    );
  }
  if (journalCode === 'VTE') {
    return (
      counterparts.find((a) => a.code === '552601') ||
      counterparts.find((a) => isPaymentMethodAccountCode(a.code)) ||
      counterparts.find((a) => isTreasury(a.code)) ||
      counterparts[0]
    );
  }
  if (journalCode === 'ACH') {
    return counterparts.find((a) => isPayable(a.code)) || counterparts.find((a) => isTreasury(a.code)) || counterparts[0];
  }
  return counterparts[0];
}

export function counterpartHint(sourceAccount, sourceSide) {
  if (!sourceAccount?.code || !sourceSide) return '';
  if (sourceSide === 'credit' && isRevenue(sourceAccount)) {
    return 'Payment method — Cash, OM, MOMO, Bank, BetterPay, or Wallet (debit side)';
  }
  if (sourceSide === 'debit' && (isTreasury(sourceAccount.code) || isReceivable(sourceAccount.code))) {
    return 'Revenue or expense accounts (credit side)';
  }
  if (sourceSide === 'debit' && isExpense(sourceAccount)) {
    return 'Cash, bank, or supplier payables (credit side)';
  }
  if (sourceSide === 'credit' && isExpense(sourceAccount)) {
    return 'Cash or bank accounts (debit side)';
  }
  return 'Matching counterpart accounts for double entry';
}

export function lineTotals(lines) {
  let debit = 0;
  let credit = 0;
  for (const ln of lines) {
    debit += Number(ln.debitAmount) || 0;
    credit += Number(ln.creditAmount) || 0;
  }
  return { debit, credit, diff: debit - credit };
}

export function applySideLockToLineValues(line, postingSide) {
  if (postingSide === 'debit') return { debitAmount: line.debitAmount ?? 0, creditAmount: 0 };
  if (postingSide === 'credit') return { debitAmount: 0, creditAmount: line.creditAmount ?? 0 };
  return { debitAmount: 0, creditAmount: 0 };
}

export function linePairsWithRevenueCredit(lineIndex, allLines, accountsByCode, journalCode) {
  if (lineIndex <= 0) return false;
  const prev = allLines[lineIndex - 1];
  const prevAcct = accountsByCode.get(String(prev?.accountCode || ''));
  if (!prevAcct || !isRevenue(prevAcct)) return false;
  const prevSide =
    lineSide(prev) ||
    postingSideForLine(lineIndex - 1, prev, prevAcct, journalCode, allLines, accountsByCode);
  return prevSide === 'credit';
}
