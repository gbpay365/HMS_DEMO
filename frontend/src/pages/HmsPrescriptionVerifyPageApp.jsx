import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SurfaceHero } from '../components/SurfaceHero';

function extractToken(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  const match = value.match(/\/verify\/rx\/([^/?#]+)/i);
  return match ? match[1] : value;
}

export function HmsPrescriptionVerifyPageApp() {
  const { t } = useTranslation('legacy');
  const [token, setToken] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    const parsed = extractToken(token);
    if (parsed) window.location.assign(`/verify/rx/${encodeURIComponent(parsed)}`);
  }

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-10 pt-2 sm:px-6">
        <SurfaceHero
          icon="qrcode"
          title={t('hms_prescription_verify.title')}
          subtitle={t('hms_prescription_verify.hint')}
        >
          <div className="hms-surface-hero-actions mt-4">
            <a href="/settings" className="hms-btn-secondary text-xs">
              <i className="fa fa-sliders" aria-hidden="true" />
              {t('hms_prescription_verify.back_settings')}
            </a>
          </div>
        </SurfaceHero>

        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-xl rounded-2xl border border-slate-100 bg-white p-6 shadow-card"
        >
          <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
            <i className="fa fa-link mr-1 text-brand" aria-hidden="true" />
            {t('hms_prescription_verify.token_ph')}
          </label>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={t('hms_prescription_verify.token_ph')}
            className="hms-input mb-4 w-full"
            autoComplete="off"
            autoFocus
          />
          <button type="submit" className="hms-btn-primary w-full py-3 text-sm font-bold" disabled={!token.trim()}>
            <i className="fa fa-check-circle mr-2" aria-hidden="true" />
            {t('hms_prescription_verify.verify')}
          </button>
        </form>
      </div>
    </div>
  );
}
