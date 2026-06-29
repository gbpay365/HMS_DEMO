import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { SurfaceHero } from '../components/SurfaceHero';
import { formatMoney } from '../lib/hmsLocale';
import { notifyError } from '../lib/notifyBridge';

function formatValidCodeMessage(d, t) {
  if (d.validity_message) return d.validity_message;
  const v = d.validity;
  if (!v) return '';
  const left =
    v.remaining_uses != null
      ? Number(v.remaining_uses)
      : Math.max(0, (Number(v.max_uses) || 1) - (Number(v.uses_so_far) || 0));
  const exp = v.expires_display || v.expires_on || '';
  if (!exp && left == null) return '';
  return t('frontDesk.validate.valid_until', { date: exp || '—', count: left });
}

export function FrontDeskValidatePaymentPageApp({ initialCode = '', flash = null, error = null }) {
  const { t } = useTranslation(['clinical', 'common']);
  const [code, setCode] = useState(String(initialCode || '').toUpperCase());
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState(null);

  const validateCode = async () => {
    const c = code.trim();
    if (!c) return;
    setValidating(true);
    setResult(null);
    try {
      const res = await fetch(`/api/payment/validate?code=${encodeURIComponent(c)}`, { credentials: 'same-origin' });
      const d = await res.json();
      if (!d.ok) {
        notifyError(d.error || t('frontDesk.validate.invalid'));
        setResult({ ok: false, error: d.error || t('frontDesk.validate.invalid') });
        return;
      }
      setResult({
        ok: true,
        patient_id: d.patient_id,
        patient_name: d.patient_name,
        patient_type: d.patient_type,
        department: d.department,
        service: d.service_name || d.service || '',
        doctor_name: d.assigned_doctor_name || '—',
        price: d.price,
        validity_message: formatValidCodeMessage(d, t),
        patient_notice: d.patient_notice || null,
      });
    } catch {
      notifyError(t('common:notify.network_error'), t('common:notify.connection'));
      setResult({ ok: false, error: t('common:notify.network_error') });
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content mx-auto max-w-lg px-4 pb-10 pt-2">
        <FlashMessages flash={flash} error={error} />
        <SurfaceHero
          icon="check-circle"
          title={t('frontDesk.validate.title')}
          subtitle={t('frontDesk.validate.subtitle')}
        >
          <div className="hms-surface-hero-actions mt-4">
            <a href="/portal/hub/front_desk" className="hms-btn-secondary text-xs">
              {t('frontDesk.validate.back_portal')}
            </a>
            <a href="/opd-queue" className="hms-btn-secondary text-xs">
              {t('frontDesk.validate.opd_queue')}
            </a>
          </div>
        </SurfaceHero>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
          <div className="p-6">
            <p className="mb-4 text-sm text-slate-600">{t('clinical:opd.payment_hint')}</p>
            <label className="hms-label" htmlFor="fd-payment-code">
              {t('clinical:opd.payment_code')}
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="fd-payment-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    validateCode();
                  }
                }}
                className="hms-input w-full text-center font-mono text-lg font-bold uppercase tracking-widest"
                placeholder={t('clinical:opd.payment_code_ph')}
                autoFocus
              />
              <button type="button" className="hms-btn-primary shrink-0" disabled={validating} onClick={validateCode}>
                {validating ? '…' : t('clinical:shared.validate')}
              </button>
            </div>
          </div>
        </div>

        {result?.ok ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/60 shadow-card">
            <div className="border-b border-emerald-200 px-5 py-3">
              <h2 className="text-sm font-bold text-emerald-900">{t('frontDesk.validate.valid_title')}</h2>
            </div>
            <div className="space-y-3 p-5 text-sm">
              {result.validity_message ? (
                <div className="rounded-lg border border-emerald-300 bg-white px-3 py-2 font-medium text-emerald-900">
                  {result.validity_message}
                </div>
              ) : null}
              {result.patient_notice ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">{result.patient_notice}</div>
              ) : null}
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('clinical:shared.patient')}</div>
                <div className="font-semibold text-ink">{result.patient_name}</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('clinical:opd.service')}</div>
                  <div className="font-medium text-ink">{result.service || '—'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('clinical:opd.assigned_physician')}</div>
                  <div className="font-medium text-ink">{result.doctor_name}</div>
                </div>
              </div>
              {result.department ? (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('frontDesk.validate.department')}</div>
                  <div className="font-medium text-ink">{result.department}</div>
                </div>
              ) : null}
              {result.price > 0 ? (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('frontDesk.validate.amount_paid')}</div>
                  <div className="font-semibold text-ink">{formatMoney(result.price)}</div>
                </div>
              ) : null}
              <a href="/opd-queue" className="hms-btn-primary mt-2 inline-flex text-xs">
                {t('frontDesk.validate.register_visit')}
              </a>
            </div>
          </div>
        ) : null}

        {result && !result.ok ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{result.error}</div>
        ) : null}
      </div>
    </div>
  );
}
