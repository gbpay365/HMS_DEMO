import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaIcon } from '../FaIcon';
import {
  accountById,
  accountCode,
  applyCounterpartAmount,
  buildAccountsByCode,
  buildPostingAccounts,
  filterAccountsBySearch,
  hmsLinesToCounterpartLines,
  mirrorCounterpartOnLines,
  parseJournalAmount,
  postingSideForHmsLine,
  sideFieldStateForHmsLine,
  toJournalAccount,
} from '../../lib/journalEntryFormHelpers';
import {
  counterpartHint,
  filterCounterpartAccounts,
  linePairsWithRevenueCredit,
  lineTotals,
  pickDefaultCounterpart,
  postingSideForLine,
  resolveLinePostingSide,
  sideHintForLine,
} from '../../lib/journalCounterparts';
import { paymentMethodsFromAccounts } from '../../lib/paymentMethodAccounts';
import {
  catalogEntryForAccount,
  defaultLineDescription,
  findCatalogService,
  isHospitalRevenueAccount,
  pickDefaultCatalogService,
} from '../../lib/hospitalServiceCatalog';

function applySideLockHms(line, postingSide) {
  if (postingSide === 'debit') return { ...line, credit: '' };
  if (postingSide === 'credit') return { ...line, debit: '' };
  return line;
}

function applyCatalogToHmsLine(lines, index, accountCodeStr, catalogByAccount, serviceKey) {
  const entry = catalogEntryForAccount(catalogByAccount, accountCodeStr);
  if (!entry || !isHospitalRevenueAccount(accountCodeStr)) return lines;
  const service = serviceKey ? findCatalogService(entry, serviceKey) : pickDefaultCatalogService(entry);
  if (!service) return lines;
  const next = [...lines];
  next[index] = {
    ...next[index],
    catalogServiceKey: service.key,
    credit: String(service.price),
    debit: '',
    memo: next[index].memo?.trim() ? next[index].memo : service.name,
  };
  return next;
}

