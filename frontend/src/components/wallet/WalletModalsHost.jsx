import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../Modal';
import { FormField } from '../FormField';
import { parsePageData } from '../../lib/parsePageData';
import { confirmModal } from '../../lib/modalBridge';
import { formatMoney, priceUnitLabel } from '../../lib/hmsLocale';
import { mountWalletModalBridge, registerWalletModalsHost } from '../../lib/walletModalBridge';

const TXN_LABELS = {
  deposit_cash: 'Cash Top-up',
  deposit_gbpay: 'MoMo/GBPay',
  deduct_cashier: 'Cashier Payment',
  refund: 'Refund',
};

function fmtBal(n) {
  return formatMoney(n);
}

function WalletTopupModal({ open, onClose, wallets, initial }) {
  const { t } = useTranslation('legacy');
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState([]);
  const [selected, setSelected] = useState(null);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [focused, setFocused] = useState(false);
  const searchTimer = useRef(null);

  const walletIndex = useMemo(
    () =>
      (wallets || []).map((w) => ({
        wallet_id: w.id,
        patient_id: w.patient_id,
        name: `${w.first_name || ''} ${w.last_name || ''}`.trim(),
        phone: w.phone || '',
        pt_label: w.pt_label || '',
        balance: parseFloat(w.balance || 0) || 0,
        has_wallet: true,
      })),
    [wallets]
  );

  const applyPick = useCallback((p) => {
    if (!p?.wallet_id) {
      setSelected(null);
      return;
    }
    setSelected(p);
    setQuery(p.name + (p.phone ? ` · ${p.phone}` : ''));
  }, []);

  useEffect(() => {
    if (!open) return;
    if (initial?.wallet_id) {
      applyPick({
        wallet_id: initial.wallet_id,
        name: initial.name,
        balance: initial.balance,
        phone: initial.phone,
        pt_label: initial.pt_label,
      });
    } else {
      setQuery('');
      setSelected(null);
      setAmount('');
      setNotes('');
    }
  }, [open, initial, applyPick]);

  const localSearch = useCallback(
    (q) => {
      const q2 = q.trim().toLowerCase();
      if (!q2) return walletIndex.slice(0, 15);
      return walletIndex
        .filter(
          (p) =>
            p.name.toLowerCase().includes(q2) ||
            String(p.phone || '').includes(q) ||
            String(p.patient_id || '').includes(q) ||
            String(p.pt_label || '').toLowerCase().includes(q2)
        )
        .slice(0, 15);
    },
    [walletIndex]
  );

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return walletIndex.slice(0, 12);
    if (remote.length) return remote;
    return localSearch(q);
  }, [query, walletIndex, remote, localSearch]);

  const showDropdown = !selected && (focused || query.trim());

  useEffect(() => {
    if (!open) return undefined;
    const q = query.trim();
    if (!q) {
      setRemote([]);
      return undefined;
    }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetch(`/api/wallet/patients-search?q=${encodeURIComponent(q)}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
        .then((r) => r.json())
        .then((data) => setRemote(data?.ok ? data.results || [] : localSearch(q)))
        .catch(() => setRemote(localSearch(q)));
    }, 280);
    return () => clearTimeout(searchTimer.current);
  }, [query, open, localSearch]);

  async function pickPatient(p) {
    if (!p) return;
    if (p.has_wallet !== false && p.wallet_id) {
      applyPick(p);
      return;
    }
    const ok = await confirmModal({
      title: t('wallet_page.create', { defaultValue: 'Create' }),
      message: `No wallet exists for ${p.name || 'this patient'}.\n\nCreate a wallet now?`,
      confirmLabel: t('wallet_page.create', { defaultValue: 'Create' }),
    });
    if (!ok) return;
    const res = await fetch('/api/wallet/create', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ patient_id: p.patient_id }),
    }).then((r) => r.json());
    if (!res?.ok || !res.result) {
      window.alert(res?.error || 'Could not create wallet.');
      return;
    }
    applyPick(res.result);
  }

  const titleSuffix = selected?.name ? ` — ${selected.name}` : '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <>
          <i className="fa fa-money mr-2" aria-hidden="true" />
          {t('wallet_page.cash_topup', { defaultValue: 'Cash Top-up' })}
          {titleSuffix}
        </>
      }
      footer={
        <>
          <button type="button" className="hms-btn hms-btn-secondary" onClick={onClose}>
            {t('wallet_page.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="submit"
            form="wlt-topup-form"
            className="hms-btn hms-btn-primary font-bold"
            disabled={!selected?.wallet_id}
          >
            <i className="fa fa-upload mr-1" aria-hidden="true" />
            {t('wallet_page.process_topup', { defaultValue: 'Process top-up' })}
          </button>
        </>
      }
    >
      <form id="wlt-topup-form" action="/wallet/topup" method="POST" className="space-y-4">
        <input type="hidden" name="wallet_id" value={selected?.wallet_id || ''} />
        <FormField label={t('wallet_page.select_patient', { defaultValue: 'Select patient' })} required>
          <div className="relative">
            <div className="flex gap-2">
              <input
                type="text"
                className="hms-input w-full"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(null);
                  setRemote([]);
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => {
                  window.setTimeout(() => setFocused(false), 180);
                }}
                placeholder={t('wallet_page.search_patient_ph', { defaultValue: 'Search patient…' })}
                autoComplete="off"
              />
              {selected ? (
                <button
                  type="button"
                  className="hms-btn hms-btn-secondary shrink-0"
                  onClick={() => {
                    setQuery('');
                    setSelected(null);
                    setRemote([]);
                  }}
                  title={t('wallet_page.clear_selection', { defaultValue: 'Clear selection' })}
                >
                  <i className="fa fa-times" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            {showDropdown ? (
              <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                {results.length ? (
                  results.map((p) => (
                    <button
                      key={`${p.patient_id}-${p.wallet_id || 0}`}
                      type="button"
                      className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50"
                      onClick={() => pickPatient(p)}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">
                        {((p.name || '?')[0] || '?').toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-800">{p.name}</div>
                        <div className="truncate text-xs text-slate-500">
                          {p.pt_label}
                          {p.phone ? ` · ${p.phone}` : ''}
                        </div>
                      </div>
                      <div className="text-right text-xs font-bold text-emerald-700">
                        {p.has_wallet !== false && p.wallet_id
                          ? fmtBal(p.balance)
                          : t('wallet_page.no_wallet', { defaultValue: 'No wallet' })}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="p-3 text-center text-sm text-slate-500">
                    {t('wallet_page.no_patients_found', { defaultValue: 'No patients found.' })}
                  </div>
                )}
              </div>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {t('wallet_page.search_patient_hint', {
              defaultValue:
                'Search active patients. If no wallet exists, you will be asked before one is created.',
            })}
          </p>
        </FormField>

        {selected ? (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <span className="text-sm font-semibold text-emerald-800">
              {t('wallet_page.current_balance', { defaultValue: 'Current Balance' })}
            </span>
            <span className="font-bold text-emerald-800">{fmtBal(selected.balance)}</span>
          </div>
        ) : null}

        <p className="text-sm text-slate-500">
          {t('wallet_page.topup_hint', {
            defaultValue:
              'Receive physical cash from the patient and load into their pre-paid wallet. An audit trail is recorded automatically.',
          })}
        </p>

        <FormField label={t('wallet_page.deposit_amount', { defaultValue: 'Deposit Amount' })} required>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.01"
              min="1"
              name="amount"
              className="hms-input w-full"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t('wallet_page.amount_ph', { defaultValue: 'Amount' })}
              required
            />
            <span className="flex items-center rounded-lg bg-slate-100 px-3 text-sm font-bold text-slate-600">
              {priceUnitLabel()}
            </span>
          </div>
        </FormField>

        <FormField label={t('wallet_page.notes', { defaultValue: 'Notes' })}>
          <textarea
            className="hms-input w-full"
            name="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('wallet_page.notes_ph', { defaultValue: 'Optional notes' })}
          />
        </FormField>
      </form>
    </Modal>
  );
}

function WalletTxnModal({ open, onClose, walletId, patientName }) {
  const { t } = useTranslation('legacy');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || !walletId) return;
    setLoading(true);
    setError(false);
    setRows([]);
    fetch(`/api/wallet/${walletId}/transactions`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((data) => {
        if (!data?.ok || !data.txns?.length) {
          setRows([]);
        } else {
          setRows(data.txns);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [open, walletId]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <>
          <i className="fa fa-history mr-2" aria-hidden="true" />
          {t('wallet_page.modal_txn_title', { defaultValue: 'Transactions:' })} {patientName}
        </>
      }
    >
      <div className="max-h-[420px] overflow-y-auto">
        {loading ? (
          <div className="py-8 text-center text-slate-500">
            <i className="fa fa-spin fa-spinner fa-2x text-primary" aria-hidden="true" />
          </div>
        ) : error ? (
          <div className="py-8 text-center text-red-600">
            {t('wallet_page.txn_load_failed', { defaultValue: 'Failed to load transactions.' })}
          </div>
        ) : !rows.length ? (
          <div className="py-8 text-center text-slate-500">
            {t('wallet_page.no_txns', { defaultValue: 'No transactions yet.' })}
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((txn) => {
              const dir = txn.direction === 'cr' ? 'cr' : 'dr';
              const typeLabel = TXN_LABELS[txn.txn_type] || txn.txn_type;
              return (
                <div key={txn.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${
                      dir === 'cr' ? 'bg-emerald-100' : 'bg-red-100'
                    }`}
                  >
                    {dir === 'cr' ? '⬆️' : '⬇️'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-800">{typeLabel}</div>
                    <div className="text-xs text-slate-500">
                      {txn.notes || ''} · {new Date(txn.created_at).toLocaleString()}
                    </div>
                    {txn.staff_name ? (
                      <div className="text-xs text-slate-500">By: {txn.staff_name}</div>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold ${dir === 'cr' ? 'text-emerald-700' : 'text-red-600'}`}>
                      {dir === 'cr' ? '+' : '-'}
                      {formatMoney(txn.amount)}
                    </div>
                    <div className="text-xs text-slate-500">
                      Bal: {Number(txn.balance_after).toLocaleString('fr-FR')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

function WalletQrModal({ open, onClose, token, name }) {
  const { t } = useTranslation('legacy');
  const imgSrc = token
    ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(token)}`
    : '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={
        <>
          <i className="fa fa-qrcode mr-2" aria-hidden="true" />
          {t('wallet_page.modal_qr_title', { defaultValue: 'Wallet QR Code' })}
        </>
      }
    >
      <div className="text-center">
        <div className="mb-3 font-bold text-slate-800">{name}</div>
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={t('wallet_page.qr_alt', { defaultValue: 'QR Code' })}
            className="mx-auto h-[220px] w-[220px] rounded-lg shadow"
          />
        ) : null}
        <p className="mt-3 text-sm text-slate-500">
          {t('wallet_page.qr_scan_hint', {
            defaultValue:
              'Patient scans this code to top-up via MTN MoMo or Orange Money through GBPay.',
          })}
        </p>
        <code className="mt-2 block truncate rounded bg-slate-100 p-2 text-xs">{token}</code>
      </div>
    </Modal>
  );
}

