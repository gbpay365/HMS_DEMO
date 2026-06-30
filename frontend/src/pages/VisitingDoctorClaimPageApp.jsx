import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { notifyAlert } from '../lib/notifyBridge';

function statusLabel(account, t) {
  if (!account.inUse) return t('available');
  if (account.setupInProgress) return t('setup_in_progress');
  return t('in_use');
}

export function VisitingDoctorClaimPageApp({ flash = null, error = null, brand = {} }) {
  const { t } = useTranslation('visitingDoctor');
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [password, setPassword] = useState('12345');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/visiting-doctor/accounts', { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.ok) setAccounts(data.accounts || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const b = brand || {};
  const mark = b.markPath || '/img/zaizens-mark.svg';

  const onPick = (account) => {
    if (!account.available) {
      const by = account.doctorName ? ` ${t('occupied_by', { name: account.doctorName })}` : '';
      const until = account.visitEndDate ? ` ${t('until', { date: account.visitEndDate })}` : '';
      notifyAlert({
        title: t('account_unavailable_title'),
        message: t('in_use_alert', { username: account.username, by, until }),
        type: 'warning'});
      return;
    }
    setSelected(account);
    setPassword('12345');
  };

  const grid = useMemo(() => accounts, [accounts]);

  return (
    <main className="login-shell login-shell--wide">
      <div className="login-card login-card--surface">
        <div className="login-card__hero" aria-hidden="true" />
        <div className="login-card__body">
        <header className="login-brand">
          <div className="login-brand__mark" aria-hidden="true">
            <div className="login-brand__icon hms-brand-mark hms-brand-mark--lg">
              <img src={mark} alt="" />
            </div>
          </div>
          <h1 className="login-brand__name">{t('title')}</h1>
          <p className="login-brand__tagline">{t('subtitle')}</p>
          <p className="login-meta__note" style={{ marginTop: 8 }}>{t('default_password_hint')}</p>
        </header>

        {flash ? (
          <div className="login-alert login-alert--info" role="status">
            <i className="fa fa-info-circle" aria-hidden="true" />
            <span>{flash}</span>
          </div>
        ) : null}
        {error ? (
          <div className="login-alert login-alert--error" role="alert">
            <i className="fa fa-exclamation-circle" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {!selected ? (
          <>
            {loading ? (
              <p className="text-center text-muted small py-4">{t('loading_accounts')}</p>
            ) : (
              <div className="vd-account-grid">
                {grid.map((acc) => (
                  <button
                    key={acc.username}
                    type="button"
                    onClick={() => onPick(acc)}
                    className={`vd-account-btn ${acc.available ? 'vd-account-btn--available' : 'vd-account-btn--busy'}`}
                  >
                    <div>{acc.username}</div>
                    <div className="vd-account-btn__status">{statusLabel(acc, t)}</div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <form method="post" action="/visiting-doctor/login" onSubmit={() => setSubmitting(true)}>
            <input type="hidden" name="username" value={selected.username} />
            <h2 className="login-vd-title">{t('login_title', { username: selected.username })}</h2>
            <div className="login-field">
              <label htmlFor="vd-password">{t('password')}</label>
              <div className="login-input-wrap login-input-wrap--pw">
                <span className="login-input__icon" aria-hidden="true">
                  <i className="fa fa-lock" />
                </span>
                <input
                  id="vd-password"
                  name="password"
                  type="password"
                  required
                  className="login-input"
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                  placeholder={t('password_placeholder')}
                />
              </div>
            </div>
            <div className="login-vd-actions">
              <button type="submit" className={`login-submit${submitting ? ' is-loading' : ''}`} disabled={submitting}>
                {t('sign_in')}
              </button>
              <button type="button" className="login-submit login-submit--muted" onClick={() => setSelected(null)}>
                {t('cancel')}
              </button>
            </div>
          </form>
        )}

        <footer className="login-meta">
          <p>
            <a href="/" className="login-meta__link">
              {t('staff_login')}
            </a>
          </p>
          <p className="login-meta__note">{name}</p>
        </footer>
        </div>
      </div>
    </main>
  );
}
