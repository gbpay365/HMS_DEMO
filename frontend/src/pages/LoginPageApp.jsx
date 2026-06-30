import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateFlashText } from '../lib/flashI18nClient';

function LoginSpinner() {
  return <span className="login-submit__spinner" aria-hidden="true" />;
}

export function LoginPageApp({ error = null, msg = null, brand = {}, loginLabels = null }) {
  const { t } = useTranslation('login');
  const { t: tFlash } = useTranslation(['errors', 'common']);
  const labels = loginLabels && typeof loginLabels === 'object' ? loginLabels : {};
  const tx = (key) => (labels[key] != null && labels[key] !== '' ? labels[key] : t(key));
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const b = brand || {};
  const mark = b.markPath || '/img/zaizens-mark.svg';
  const name = b.name || 'ZAIZENS';
  const subtitle = tx('default_subtitle');
  const copyright = String(labels.copyright_line || t('copyright_line')).replace(
    '{{year}}',
    String(b.copyrightYear || new Date().getFullYear())
  );
  const displayError =
    error === 'Invalid username or password.' || error === 'Nom d\'utilisateur ou mot de passe incorrect.'
      ? tx('invalid_credentials')
      : translateFlashText(error, tFlash);
  const displayMsg = translateFlashText(msg, tFlash);

  return (
    <>
      <main className="login-shell">
        <div className="login-card login-card--surface">
          <div className="login-card__hero" aria-hidden="true" />
          <div className="login-card__body">
            <header className="login-brand">
              <div className="login-brand__mark" aria-hidden="true">
                <div className="login-brand__icon hms-brand-mark hms-brand-mark--lg">
                  <img src={mark} alt="" />
                </div>
              </div>
              <h1 className="login-brand__name">{name}</h1>
              <p className="login-brand__tagline">{subtitle}</p>
            </header>

            {displayMsg ? (
              <div className="login-alert login-alert--info" role="status">
                <i className="fa fa-info-circle" aria-hidden="true" />
                <span>{displayMsg}</span>
              </div>
            ) : null}
            {displayError ? (
              <div className="login-alert login-alert--error" role="alert">
                <i className="fa fa-exclamation-circle" aria-hidden="true" />
                <span>{displayError}</span>
              </div>
            ) : null}

            <form
              id="loginForm"
              className="login-form"
              action="/login"
              method="POST"
              autoComplete="on"
              onSubmit={() => setLoading(true)}
            >
              <div className="login-field">
                <label htmlFor="username">{tx('username')}</label>
                <div className="login-input-wrap">
                  <span className="login-input__icon" aria-hidden="true">
                    <i className="fa fa-user" />
                  </span>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    autoFocus
                    autoComplete="username"
                    placeholder={tx('username_placeholder')}
                    className="login-input"
                  />
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="password">{tx('password')}</label>
                <div className="login-input-wrap login-input-wrap--pw">
                  <span className="login-input__icon" aria-hidden="true">
                    <i className="fa fa-lock" />
                  </span>
                  <input
                    id="password"
                    name="password"
                    type={showPw ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder={tx('password_placeholder')}
                    className="login-input"
                  />
                  <button
                    type="button"
                    className="login-toggle-pw"
                    aria-label={showPw ? tx('hide_password') : tx('show_password')}
                    aria-pressed={showPw}
                    onClick={() => setShowPw((v) => !v)}
                  >
                    <i className={`fa ${showPw ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <button type="submit" className={`login-submit${loading ? ' is-loading' : ''}`} disabled={loading}>
                {loading ? (
                  <>
                    <LoginSpinner />
                    {tx('signing_in')}
                  </>
                ) : (
                  tx('sign_in')
                )}
              </button>
            </form>

            <footer className="login-meta">
              <p>
                <a href="/visiting-doctor" className="login-meta__link">
                  {tx('visiting_doctor_link')}
                </a>
              </p>
              <p>
                {tx('portal_prompt')}{' '}
                <a href="/portal/login" className="login-meta__link">
                  {tx('portal_link')}
                </a>
              </p>
              <p className="login-meta__note">{tx('authorized_only')}</p>
            </footer>
          </div>
        </div>
      </main>
      <p className="login-page__foot">{copyright}</p>
    </>
  );
}