export function JournalLedgerLinesGrid({ accounts = [], catalogByAccount = {}, journalCode = 'OD', lines = [], onLinesChange, costCenters = [] }) {
  const { t, i18n } = useTranslation('financials');
  const isEn = i18n.language?.startsWith('en');
  const [narrativeDrafts, setNarrativeDrafts] = useState({});
  const [suggestionLine, setSuggestionLine] = useState(null);
  const [suggestionHighlight, setSuggestionHighlight] = useState(0);
  const suggestionBlurTimer = useRef(null);

  const postingAccounts = useMemo(() => buildPostingAccounts(accounts), [accounts]);
  const accountsByCode = useMemo(() => buildAccountsByCode(postingAccounts), [postingAccounts]);
  const cpLines = useMemo(() => hmsLinesToCounterpartLines(lines, accounts), [lines, accounts]);

  const paymentMethodOptions = useMemo(
    () => paymentMethodsFromAccounts(postingAccounts.map((a) => ({ id: a.id, code: a.code, label: a.label }))),
    [postingAccounts]
  );

  const lineHints = useMemo(() => {
    return lines.map((_ln, i) => {
      if (i === 0) return '';
      const prev = cpLines[i - 1];
      const prevHms = accountById(accounts, lines[i - 1]?.accountId);
      const srcAcct = prevHms ? toJournalAccount(prevHms) : null;
      const side = srcAcct ? postingSideForLine(i - 1, prev, srcAcct, journalCode, cpLines, accountsByCode) : null;
      return srcAcct && side ? counterpartHint(srcAcct, side) : '';
    });
  }, [lines, cpLines, accounts, accountsByCode, journalCode]);

  const accountsForLine = useCallback(
    (lineIndex) => {
      let pool = postingAccounts;
      if (lineIndex > 0) {
        const prevHms = accountById(accounts, lines[lineIndex - 1]?.accountId);
        const srcAcct = prevHms ? toJournalAccount(prevHms) : null;
        if (srcAcct) {
          const side = postingSideForLine(lineIndex - 1, cpLines[lineIndex - 1], srcAcct, journalCode, cpLines, accountsByCode);
          if (side) pool = filterCounterpartAccounts(srcAcct, side, postingAccounts, journalCode);
        }
      }
      return pool;
    },
    [postingAccounts, lines, cpLines, accounts, accountsByCode, journalCode]
  );

  const hmsAccountsForLine = useCallback(
    (lineIndex) => {
      const codes = new Set(accountsForLine(lineIndex).map((a) => a.code));
      return accounts.filter((a) => codes.has(accountCode(a)));
    },
    [accountsForLine, accounts]
  );

  const suggestionsForLine = useCallback(
    (lineIndex, query) => {
      const q = String(query || '').trim();
      if (q.length < 2) return [];
      return filterAccountsBySearch(hmsAccountsForLine(lineIndex), q).slice(0, 12);
    },
    [hmsAccountsForLine]
  );

  const setLines = (updater) => {
    onLinesChange(typeof updater === 'function' ? updater(lines) : updater);
  };

  const cancelSuggestionBlur = () => {
    if (suggestionBlurTimer.current) {
      clearTimeout(suggestionBlurTimer.current);
      suggestionBlurTimer.current = null;
    }
  };

  const applyCounterpartToNextLine = useCallback(
    (allLines, index) => {
      const nextIdx = index + 1;
      if (nextIdx >= allLines.length) return allLines;

      const srcHms = accountById(accounts, allLines[index]?.accountId);
      const srcAcct = srcHms ? toJournalAccount(srcHms) : null;
      if (!srcAcct) return allLines;

      const cpAll = hmsLinesToCounterpartLines(allLines, accounts);
      const side = postingSideForLine(index, cpAll[index], srcAcct, journalCode, cpAll, accountsByCode);
      if (!side) return allLines;

      const counterparts = filterCounterpartAccounts(srcAcct, side, postingAccounts, journalCode);
      if (!counterparts.length) return allLines;

      let next = allLines.map((ln) => ({ ...ln }));
      const nextLine = next[nextIdx];
      const nextCode = accountCode(accountById(accounts, nextLine.accountId));
      const currentOk = nextCode && counterparts.some((a) => a.code === nextCode);

      if (!currentOk) {
        const def = pickDefaultCounterpart(counterparts, journalCode);
        if (def) {
          const hit = accounts.find((a) => accountCode(a) === def.code);
          const prevNarrative = String(allLines[index].memo || '').trim();
          next[nextIdx] = {
            ...nextLine,
            accountId: hit ? String(hit.id) : '',
            memo: prevNarrative || nextLine.memo || '',
          };
        }
      }

      const postingSide = resolveLinePostingSide(nextIdx, hmsLinesToCounterpartLines(next, accounts)[nextIdx], journalCode, hmsLinesToCounterpartLines(next, accounts), accountsByCode);
      next[nextIdx] = applySideLockHms(next[nextIdx], postingSide);

      const { diff } = lineTotals(hmsLinesToCounterpartLines(next, accounts));
      if (diff !== 0) {
        const abs = Math.abs(diff);
        const nextSide = resolveLinePostingSide(nextIdx, hmsLinesToCounterpartLines(next, accounts)[nextIdx], journalCode, hmsLinesToCounterpartLines(next, accounts), accountsByCode);
        if (nextSide === 'credit' || (!nextSide && diff > 0)) {
          next[nextIdx] = { ...next[nextIdx], credit: String(abs), debit: '' };
        } else {
          next[nextIdx] = { ...next[nextIdx], debit: String(abs), credit: '' };
        }
      }

      const prevNarrative = String(allLines[index].memo || '').trim();
      if (prevNarrative && next[nextIdx].accountId) {
        next[nextIdx] = { ...next[nextIdx], memo: prevNarrative };
      } else if (next[nextIdx].accountId && !String(next[nextIdx].memo || '').trim()) {
        const acct = accountById(accounts, next[nextIdx].accountId);
        next[nextIdx] = {
          ...next[nextIdx],
          memo: defaultLineDescription(accountCode(acct), acct?.account_label || acct?.label || '', catalogByAccount),
        };
      }
      return next;
    },
    [accounts, accountsByCode, journalCode, postingAccounts, catalogByAccount]
  );

  const syncLineSideLock = useCallback(
    (allLines, index) => {
      const postingSide = postingSideForHmsLine(index, allLines[index], accounts, journalCode);
      const next = allLines.map((ln, i) => (i === index ? applySideLockHms(ln, postingSide) : ln));
      return applyCounterpartToNextLine(next, index);
    },
    [accounts, journalCode, applyCounterpartToNextLine]
  );

  const onAccountChange = (index, accountId) => {
    if (!accountId) {
      setLines((prev) =>
        prev.map((ln, i) =>
          i === index ? { ...ln, accountId: '', debit: '', credit: '', memo: '', catalogServiceKey: '' } : ln
        )
      );
      setNarrativeDrafts((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
      setSuggestionLine((cur) => (cur === index ? null : cur));
      return;
    }

    let next = mirrorCounterpartOnLines(lines, accounts, index, journalCode, catalogByAccount);
    const acct = accountById(accounts, accountId);
    const code = accountCode(acct);
    next = syncLineSideLock(next, index);
    const side = postingSideForHmsLine(index, next[index], accounts, journalCode);
    if (side === 'credit' && isHospitalRevenueAccount(code)) {
      next = applyCatalogToHmsLine(next, index, code, catalogByAccount);
    }
    if (parseJournalAmount(next[index].credit) > 0 && index + 1 < next.length) {
      next = applyCounterpartToNextLine(next, index);
    }
    clearNarrativeDraft(index);
    setSuggestionLine(null);
    setLines(next);
  };

  const clearNarrativeDraft = (index) => {
    setNarrativeDrafts((prev) => {
      if (!(index in prev)) return prev;
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const applyAccountFromSearch = (index, hmsAcct, narrativeText) => {
    cancelSuggestionBlur();
    clearNarrativeDraft(index);
    setSuggestionLine(null);
    let next = mirrorCounterpartOnLines(lines, accounts, index, journalCode, catalogByAccount);
    next = next.map((ln, i) => (i === index ? { ...ln, accountId: String(hmsAcct.id), memo: narrativeText.trim() || ln.memo } : ln));
    const acct = hmsAcct;
    const code = accountCode(acct);
    next = syncLineSideLock(next, index);
    const side = postingSideForHmsLine(index, next[index], accounts, journalCode);
    if (side === 'credit' && isHospitalRevenueAccount(code)) {
      next = applyCatalogToHmsLine(next, index, code, catalogByAccount);
    }
    if (parseJournalAmount(next[index].credit) > 0 && index + 1 < next.length) {
      next = applyCounterpartToNextLine(next, index);
    }
    setLines(next);
  };

  const applyLineAmount = (index, side, value) => {
    const amt = parseJournalAmount(value);
    let next = lines.map((ln, i) => {
      if (i !== index) return ln;
      if (side === 'debit') return { ...ln, debit: amt > 0 ? String(amt) : '', credit: amt > 0 ? '' : ln.credit };
      return { ...ln, credit: amt > 0 ? String(amt) : '', debit: amt > 0 ? '' : ln.debit };
    });

    const cpIdx = index + 1;
    if (amt > 0 && cpIdx < next.length) {
      const cpSide = postingSideForHmsLine(cpIdx, next[cpIdx], accounts, journalCode);
      if (cpSide) next = next.map((row, i) => (i === cpIdx ? applyCounterpartAmount(row, cpSide, amt) : row));
    }

    if (amt > 0) {
      if (side === 'debit' && index + 1 < next.length) next = applyCounterpartToNextLine(next, index);
      else if (side === 'credit' && index > 0) {
        next = applyCounterpartToNextLine(next, index - 1);
        const prevNarrative = String(next[index - 1]?.memo || '').trim();
        if (prevNarrative) next[index] = { ...next[index], memo: prevNarrative };
      }
    }
    setLines(next);
  };

  const onCatalogServiceChange = (index, serviceKey) => {
    const acct = accountById(accounts, lines[index]?.accountId);
    const code = accountCode(acct);
    if (!code) return;
    let next = applyCatalogToHmsLine(lines, index, code, catalogByAccount, serviceKey);
    next = syncLineSideLock(next, index);
    if (parseJournalAmount(next[index].credit) > 0 && index + 1 < next.length) {
      next = applyCounterpartToNextLine(next, index);
    }
    setLines(next);
  };

  const handleAddLine = () => {
    const prevIndex = lines.length - 1;
    const lastLine = lines[prevIndex];
    const prevNarrative = String(lastLine?.memo || '').trim();
    let initialDebit = '';
    let initialCredit = '';
    if (parseJournalAmount(lastLine?.debit) > 0) initialCredit = lastLine.debit;
    else if (parseJournalAmount(lastLine?.credit) > 0) initialDebit = lastLine.credit;

    const newLine = {
      accountId: '',
      debit: initialDebit,
      credit: initialCredit,
      memo: prevNarrative,
      costCentre: String(lastLine?.costCentre || ''),
      catalogServiceKey: '',
    };
    let next = [...lines.map((ln) => ({ ...ln })), newLine];
    if (lastLine?.accountId) {
      next = applyCounterpartToNextLine(next, prevIndex);
      const newIdx = next.length - 1;
      if (prevNarrative) next[newIdx] = { ...next[newIdx], memo: prevNarrative };
    }
    setLines(next);
  };

  const removeLine = (index) => {
    if (lines.length <= 2) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const onNarrativeChange = (index, text) => {
    setNarrativeDrafts((prev) => ({ ...prev, [index]: text }));
    if (!lines[index]?.accountId) {
      setSuggestionLine(index);
      setSuggestionHighlight(0);
    }
  };

  const onNarrativeBlur = (index) => {
    suggestionBlurTimer.current = setTimeout(() => {
      setSuggestionLine((cur) => (cur === index ? null : cur));
      setNarrativeDrafts((drafts) => {
        if (index in drafts) {
          setLines((prev) => prev.map((ln, i) => (i === index ? { ...ln, memo: drafts[index] } : ln)));
          const next = { ...drafts };
          delete next[index];
          return next;
        }
        return drafts;
      });
    }, 160);
  };

  const narrativeDisplayValue = (index, line) => {
    if (index in narrativeDrafts) return narrativeDrafts[index];
    return line.memo || '';
  };

  const showPaymentWarning =
    paymentMethodOptions.length === 0 &&
    lines.some((ln) => {
      const a = accountById(accounts, ln.accountId);
      const ja = a ? toJournalAccount(a) : null;
      return ja?.ohada_class === 7 || ja?.account_type === 'revenue' || ja?.account_type === 'income';
    });

  return (
    <div className="jem-lines-stack">
      {showPaymentWarning ? (
        <div className="jem-line-hint jem-line-hint--warn">
          {isEn
            ? 'Payment method accounts (552601–552606) are missing from the chart. Import the chart to enable Cash / OM / MOMO / Bank on the debit line.'
            : 'Comptes de paiement (552601–552606) absents du plan. Importez le plan pour activer Caisse / OM / MOMO / Banque.'}
        </div>
      ) : null}

      <p className="jem-line-hint">
        {t('journal_form.narrative_search_hint', {
          defaultValue:
            'Type in Narrative to search — suggestions appear beside the field. Pick one to set GL account; then edit Narrative freely without filtering.',
        })}
      </p>

      <div className="jem-lt-outer">
        <table className="jem-lt-table">
          <thead>
            <tr>
              <th className="jem-lt-col-account">
                <span className="jem-lt-h">
                  <FaIcon name="hashtag" className="jem-lt-ico" />
                  {t('journal_form.gl_account', { defaultValue: 'GL Account' })}
                </span>
              </th>
              <th className="jem-lt-col-narrative">
                <span className="jem-lt-h">
                  <FaIcon name="font" className="jem-lt-ico" />
                  {t('journal_form.narrative', { defaultValue: 'Narrative' })}
                </span>
              </th>
              <th className="jem-lt-col-cc">
                <span className="jem-lt-h">
                  <FaIcon name="th" className="jem-lt-ico" />
                  {t('journal_form.cost_centre', { defaultValue: 'Cost centre' })}
                </span>
              </th>
              <th className="jem-lt-col-amt jem-lt-r">
                <span className="jem-lt-h jem-lt-h--end">
                  <FaIcon name="arrow-circle-up" className="jem-lt-ico jem-lt-ico--red" />
                  {t('journal_form.debit_ph', { defaultValue: 'Debit' })}
                </span>
              </th>
              <th className="jem-lt-col-amt jem-lt-r">
                <span className="jem-lt-h jem-lt-h--end">
                  <FaIcon name="arrow-circle-down" className="jem-lt-ico jem-lt-ico--grn" />
                  {t('journal_form.credit_ph', { defaultValue: 'Credit' })}
                </span>
              </th>
              <th style={{ width: '2.5rem' }} />
            </tr>
          </thead>
          <tbody className="jem-lt-tbody">
            {lines.map((line, index) => {
              const acct = accountById(accounts, line.accountId);
              const code = accountCode(acct);
              const ja = acct ? toJournalAccount(acct) : null;
              const cpLine = cpLines[index];
              const sideState = sideFieldStateForHmsLine(index, line, lines, accounts, journalCode);
              const amountHint = sideHintForLine(index, cpLine, ja, journalCode, cpLines, accountsByCode);
              const lineOptions = hmsAccountsForLine(index);
              const showPaymentMethodPicker =
                index > 0 &&
                sideState.debitEnabled &&
                linePairsWithRevenueCredit(index, cpLines, accountsByCode, journalCode) &&
                paymentMethodOptions.length > 0;
              const catalogEntry = catalogEntryForAccount(catalogByAccount, code);
              const showCatalogPicker = sideState.creditEnabled && (catalogEntry?.services?.length ?? 0) > 0;
              const catalogServiceKey = line.catalogServiceKey || pickDefaultCatalogService(catalogEntry)?.key || '';
              const accountLocked = Boolean(line.accountId);
              const narrativeValue = narrativeDisplayValue(index, line);
              const showSuggestions = !accountLocked && suggestionLine === index && narrativeValue.trim().length >= 2;
              const lineSuggestions = showSuggestions ? suggestionsForLine(index, narrativeValue) : [];

              return (
                <Fragment key={`line-block-${index}`}>
                  {(amountHint || lineHints[index]) && (
                    <tr key={`hint-${index}`}>
                      <td colSpan={6} className="jem-lt-hint-row">
                        <span className="jem-lt-hint-text">
                          {amountHint}
                          {lineHints[index] ? `${amountHint ? ' · ' : ''}${lineHints[index]}` : ''}
                        </span>
                      </td>
                    </tr>
                  )}
                  {showPaymentMethodPicker && (
                    <tr key={`pm-${index}`}>
                      <td colSpan={6} className="jem-lt-hint-row">
                        <select
                          className="jem-lt-cc"
                          value={line.accountId || ''}
                          onChange={(e) => onAccountChange(index, e.target.value)}
                        >
                          <option value="">{isEn ? 'Select payment method (debit)…' : 'Mode de paiement (débit)…'}</option>
                          {paymentMethodOptions.map((pm) => {
                            const hit = accounts.find((a) => accountCode(a) === pm.code);
                            return hit ? (
                              <option key={pm.code} value={hit.id}>
                                {pm.shortLabel} — {pm.code} · {pm.label}
                              </option>
                            ) : null;
                          })}
                        </select>
                      </td>
                    </tr>
                  )}
                  {showCatalogPicker && (
                    <tr key={`cat-${index}`}>
                      <td colSpan={6} className="jem-lt-hint-row">
                        <select className="jem-lt-cc" value={catalogServiceKey} onChange={(e) => onCatalogServiceChange(index, e.target.value)}>
                          {catalogEntry.services.map((svc) => (
                            <option key={svc.key} value={svc.key}>
                              {svc.name} — {svc.price.toLocaleString(isEn ? 'en-US' : 'fr-FR')} XAF
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )}
                  <tr key={`row-${index}`} className="jem-lt-row">
                    <td className="jem-lt-col-account">
                      <div className="jem-lt-account-cell">
                        <span className="jem-lt-line-num" aria-hidden>
                          {index + 1}
                        </span>
                        <div className="jem-lt-account-main">
                          <select
                            name={`acc_${index}`}
                            className={`jem-lt-account-select${line.accountId ? ' jem-lt-account-select--picked' : ''}`}
                            value={line.accountId}
                            onChange={(e) => onAccountChange(index, e.target.value)}
                            required={index < 2}
                          >
                            <option value="">{isEn ? 'Select…' : 'Choisir…'}</option>
                            {lineOptions.map((a) => (
                              <option key={a.id} value={a.id} title={a.account_label || a.label}>
                                {accountCode(a)} — {a.account_label || a.label || a.label_en}
                              </option>
                            ))}
                          </select>
                          {acct ? (
                            <span className="jem-lt-account-label" title={acct.account_label || acct.label}>
                              {acct.account_label || acct.label}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="jem-lt-col-narrative">
                      <div className="jem-lt-narrative-wrap">
                        <input
                          name={`memo_${index}`}
                          className="jem-lt-narrative"
                          value={narrativeValue}
                          onChange={(e) => onNarrativeChange(index, e.target.value)}
                          onFocus={() => {
                            cancelSuggestionBlur();
                            if (!(index in narrativeDrafts)) {
                              setNarrativeDrafts((prev) => ({ ...prev, [index]: line.memo || '' }));
                            }
                            if (!line.accountId) setSuggestionLine(index);
                          }}
                          onBlur={() => onNarrativeBlur(index)}
                          placeholder={isEn ? 'Search or describe — e.g. Payroll' : 'Rechercher ou décrire — ex. Paie'}
                          autoComplete="off"
                          spellCheck={false}
                        />
                        {showSuggestions ? (
                          <div className="jem-lt-suggestions" role="listbox">
                            {lineSuggestions.length === 0 ? (
                              <p className="jem-lt-suggestions__empty">{isEn ? 'No matching accounts' : 'Aucun compte'}</p>
                            ) : (
                              lineSuggestions.map((a, si) => (
                                <button
                                  key={a.id}
                                  type="button"
                                  className={`jem-lt-suggestion${si === suggestionHighlight ? ' jem-lt-suggestion--active' : ''}`}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onMouseEnter={() => setSuggestionHighlight(si)}
                                  onClick={() => applyAccountFromSearch(index, a, narrativeValue)}
                                >
                                  <span className="jem-lt-suggestion__code">{accountCode(a)}</span>
                                  <span className="jem-lt-suggestion__label">{a.account_label || a.label}</span>
                                </button>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <select
                        name={`cc_${index}`}
                        className="jem-lt-cc"
                        value={line.costCentre || ''}
                        onChange={(e) =>
                          setLines((prev) => prev.map((ln, i) => (i === index ? { ...ln, costCentre: e.target.value } : ln)))
                        }
                        title={t('journal_form.cost_centre_hint', { defaultValue: 'OHADA analytical axis' })}
                      >
                        <option value="">{isEn ? '— Select —' : '— Choisir —'}</option>
                        {costCenters.map((c) => (
                          <option key={c.id || c.code} value={c.code}>
                            {c.code} — {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="jem-lt-col-amt">
                      <input
                        name={`dr_${index}`}
                        className={`jem-lt-amt${!sideState.debitEnabled ? ' jem-lt-disabled' : ''}`}
                        inputMode="numeric"
                        value={line.debit}
                        placeholder={sideState.debitEnabled ? '0' : ''}
                        disabled={!line.accountId || !sideState.debitEnabled}
                        readOnly={!line.accountId || !sideState.debitEnabled}
                        onChange={(e) => applyLineAmount(index, 'debit', e.target.value)}
                      />
                    </td>
                    <td className="jem-lt-col-amt">
                      <input
                        name={`cr_${index}`}
                        className={`jem-lt-amt${!sideState.creditEnabled ? ' jem-lt-disabled' : ''}`}
                        inputMode="numeric"
                        value={line.credit}
                        placeholder={sideState.creditEnabled ? '0' : ''}
                        disabled={!line.accountId || !sideState.creditEnabled}
                        readOnly={!line.accountId || !sideState.creditEnabled}
                        onChange={(e) => applyLineAmount(index, 'credit', e.target.value)}
                      />
                    </td>
                    <td>
                      <button type="button" className="jem-lt-del" onClick={() => removeLine(index)} title={isEn ? 'Remove line' : 'Supprimer'} disabled={lines.length <= 2}>
                        <FaIcon name="trash" />
                      </button>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <button type="button" className="jem-add-line" onClick={handleAddLine}>
        <FaIcon name="plus" />
        {t('journal_form.add_line', { defaultValue: 'Add line' })}
      </button>
    </div>
  );
}