function WalletCreateModal({ open, onClose, pendingCreate, searchQ }) {
  const { t } = useTranslation('legacy');
  const list = pendingCreate || [];
  const plural = list.length !== 1;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      closeOnBackdrop={false}
      title={
        <>
          <i className="fa fa-wallet mr-2" aria-hidden="true" />
          {t('wallet_page.modal_create_title', { defaultValue: 'Create patient wallet?' })}
        </>
      }
      footer={
        <button type="button" className="hms-btn hms-btn-secondary" onClick={onClose}>
          {t('wallet_page.modal_not_now', { defaultValue: 'Not now' })}
        </button>
      }
    >
      <p className="mb-4 text-sm text-slate-500">
        {plural
          ? t('wallet_page.modal_create_body_plural', {
              defaultValue:
                'The following patients were found but do not have a wallet yet. Create one to enable cashless top-ups, or choose Not now to skip.',
            })
          : t('wallet_page.modal_create_body_singular', {
              defaultValue:
                'The following patient was found but does not have a wallet yet. Create one to enable cashless top-ups, or choose Not now to skip.',
            })}
      </p>
      <div className="space-y-2">
        {list.map((p) => (
          <div
            key={p.patient_id}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3"
          >
            <div>
              <div className="font-bold text-slate-800">{p.name}</div>
              <div className="text-sm text-slate-500">
                {p.pt_label}
                {p.phone ? ` · ${p.phone}` : ''}
              </div>
            </div>
            <form method="POST" action="/wallet/create" className="m-0">
              <input type="hidden" name="patient_id" value={p.patient_id} />
              <input type="hidden" name="q" value={searchQ || ''} />
              <button type="submit" className="hms-btn hms-btn-primary text-sm">
                <i className="fa fa-check mr-1" aria-hidden="true" />
                {t('wallet_page.create', { defaultValue: 'Create' })}
              </button>
            </form>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function WalletModalsHost() {
  const pageData = useMemo(() => parsePageData('wlt-page-data') || {}, []);
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupInitial, setTopupInitial] = useState(null);
  const [txnOpen, setTxnOpen] = useState(false);
  const [txnCtx, setTxnCtx] = useState({ walletId: 0, name: '' });
  const [qrOpen, setQrOpen] = useState(false);
  const [qrCtx, setQrCtx] = useState({ token: '', name: '' });
  const [createOpen, setCreateOpen] = useState(false);

  const dismissCreate = useCallback(() => {
    setCreateOpen(false);
    const skipKey = `wltSkipCreate:${pageData.q || ''}`;
    try {
      sessionStorage.setItem(skipKey, '1');
    } catch (_) {
      /* ignore */
    }
  }, [pageData.q]);

  useEffect(() => {
    registerWalletModalsHost({
      openTopup: (p) => {
        setTopupInitial(p || null);
        setTopupOpen(true);
      },
      openQr: ({ token, name }) => {
        setQrCtx({ token: token || '', name: name || '' });
        setQrOpen(true);
      },
      openTxn: ({ walletId, name }) => {
        setTxnCtx({ walletId: walletId || 0, name: name || '' });
        setTxnOpen(true);
      },
      openCreate: () => setCreateOpen(true),
    });
    mountWalletModalBridge();
    return () => registerWalletModalsHost(null);
  }, []);

  useEffect(() => {
    const pending = pageData.pendingCreate || [];
    if (!pending.length || pageData.err) return;
    const skipKey = `wltSkipCreate:${pageData.q || ''}`;
    try {
      if (sessionStorage.getItem(skipKey)) return;
    } catch (_) {
      /* ignore */
    }
    setCreateOpen(true);
  }, [pageData]);

  useEffect(() => {
    const btn = document.getElementById('btnOpenTopupModal');
    if (!btn) return undefined;
    const onClick = () => {
      setTopupInitial(null);
      setTopupOpen(true);
    };
    btn.addEventListener('click', onClick);
    return () => btn.removeEventListener('click', onClick);
  }, []);

  return (
    <>
      <WalletTopupModal
        open={topupOpen}
        onClose={() => {
          setTopupOpen(false);
          setTopupInitial(null);
        }}
        wallets={pageData.wallets}
        initial={topupInitial}
      />
      <WalletTxnModal
        open={txnOpen}
        onClose={() => setTxnOpen(false)}
        walletId={txnCtx.walletId}
        patientName={txnCtx.name}
      />
      <WalletQrModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        token={qrCtx.token}
        name={qrCtx.name}
      />
      <WalletCreateModal
        open={createOpen}
        onClose={dismissCreate}
        pendingCreate={pageData.pendingCreate}
        searchQ={pageData.q}
      />
    </>
  );
}
