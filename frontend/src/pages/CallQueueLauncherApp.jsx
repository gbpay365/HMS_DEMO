import { useTranslation } from 'react-i18next';

function LauncherTile({ href, icon, label, sublabel, primary = false }) {
  return (
    <a href={href} className={`cq-launcher__tile${primary ? ' cq-launcher__tile--primary' : ''}`}>
      <i className={`fa ${icon} cq-launcher__tile-icon`} aria-hidden="true" />
      <div>{label}</div>
      {sublabel ? <div className="cq-launcher__tile-sub">{sublabel}</div> : null}
    </a>
  );
}

export function CallQueueLauncherApp({ launcher = {} }) {
  const { t } = useTranslation('clinical');
  const presets = launcher.presets || [];
  const rooms = launcher.rooms || [];
  const doctors = launcher.doctors || [];

  return (
    <div className="cq-launcher">
      <header className="cq-launcher__header">
        <h1 className="cq-launcher__title">{t('callQueue.launcher_title')}</h1>
        <p className="cq-launcher__subtitle">{t('callQueue.launcher_subtitle')}</p>
      </header>

      <main className="cq-launcher__main">
        <section className="mb-8">
          <h2 className="cq-launcher__section-title">{t('callQueue.launcher_presets')}</h2>
          <div className="cq-launcher__grid cq-launcher__grid--presets">
            {presets.map((p) => (
              <LauncherTile
                key={p.key}
                href={p.href}
                icon="fa-television"
                primary
                label={p.key === 'simple' ? t('callQueue.waiting_title') : t('callQueue.default_title')}
              />
            ))}
          </div>
        </section>

        {rooms.length ? (
          <section className="mb-8">
            <h2 className="cq-launcher__section-title">{t('callQueue.launcher_rooms')}</h2>
            <div className="cq-launcher__grid cq-launcher__grid--rooms">
              {rooms.map((r) => (
                <LauncherTile key={r.id} href={r.href} icon="fa-door-open" label={r.label} />
              ))}
            </div>
          </section>
        ) : null}

        {doctors.length ? (
          <section>
            <h2 className="cq-launcher__section-title">{t('callQueue.launcher_doctors')}</h2>
            <div className="cq-launcher__grid cq-launcher__grid--doctors">
              {doctors.map((d) => (
                <LauncherTile
                  key={d.id}
                  href={d.href}
                  icon="fa-user-md"
                  label={d.name}
                  sublabel={d.room_label || undefined}
                />
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <footer className="cq-launcher__footer">{t('callQueue.launcher_footer')}</footer>
    </div>
  );
}
