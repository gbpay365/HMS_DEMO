import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '../lib/hmsLocale';

function formatStat(value, format) {
  if (value == null || value === '') return format === 'money' ? formatMoney(0) : '0';
  if (format === 'money') {
    const n = Number(value);
    return formatMoney(Number.isFinite(n) ? n : 0);
  }
  if (typeof value === 'number') return value.toLocaleString('fr-FR');
  return String(value);
}

const PRIMARY_LINK_CODES = new Set(['dash.link.hms_hub', 'dash.link.reports']);

export function DashboardHero({
  title,
  subtitle,
  badge,
  stats = {},
  heroKpis = null,
  dashboardProfile = 'default',
  t,
  visibleLinks = [],
  showNewPatient = false,
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);

  const defaultKpis = [
    { id: 'patients', label: t('tiles.patients'), value: stats.patients, format: 'number', icon: 'fa-users', tone: 'emerald' },
    { id: 'appointments', label: t('tiles.appointments'), value: stats.appointments, format: 'number', icon: 'fa-calendar-check-o', tone: 'sky' },
    { id: 'inpatients', label: t('tiles.inpatients'), value: stats.inpatients, format: 'number', icon: 'fa-hospital-o', tone: 'violet' },
    { id: 'doctors', label: t('tiles.doctors'), value: stats.doctors, format: 'number', icon: 'fa-user-md', tone: 'amber' },
  ];

  const profileKpis = Array.isArray(heroKpis) && heroKpis.length ? heroKpis : null;
  const kpis = profileKpis || defaultKpis;
  const isProfileGrid = dashboardProfile !== 'default' && profileKpis;

  const primaryLinks = visibleLinks.filter((l) => PRIMARY_LINK_CODES.has(l.code));
  const moreLinks = visibleLinks.filter((l) => !PRIMARY_LINK_CODES.has(l.code));
  const showActions = showNewPatient || primaryLinks.length > 0 || moreLinks.length > 0;

  useEffect(() => {
    if (!moreOpen) return undefined;
    function onDocClick(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    }
    function onEsc(e) {
      if (e.key === 'Escape') setMoreOpen(false);
    }
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [moreOpen]);

  return (
    <section className="hms-dash-hero mb-5" aria-label={title}>
      <div className="hms-dash-hero__backdrop" aria-hidden="true">
        <span className="hms-dash-hero__orb hms-dash-hero__orb--a" />
      </div>

      <div className="hms-dash-hero__inner">
        <div className={`hms-dash-hero__head${isProfileGrid ? ' hms-dash-hero__head--profile' : ''}`}>
          <div className="hms-dash-hero__copy">
            <div className="hms-dash-hero__badge">
              <span className="hms-dash-hero__badge-icon">
                <i className="fa fa-hospital-o" aria-hidden="true" />
              </span>
              <span>{badge}</span>
            </div>
            <h1 className="hms-dash-hero__title">{title}</h1>
            {subtitle ? <p className="hms-dash-hero__subtitle">{subtitle}</p> : null}

            {showActions ? (
              <div className="hms-dash-hero__actions">
                {showNewPatient ? (
                  <a href="/patients?action=new" className="hms-dash-hero__btn hms-dash-hero__btn--primary">
                    <i className="fa fa-user-plus" aria-hidden="true" />
                    {t('new_patient')}
                  </a>
                ) : null}
                {primaryLinks.map((l) => (
                  <a
                    key={l.code}
                    href={l.href}
                    className="hms-dash-hero__btn hms-dash-hero__btn--ghost"
                    {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  >
                    <i className={`fa ${l.icon}`} aria-hidden="true" />
                    {t(l.labelKey)}
                  </a>
                ))}
                {moreLinks.length > 0 ? (
                  <div className="hms-dash-hero__more" ref={moreRef}>
                    <button
                      type="button"
                      className="hms-dash-hero__btn hms-dash-hero__btn--ghost"
                      aria-expanded={moreOpen}
                      aria-haspopup="menu"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMoreOpen((open) => !open);
                      }}
                    >
                      <i className="fa fa-ellipsis-h" aria-hidden="true" />
                      {t('hero_more')}
                    </button>
                    {moreOpen ? (
                      <div className="hms-dash-hero__more-menu" role="menu">
                        {moreLinks.map((l) => (
                          <a
                            key={l.code}
                            href={l.href}
                            className="hms-dash-hero__more-item"
                            role="menuitem"
                            onClick={() => setMoreOpen(false)}
                            {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                          >
                            <i className={`fa ${l.icon}`} aria-hidden="true" />
                            {t(l.labelKey)}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div
            className={`hms-dash-hero__kpi-grid${isProfileGrid ? ' hms-dash-hero__kpi-grid--profile' : ''}`}
            aria-label="Key metrics"
          >
            {kpis.map((kpi) => (
              <div
                key={kpi.id || kpi.label}
                className={`hms-dash-hero__kpi${kpi.tone ? ` hms-dash-hero__kpi--${kpi.tone}` : ''}`}
              >
                <span className="hms-dash-hero__kpi-icon">
                  <i className={`fa ${kpi.icon}`} aria-hidden="true" />
                </span>
                <div className="hms-dash-hero__kpi-body">
                  <span
                    className="hms-dash-hero__kpi-value"
                    style={kpi.color ? { color: kpi.color } : undefined}
                  >
                    {formatStat(kpi.value, kpi.format)}
                  </span>
                  <span className="hms-dash-hero__kpi-label">{kpi.labelKey ? t(kpi.labelKey) : kpi.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
