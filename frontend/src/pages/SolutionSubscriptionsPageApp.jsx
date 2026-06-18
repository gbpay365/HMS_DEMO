import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { SurfaceHero } from '../components/SurfaceHero';
import { formatDate } from '../lib/listUi';
import { confirmModal } from '../lib/modalBridge';

function SolutionCard({ item, onRequest, onActivate, onDeactivate, busyKey, vendorEmail, cardError }) {
  const { t } = useTranslation('access');
  const [serial, setSerial] = useState('');
  const [email, setEmail] = useState(item.contactEmail || '');
  const [deactivateReason, setDeactivateReason] = useState('');
  const busy = busyKey === item.key;

  const statusBadge = () => {
    if (item.revoked) {
      return (
        <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
          {t('subscriptions.status_revoked')}
        </span>
      );
    }
    if (item.subscribed) {
      return (
        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
          {t('subscriptions.status_active')}
          {item.daysLeft != null ? ` · ${t('subscriptions.days_left', { count: item.daysLeft })}` : ''}
        </span>
      );
    }
    if (item.pending || item.hasPendingRequest) {
      return (
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
          {t('subscriptions.status_pending')}
        </span>
      );
    }
    return (
      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
        {t('subscriptions.status_not_subscribed')}
      </span>
    );
  };

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: item.color || '#64748b' }}
          >
            <i className={`fa ${item.icon || 'fa-cube'}`} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">{item.label}</h3>
            <p className="mt-0.5 text-sm text-slate-500">{item.desc}</p>
          </div>
        </div>
        {statusBadge()}
      </div>

      {item.subscribed && item.expiresAt && (
        <p className="mb-3 text-xs text-slate-500">
          {t('subscriptions.licensed_until', { date: formatDate(item.expiresAt) })}
        </p>
      )}

      {item.revoked && (
        <div className="mt-auto rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
          {item.revokeReason ? <p className="font-semibold">{item.revokeReason}</p> : null}
          {item.revokedAt ? (
            <p className="mt-1 text-red-800">{new Date(item.revokedAt).toLocaleString()}</p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => onRequest(item.key, email)}
            className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-900 hover:bg-red-100"
          >
            {t('subscriptions.request_btn')}
          </button>
        </div>
      )}

      {item.subscribed && !item.revoked && (
        <div className="mt-auto space-y-2 border-t border-slate-100 pt-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('subscriptions.deactivate_reason_label')}
          </label>
          <input
            type="text"
            value={deactivateReason}
            onChange={(e) => setDeactivateReason(e.target.value)}
            placeholder={t('subscriptions.deactivate_reason_ph')}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => onDeactivate(item.key, deactivateReason, item.label)}
            className="w-full rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-60"
          >
            {t('subscriptions.deactivate_btn')}
          </button>
          {cardError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{cardError}</div>
          )}
        </div>
      )}

      {!item.subscribed && !item.revoked && (
        <div className="mt-auto space-y-3 border-t border-slate-100 pt-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('subscriptions.contact_email')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('subscriptions.contact_email_ph')}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRequest(item.key, email)}
            className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {busy ? t('subscriptions.generating') : item.pending ? t('subscriptions.regenerate') : t('subscriptions.request_btn')}
          </button>

          {cardError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{cardError}</div>
          )}

          {(item.pending || item.hasPendingRequest) && (
            <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/70 p-3">
              <p className="text-xs font-semibold text-amber-900">{t('subscriptions.enter_serial')}</p>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={serial}
                  onChange={(e) => setSerial(e.target.value)}
                  placeholder={t('subscriptions.serial_ph')}
                  className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-brand"
                />
                <button
                  type="button"
                  disabled={busy || !serial.trim()}
                  onClick={() => onActivate(item.key, serial)}
                  className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {t('subscriptions.activate')}
                </button>
              </div>
              {vendorEmail && (
                <p className="mt-2 text-xs text-amber-800">
                  {t('subscriptions.send_to')}{' '}
                  <a className="font-semibold underline" href={`mailto:${vendorEmail}`}>
                    {vendorEmail}
                  </a>
                </p>
              )}
            </div>
          )}

          {(item.pending || item.hasPendingRequest) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onDeactivate(item.key, deactivateReason || 'pending_cancelled', item.label)}
              className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-50"
            >
              {t('subscriptions.deactivate_pending_btn')}
            </button>
          )}
        </div>
      )}

      {item.subscribed && item.daysLeft != null && item.daysLeft <= 30 && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-900">{t('subscriptions.expiring_soon')}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRequest(item.key, email)}
            className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            {t('subscriptions.renew')}
          </button>
          {cardError && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{cardError}</div>
          )}
        </div>
      )}
    </div>
  );
}

