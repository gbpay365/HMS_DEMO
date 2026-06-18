import { useTranslation } from 'react-i18next';
import { PrintToolbar } from '../../components/PrintToolbar';
import '../../styles/passport-booklet.css';

const TYPE_SHORT = {
  consultation: 'Consult',
  admission: 'Admit',
  discharge: 'Disch',
  laboratory: 'Lab',
  radiology: 'Rad',
  prescription: 'Rx',
  vitals: 'Vitals'};

function fmtShort(value, locale) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      year: '2-digit'});
  } catch {
    return String(value);
  }
}

function fmtDt(value, locale) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'});
  } catch {
    return String(value);
  }
}

function fmtDate(value, locale) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'});
  } catch {
    return String(value);
  }
}

function clip(text, max = 120) {
  const s = String(text || '').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function BookletBlock({ icon, title, subtitle, children }) {
  return (
    <section className="booklet-block">
      <h2 className="booklet-block-title">
        <i className={`fa ${icon}`} aria-hidden="true" />
        {title}
      </h2>
      {subtitle ? <p className="booklet-block-sub">{subtitle}</p> : null}
      {children}
    </section>
  );
}

function DenseField({ icon, label, value }) {
  if (value == null || value === '' || value === '—') return null;
  return (
    <div className="booklet-field">
      <i className={`fa ${icon}`} aria-hidden="true" />
      <span className="booklet-field-label">{label}</span>
      <span className="booklet-field-value">{value}</span>
    </div>
  );
}

function SummaryTable({ columns, rows, emptyLabel }) {
  if (!rows.length) return <p className="booklet-empty">{emptyLabel}</p>;
  return (
    <table className="booklet-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} className={c.className}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            {columns.map((c) => (
              <td key={c.key} className={c.className}>
                {row[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PrintMedicalPassportApp({
  patient = {},
  allergies = [],
  chronicMedications = [],
  insurance = null,
  timeline = [],
  diagnosisSummary = [],
  prescriptionSummary = [],
  treatmentSummary = [],
  meta = {},
  pdfUrl = '',
  backUrl = '/patients'}) {
  const { t, i18n } = useTranslation('print');
  const locale = meta.locale || i18n.language || 'en';
  const sourceLabel = (source) => {
    const slug = String(source || '').toLowerCase().replace(/\s+/g, '_');
    const key = `passport.source_${slug}`;
    const tr = t(key);
    return tr === key ? source || '—' : tr;
  };
  const typeLabel = (type) => {
    const key = `passport.type_${type}`;
    const tr = t(key);
    return tr === key ? TYPE_SHORT[type] || type : tr;
  };
  const fullName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim();

  const summaryCols = [
    { key: 'date', label: t('passport.col_date'), className: 'col-date' },
    { key: 'source', label: t('passport.col_source'), className: 'col-src' },
    { key: 'title', label: t('passport.col_item'), className: 'col-title' },
    { key: 'detail', label: t('passport.col_detail'), className: 'col-detail' },
  ];

  const dxRows = diagnosisSummary.map((item) => ({
    id: item.id,
    date: fmtShort(item.date, locale),
    source: sourceLabel(item.source),
    title: item.title,
    detail: clip([item.context, item.provider, item.detail].filter(Boolean).join(' · '))}));

  const rxRows = prescriptionSummary.map((item) => ({
    id: item.id,
    date: fmtShort(item.date, locale),
    source: sourceLabel(item.source),
    title: item.title,
    detail: clip([item.provider, item.detail].filter(Boolean).join(' · '), 120)}));

  const txRows = treatmentSummary.map((item) => ({
    id: item.id,
    date: fmtShort(item.date, locale),
    source: sourceLabel(item.source),
    title: item.title,
    detail: clip([item.status, item.provider, item.detail].filter(Boolean).join(' · '), 120)}));

  const timelineCols = [
    { key: 'date', label: t('passport.col_date'), className: 'col-date' },
    { key: 'type', label: t('passport.col_type'), className: 'col-type' },
    { key: 'title', label: t('passport.col_item'), className: 'col-title' },
    { key: 'detail', label: t('passport.col_detail'), className: 'col-detail' },
  ];

  const timelineRows = timeline.map((ev) => ({
    id: ev.id,
    date: fmtShort(ev.date, locale),
    type: typeLabel(ev.type),
    title: ev.title,
    detail: clip([ev.subtitle, ev.provider, ev.detail].filter(Boolean).join(' · '), 120)}));

  return (
    <div className="passport-booklet passport-booklet-screen min-h-screen text-slate-900 print:bg-white">
      <PrintToolbar
        backHref={backUrl}
        backLabel={t('passport.back_chart')}
        extra={
          pdfUrl ? (
            <a href={pdfUrl} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700">
              <i className="fa fa-download mr-1" aria-hidden="true" />
              {t('passport.download_pdf')}
            </a>
          ) : null
        }
      />

      <p className="booklet-print-hint print:hidden">
        <i className="fa fa-info-circle mr-1" aria-hidden="true" />
        {t('passport.booklet_print_hint')}
      </p>

      <article className="booklet-flow">
        {/* Compact cover — own page only when printing */}
        <header className="booklet-cover">
          {meta.letterhead ? <img src={meta.letterhead} alt="" className="booklet-cover-logo" /> : null}
          <span className="booklet-cover-badge">
            <i className="fa fa-book mr-1" aria-hidden="true" />
            {t('passport.badge')}
          </span>
          <h1 className="booklet-cover-title">{t('passport.title')}</h1>
          <div className="booklet-cover-name">{fullName || '—'}</div>
          <dl className="booklet-cover-meta">
            <div>
              <dt>{t('passport.patient_id')}</dt>
              <dd>{patient.patient_code}</dd>
            </div>
            <div>
              <dt>{t('passport.id_label')}</dt>
              <dd>{meta.passport_id}</dd>
            </div>
            <div>
              <dt>{t('passport.issued')}</dt>
              <dd>{fmtDt(meta.issued_at, locale)}</dd>
            </div>
            <div>
              <dt>{t('passport.dob')}</dt>
              <dd>{fmtDate(patient.date_of_birth, locale)}</dd>
            </div>
          </dl>
          <div className="booklet-cover-foot">
            <i className="fa fa-hospital-o mr-1" aria-hidden="true" />
            {meta.facility_name}
          </div>
        </header>

        {/* All sections flow continuously — no forced page breaks */}
        <BookletBlock icon="fa-user" title={t('passport.patient_identity')}>
          <div className="booklet-dense-grid">
            <DenseField icon="fa-id-card-o" label={t('passport.patient_id')} value={patient.patient_code} />
            <DenseField icon="fa-calendar" label={t('passport.dob')} value={fmtDate(patient.date_of_birth, locale)} />
            <DenseField icon="fa-venus-mars" label={t('passport.gender')} value={patient.gender} />
            <DenseField icon="fa-birthday-cake" label={t('passport.age_label')} value={t('passport.age', { n: patient.age_years ?? '—' })} />
            <DenseField icon="fa-tint" label={t('passport.blood')} value={patient.blood_group} />
            <DenseField icon="fa-phone" label={t('passport.phone')} value={patient.phone} />
            <DenseField icon="fa-map-marker" label={t('passport.address')} value={patient.address} />
            <DenseField icon="fa-shield" label={t('passport.insurance')} value={insurance ? `${insurance.carrier}${insurance.policy ? ` · ${insurance.policy}` : ''}` : null} />
          </div>
          <div className="booklet-mini-block">
            <h3>{t('passport.emergency_coverage')}</h3>
            {patient.next_of_kin_name ? (
              <div className="booklet-dense-grid">
                <DenseField icon="fa-user" label={t('passport.emergency_contact')} value={patient.next_of_kin_name} />
                <DenseField icon="fa-phone-square" label={t('passport.emergency_phone')} value={patient.next_of_kin_phone} />
              </div>
            ) : (
              <p className="booklet-empty">{t('passport.no_emergency')}</p>
            )}
          </div>
          <div className="booklet-dense-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="booklet-mini-block">
              <h3>{t('passport.allergies')}</h3>
              {allergies.length ? (
                <ul className="booklet-bullets">
                  {allergies.map((a, i) => (
                    <li key={i}>
                      <strong>{a.substance}</strong>
                      {a.severity ? ` [${a.severity}]` : ''}
                      {a.reaction ? ` — ${a.reaction}` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="booklet-empty">{t('passport.none_recorded')}</p>
              )}
            </div>
            <div className="booklet-mini-block">
              <h3>{t('passport.chronic_meds')}</h3>
              {chronicMedications.length ? (
                <ul className="booklet-bullets">
                  {chronicMedications.map((m, i) => (
                    <li key={i}>
                      <strong>{m.name}</strong>
                      {m.dosage ? ` — ${m.dosage}` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="booklet-empty">{t('passport.none_recorded')}</p>
              )}
            </div>
          </div>
        </BookletBlock>

        {(dxRows.length > 0 || rxRows.length > 0 || txRows.length > 0) ? (
          <BookletBlock icon="fa-file-text-o" title={t('passport.clinical_summaries')} subtitle={t('passport.clinical_summaries_sub')}>
            {dxRows.length > 0 ? (
              <>
                <h3 className="booklet-sub-table">{t('passport.diagnosis_summary')}</h3>
                <SummaryTable columns={summaryCols} rows={dxRows} emptyLabel={t('passport.no_diagnosis')} />
              </>
            ) : null}
            {rxRows.length > 0 ? (
              <>
                <h3 className="booklet-sub-table">{t('passport.prescription_summary')}</h3>
                <SummaryTable columns={summaryCols} rows={rxRows} emptyLabel={t('passport.no_prescriptions')} />
              </>
            ) : null}
            {txRows.length > 0 ? (
              <>
                <h3 className="booklet-sub-table">{t('passport.treatment_summary')}</h3>
                <SummaryTable columns={summaryCols} rows={txRows} emptyLabel={t('passport.no_treatments')} />
              </>
            ) : null}
          </BookletBlock>
        ) : null}

        {timelineRows.length > 0 ? (
          <BookletBlock icon="fa-history" title={t('passport.timeline_title')} subtitle={t('passport.timeline_subtitle')}>
            <SummaryTable columns={timelineCols} rows={timelineRows} emptyLabel={t('passport.no_events')} />
          </BookletBlock>
        ) : null}

        <footer className="booklet-footer">
          <div className="booklet-disclaimer">
            <strong>{t('passport.disclaimer_title')}</strong> {t('passport.disclaimer_body', { facility: meta.facility_name })}
          </div>
          <p className="booklet-empty" style={{ fontStyle: 'normal', marginBottom: '2mm' }}>
            {t('passport.booklet_handover')}
          </p>
          <div className="booklet-back-foot">
            <span>{meta.issued_by_label}</span>
            <span>{meta.passport_id}</span>
            <span>{fmtDt(meta.issued_at, locale)}</span>
          </div>
        </footer>
      </article>
    </div>
  );
}