export function SolutionSubscriptionsPageApp(props) {
  const { t } = useTranslation('access');
  const {
    solutions = [],
    active = [],
    inactive = [],
    pending = [],
    installationId = '',
    facilityName = '',
    defaultContactEmail = '',
    flash = null,
    error = null,
    vendorEmail = '',
    smtpConfigured = false,
    licenseKeysConfigured = true,
    licenseServer = null} = props;

  const codeSectionRef = useRef(null);
  const [busyKey, setBusyKey] = useState('');
  const [lastRequestCode, setLastRequestCode] = useState('');
  const [lastSolution, setLastSolution] = useState('');
  const [pageError, setPageError] = useState(error || null);
  const [pageFlash, setPageFlash] = useState(flash || null);
  const [cardErrors, setCardErrors] = useState({});
  const [emailed, setEmailed] = useState(false);
  const [localInstallationId, setLocalInstallationId] = useState(installationId);
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [revokeConfirm, setRevokeConfirm] = useState('');
  const [revokeReason, setRevokeReason] = useState('');
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [localSolutions, setLocalSolutions] = useState(solutions);
  const [serverStatus, setServerStatus] = useState(licenseServer);

  const solutionLabel = useMemo(() => {
    const hit = localSolutions.find((s) => s.key === lastSolution);
    return hit ? hit.label : lastSolution;
  }, [localSolutions, lastSolution]);

  async function postForm(url, fields) {
    const body = new URLSearchParams(fields);
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest'},
      body});
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || t('subscriptions.request_failed', { status: res.status }));
    }
    return data;
  }

  function markSolutionPending(solutionKey, contactEmail) {
    setLocalSolutions((prev) =>
      prev.map((item) =>
        item.key === solutionKey
          ? {
              ...item,
              status: 'pending',
              pending: true,
              hasPendingRequest: true,
              contactEmail: contactEmail || item.contactEmail}
          : item
      )
    );
  }

  function clearCardError(solutionKey) {
    setCardErrors((prev) => {
      if (!prev[solutionKey]) return prev;
      const next = { ...prev };
      delete next[solutionKey];
      return next;
    });
  }

  async function handleRequest(solutionKey, contactEmail) {
    if (!licenseKeysConfigured) {
      const msg = t('subscriptions.license_keys_missing');
      setCardErrors((prev) => ({ ...prev, [solutionKey]: msg }));
      setPageError(msg);
      return;
    }

    setBusyKey(solutionKey);
    setPageError(null);
    clearCardError(solutionKey);
    try {
      const data = await postForm('/hms-admin/subscriptions/request', {
        solution_key: solutionKey,
        contact_email: contactEmail || defaultContactEmail || ''});
      setLastRequestCode(data.requestCode || '');
      setLastSolution(solutionKey);
      setEmailed(!!data.emailSent);
      markSolutionPending(solutionKey, contactEmail || defaultContactEmail || '');
      const emailMsg = data.emailSent
        ? t('subscriptions.flash_emailed')
        : smtpConfigured && data.vendorEmail
          ? t('subscriptions.flash_email_fail')
          : '';
      setPageFlash(t('subscriptions.flash_generated', { label: getSolutionLabel(localSolutions, solutionKey) }) + emailMsg);
      window.setTimeout(() => {
        codeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      setCardErrors((prev) => ({ ...prev, [solutionKey]: err.message }));
      setPageError(err.message);
    } finally {
      setBusyKey('');
    }
  }

  async function handleActivate(solutionKey, serial) {
    setBusyKey(solutionKey || 'activate');
    setPageError(null);
    clearCardError(solutionKey);
    try {
      const data = await postForm('/hms-admin/subscriptions/activate', { serial });
      setPageFlash(
        t('subscriptions.flash_activated', {
          label: data.label,
          date: formatDate(data.expiresAt)})
      );
      window.location.reload();
    } catch (err) {
      setCardErrors((prev) => ({ ...prev, [solutionKey]: err.message }));
      setPageError(err.message);
    } finally {
      setBusyKey('');
    }
  }

  function copyCode() {
    if (!lastRequestCode) return;
    navigator.clipboard.writeText(lastRequestCode).then(() => {
      setPageFlash(t('subscriptions.copied'));
    });
  }

  async function handleDeactivate(solutionKey, reason, label) {
    const ok = await confirmModal({
      title: t('subscriptions.deactivate_title'),
      message: t('subscriptions.deactivate_confirm', { label: label || solutionKey }),
      confirmLabel: t('subscriptions.deactivate_confirm_btn'),
      tone: 'danger'});
    if (!ok) return;
    setBusyKey(solutionKey);
    setPageError(null);
    clearCardError(solutionKey);
    try {
      await postForm('/hms-admin/subscriptions/deactivate', {
        solution_key: solutionKey,
        reason: reason || 'security_deactivation'});
      window.location.reload();
    } catch (err) {
      setCardErrors((prev) => ({ ...prev, [solutionKey]: err.message }));
      setPageError(err.message || t('subscriptions.deactivate_failed'));
    } finally {
      setBusyKey('');
    }
  }

  async function handleDeactivateAll() {
    if (revokeConfirm.trim().toUpperCase() !== 'REVOKE') {
      setPageError(t('subscriptions.deactivate_all_confirm_label'));
      return;
    }
    const ok = await confirmModal({
      title: t('subscriptions.deactivate_all_title'),
      message: t('subscriptions.deactivate_all_hint'),
      confirmLabel: t('subscriptions.deactivate_all_btn'),
      tone: 'danger'});
    if (!ok) return;
    setRevokeBusy(true);
    setPageError(null);
    try {
      await postForm('/hms-admin/subscriptions/deactivate-all', {
        confirm: 'REVOKE',
        reason: revokeReason || 'security_bulk_deactivation'});
      window.location.reload();
    } catch (err) {
      setPageError(err.message || t('subscriptions.deactivate_all_failed'));
    } finally {
      setRevokeBusy(false);
    }
  }

  async function handleSyncNow() {
    setSyncBusy(true);
    setPageError(null);
    try {
      const data = await postForm('/hms-admin/subscriptions/sync-now', {});
      if (data.licenseServer) setServerStatus(data.licenseServer);
      const note =
        data.commandsApplied > 0
          ? ` (${data.commandsApplied} remote command(s) applied)`
          : '';
      setPageFlash(t('subscriptions.license_server_sync_ok') + note);
      if (data.commandsApplied > 0) {
        window.setTimeout(() => window.location.reload(), 800);
      }
    } catch (err) {
      setPageError(err.message || t('subscriptions.license_server_sync_failed'));
    } finally {
      setSyncBusy(false);
    }
  }

  async function handleResetAll() {
    if (resetConfirm.trim().toUpperCase() !== 'RESET') {
      setPageError(t('subscriptions.reset_confirm_label'));
      return;
    }
    const ok = await confirmModal({
      title: t('subscriptions.reset_title'),
      message: t('subscriptions.reset_section_hint'),
      confirmLabel: t('subscriptions.reset_btn'),
      tone: 'danger'});
    if (!ok) return;
    setResetBusy(true);
    setPageError(null);
    try {
      const data = await postForm('/hms-admin/subscriptions/reset-all', { confirm: 'RESET' });
      setPageFlash(
        t('subscriptions.flash_reset', {
          count: data.removedCount ?? 0,
          id: data.installationId || ''})
      );
      window.location.reload();
    } catch (err) {
      setPageError(err.message || t('subscriptions.reset_failed'));
    } finally {
      setResetBusy(false);
    }
  }

  const activeList = localSolutions.filter((s) => s.subscribed && !s.revoked);
  const pendingList = localSolutions.filter((s) => (s.pending || s.hasPendingRequest) && !s.subscribed && !s.revoked);
  const revokedList = localSolutions.filter((s) => s.revoked);
  const inactiveList = localSolutions.filter((s) => !s.subscribed && !s.pending && !s.revoked);

  return (
    <div className="page-wrapper hms-surface-module min-h-screen font-sans">
      <div className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <FlashMessages flash={pageFlash} error={pageError} />
        {!licenseKeysConfigured && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>{t('subscriptions.setup_required')}</strong> {t('subscriptions.setup_body')}
          </div>
        )}
      </div>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <SurfaceHero icon="key" title={t('subscriptions.title')} subtitle={t('subscriptions.subtitle')}>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a href="/dashboard" className="hms-btn-secondary text-xs">
              {t('subscriptions.back_dashboard')}
            </a>
            <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs text-white/95 backdrop-blur-sm">
              <div>
                <span className="font-semibold">{t('subscriptions.facility')}</span> {facilityName}
              </div>
              <div className="mt-1 font-mono text-[11px] opacity-90">
                {t('subscriptions.installation_id')} {localInstallationId || installationId}
              </div>
            </div>
          </div>
        </SurfaceHero>
        {serverStatus && (
          <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">{t('subscriptions.license_server_title')}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {serverStatus.configured
                    ? t('subscriptions.license_server_configured')
                    : t('subscriptions.license_server_not_configured')}
                </p>
                {serverStatus.configured && (
                  <ul className="mt-2 space-y-1 text-xs text-slate-500">
                    <li className="font-mono">{serverStatus.serverUrl}</li>
                    <li>
                      {serverStatus.registered
                        ? t('subscriptions.license_server_registered')
                        : t('subscriptions.license_server_not_registered')}
                    </li>
                    <li>
                      {serverStatus.pushWebhookConfigured
                        ? t('subscriptions.license_server_push_ok', { url: serverStatus.pushWebhookUrl })
                        : t('subscriptions.license_server_push_missing')}
                    </li>
                    <li>
                      {serverStatus.lastSync
                        ? t('subscriptions.license_server_last_sync', {
                            date: new Date(serverStatus.lastSync).toLocaleString()})
                        : t('subscriptions.license_server_never_synced')}
                    </li>
                  </ul>
                )}
              </div>
              {serverStatus.configured && (
                <button
                  type="button"
                  disabled={syncBusy}
                  onClick={handleSyncNow}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                >
                  {syncBusy ? t('subscriptions.license_server_sync_busy') : t('subscriptions.license_server_sync_btn')}
                </button>
              )}
            </div>
          </section>
        )}

        {lastRequestCode && (
          <section ref={codeSectionRef} className="mb-6 rounded-2xl border border-brand/20 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  {solutionLabel
                    ? t('subscriptions.request_code_for', { label: solutionLabel })
                    : t('subscriptions.request_code')}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {t('subscriptions.copy_hint')}
                  {emailed && (
                    <span className="mt-1 block font-semibold text-emerald-700">
                      {t('subscriptions.emailed', { email: vendorEmail ? ` (${vendorEmail})` : '' })}
                    </span>
                  )}
                  {!emailed && smtpConfigured && vendorEmail && (
                    <span className="mt-1 block text-amber-700">{t('subscriptions.email_failed')}</span>
                  )}
                  {!smtpConfigured && vendorEmail && (
                    <span className="mt-1 block text-slate-500">
                      {t('subscriptions.smtp_manual')}{' '}
                      <a className="font-semibold text-brand underline" href={`mailto:${vendorEmail}`}>
                        {vendorEmail}
                      </a>
                      .
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={copyCode}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                {t('subscriptions.copy_code')}
              </button>
            </div>
            <textarea
              readOnly
              value={lastRequestCode}
              rows={3}
              className="mt-3 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800"
            />
          </section>
        )}

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-emerald-700">
            {t('subscriptions.subscribed', { count: activeList.length })}
          </h2>
          {activeList.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
              {t('subscriptions.no_active')}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {activeList.map((item) => (
                <SolutionCard
                  key={item.key}
                  item={item}
                  onRequest={handleRequest}
                  onActivate={handleActivate}
                  onDeactivate={handleDeactivate}
                  busyKey={busyKey}
                  vendorEmail={vendorEmail}
                  cardError={cardErrors[item.key]}
                />
              ))}
            </div>
          )}
        </section>

        {pendingList.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-amber-700">
              {t('subscriptions.pending', { count: pendingList.length })}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pendingList.map((item) => (
                <SolutionCard
                  key={item.key}
                  item={item}
                  onRequest={handleRequest}
                  onActivate={handleActivate}
                  onDeactivate={handleDeactivate}
                  busyKey={busyKey}
                  vendorEmail={vendorEmail}
                  cardError={cardErrors[item.key]}
                />
              ))}
            </div>
          </section>
        )}

        {revokedList.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-red-700">
              {t('subscriptions.revoked_section', { count: revokedList.length })}
            </h2>
            <p className="mb-3 text-sm text-slate-600">{t('subscriptions.revoked_hint')}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {revokedList.map((item) => (
                <SolutionCard
                  key={item.key}
                  item={item}
                  onRequest={handleRequest}
                  onActivate={handleActivate}
                  onDeactivate={handleDeactivate}
                  busyKey={busyKey}
                  vendorEmail={vendorEmail}
                  cardError={cardErrors[item.key]}
                />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-600">
            {t('subscriptions.available', { count: inactiveList.length })}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inactiveList.map((item) => (
              <SolutionCard
                key={item.key}
                item={item}
                onRequest={handleRequest}
                onActivate={handleActivate}
                busyKey={busyKey}
                vendorEmail={vendorEmail}
                cardError={cardErrors[item.key]}
              />
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-red-200 bg-red-50/80 p-5">
          <h2 className="text-sm font-bold text-red-900">{t('subscriptions.emergency_title')}</h2>

          <div className="mt-5 max-w-3xl">
            <p className="text-sm text-red-950">{t('subscriptions.deactivate_all_hint')}</p>
            <div className="mt-3 flex max-w-md flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-red-800">
                  {t('subscriptions.deactivate_reason_label')}
                </label>
                <input
                  type="text"
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder={t('subscriptions.deactivate_reason_ph')}
                  className="mb-2 w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-500"
                />
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-red-800">
                  {t('subscriptions.deactivate_all_confirm_label')}
                </label>
                <input
                  type="text"
                  value={revokeConfirm}
                  onChange={(e) => setRevokeConfirm(e.target.value)}
                  placeholder="REVOKE"
                  className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200"
                  autoComplete="off"
                />
              </div>
              <button
                type="button"
                disabled={revokeBusy || revokeConfirm.trim().toUpperCase() !== 'REVOKE'}
                onClick={handleDeactivateAll}
                className="rounded-lg bg-red-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-900 disabled:opacity-50"
              >
                {revokeBusy ? t('subscriptions.reset_busy') : t('subscriptions.deactivate_all_btn')}
              </button>
            </div>
          </div>

          <div className="mt-8 border-t border-red-200 pt-5">
            <h3 className="text-sm font-bold text-red-900">{t('subscriptions.reset_section_title')}</h3>
            <p className="mt-2 max-w-3xl text-sm text-red-950">{t('subscriptions.reset_section_hint')}</p>
            <div className="mt-4 flex max-w-md flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-red-800">
                {t('subscriptions.reset_confirm_label')}
              </label>
              <input
                type="text"
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
                placeholder={t('subscriptions.reset_confirm_ph')}
                className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200"
                autoComplete="off"
              />
            </div>
            <button
              type="button"
              disabled={resetBusy || resetConfirm.trim().toUpperCase() !== 'RESET'}
              onClick={handleResetAll}
              className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
            >
              {resetBusy ? t('subscriptions.reset_busy') : t('subscriptions.reset_btn')}
            </button>
          </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function getSolutionLabel(solutions, key) {
  const hit = solutions.find((s) => s.key === key);
  return hit ? hit.label : key;
}
