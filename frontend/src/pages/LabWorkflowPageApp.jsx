import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { StatusBadge } from '../components/StatusBadge';

const THEMES = {
  laboratory: { color: '#7c3aed', icon: '🧪', prefix: 'LAB', deptKey: 'dept_laboratory' },
  radiology: { color: '#0891b2', icon: '🩻', prefix: 'RAD', deptKey: 'dept_radiology' },
  pharmacy: { color: '#16a34a', icon: '💊', prefix: 'PHA', deptKey: 'dept_pharmacy' }};

function deptLabel(t, kind) {
  const theme = THEMES[kind] || THEMES.laboratory;
  return t(`labWorkflow.${theme.deptKey}`);
}

function ValidateEntryView({ kind = 'laboratory', code = '', error = null, flash = null }) {
  const { t } = useTranslation('clinical');
  const theme = THEMES[kind] || THEMES.laboratory;
  const dept = deptLabel(t, kind);
  const base = kind === 'laboratory' ? '/laboratory' : kind === 'radiology' ? '/radiology' : '/pharmacy';
  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content mx-auto max-w-lg px-4 pb-10 pt-2">
        <FlashMessages flash={flash} error={error} />
        <SurfaceHero icon={deptIcon(kind)} badge={theme.icon} title={t('labWorkflow.validate_title', { dept })} subtitle={t('labWorkflow.validate_subtitle')}>
          <div className="hms-surface-hero-actions mt-4">
            <a href={base} className="hms-btn-secondary text-xs">
              {t('labWorkflow.back_to_dept', { dept })}
            </a>
          </div>
        </SurfaceHero>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
          <form method="GET" action={`${base}/validate`} className="p-6">
            <input
              name="code"
              className="hms-input mb-3 w-full text-center font-mono text-lg font-bold uppercase tracking-widest"
              placeholder={`${theme.prefix}-…`}
              defaultValue={code}
              autoFocus
              required
            />
            <button type="submit" className="hms-btn hms-btn-primary w-full">
              <i className="fa fa-search" aria-hidden="true" />
              {t('labWorkflow.open_order')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function deptIcon(kind) {
  if (kind === 'radiology') return 'film';
  if (kind === 'pharmacy') return 'medkit';
  return 'flask';
}

function deptBase(kind) {
  if (kind === 'laboratory') return '/laboratory';
  if (kind === 'radiology') return '/radiology';
  return '/pharmacy';
}

function ValidateDetailShell({ kind, code, patient, doctor, flash, error, children, stats = [] }) {
  const { t } = useTranslation('clinical');
  const dept = deptLabel(t, kind);
  const base = deptBase(kind);

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content mx-auto max-w-4xl px-4 pb-10 pt-2">
        <FlashMessages flash={flash} error={error} />
        <a href={`${base}/validate`} className="mb-4 inline-block text-sm font-bold text-slate-600">
          {t('labWorkflow.validate_another')}
        </a>
        <SurfaceHero icon={deptIcon(kind)} title={dept} subtitle={t('labWorkflow.validate_order_code', { code })}>
          <div className="hms-surface-hero-chips mt-3">
            <span className="hms-icon-chip font-mono uppercase tracking-wider">{code}</span>
          </div>
          <div className="hms-surface-hero-actions mt-4">
            <a href={base} className="hms-btn-secondary text-xs">
              {t('labWorkflow.back_to_dept', { dept })}
            </a>
          </div>
        </SurfaceHero>
        {stats.length ? (
          <div className={`mb-4 grid gap-3 ${stats.length > 2 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {stats.map((s) => (
              <StatCard key={s.label} {...s} />
            ))}
          </div>
        ) : null}
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <StatCard
            label={t('labWorkflow.patient')}
            value={`${patient.first_name || ''} ${patient.last_name || ''}`.trim() || '—'}
            hint={patient.id ? `ID #${patient.id}` : undefined}
            icon="user"
            tone="brand"
          />
          <StatCard
            label={t('labWorkflow.referring_doctor')}
            value={doctor?.name || '—'}
            icon="user-md"
            tone="default"
          />
        </div>
        {children}
      </div>
    </div>
  );
}

function itemLineLabel(it, fallback) {
  return it?.item_name || it?.service_name || it?.description || fallback;
}

function PharmacyValidateDetailView({
  code = '',
  patient = {},
  doctor = null,
  items = [],
  expiryByOi = {},
  stockByOi = {},
  flash,
  error}) {
  const { t } = useTranslation('clinical');
  const inHouse = (items || []).filter((it) => String(it.status) !== 'external');
  const dispensableLines = inHouse.filter((it) => it.can_dispense !== false && (it.is_paid || it.is_paid === undefined && String(it.status) === 'paid'));
  const dispensedCount = dispensableLines.filter((it) => it.served_at).length;
  const serveTo = `/pharmacy/serve/${encodeURIComponent(code)}`;
  const markOffCatalogTo = `/pharmacy/mark-off-catalog/${encodeURIComponent(code)}`;
  const rxStatusKey =
    dispensableLines.length === 0
      ? 'pha_rx_pending'
      : dispensedCount === 0
        ? 'pha_rx_pending'
        : dispensedCount >= dispensableLines.length
          ? 'pha_rx_complete'
          : 'pha_rx_partial';
  const rxStatusVariant =
    rxStatusKey === 'pha_rx_complete' ? 'success' : rxStatusKey === 'pha_rx_partial' ? 'pending' : 'cancelled';

  return (
    <ValidateDetailShell
      kind="pharmacy"
      code={code}
      patient={patient}
      doctor={doctor}
      flash={flash}
      error={error}
      stats={[
        {
          label: t('labWorkflow.stat_lines'),
          value: inHouse.length,
          tone: 'brand',
          icon: 'medkit'},
        {
          label: t('labWorkflow.stat_dispensed'),
          value: `${dispensedCount}/${dispensableLines.length || 0}`,
          tone: dispensedCount >= dispensableLines.length && dispensableLines.length ? 'brand' : 'warning',
          icon: 'check-circle'},
      ]}
    >
      {dispensableLines.length ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3">
          <div className="text-sm font-bold text-slate-700">{t('labWorkflow.pha_rx_status_label')}</div>
          <StatusBadge
            variant={rxStatusVariant}
            label={t(`labWorkflow.${rxStatusKey}`, { done: dispensedCount, total: dispensableLines.length })}
          />
        </div>
      ) : null}

      <div className="mb-4 rounded-xl border bg-white p-4">
        <h2 className="mb-1 font-bold">{t('labWorkflow.pha_medications', { count: inHouse.length })}</h2>
        <p className="mb-4 text-sm text-slate-500">{t('labWorkflow.pha_medications_hint_off_catalog')}</p>
        {!inHouse.length ? (
          <p className="text-sm text-slate-400">{t('labWorkflow.no_in_house')}</p>
        ) : (
          inHouse.map((it) => {
            const expiry = expiryByOi[it.id] || expiryByOi[String(it.id)] || null;
            const stock = stockByOi[it.id] || stockByOi[String(it.id)] || null;
            const qtyNeeded = Math.max(1, Math.round(parseFloat(it.quantity) || 1));
            const onHand = stock ? Number(stock.onHand) || 0 : null;
            const offCatalog = !!(it.is_off_catalog_available || it.pharmacist_available);
            const unitPrice = parseFloat(it.unit_price || 0) || 0;
            const stockShort = onHand != null && onHand < qtyNeeded && !offCatalog;
            const served = !!it.served_at;
            const canDispense = it.can_dispense !== false && (it.is_paid || String(it.status) === 'paid');
            const showToggle = it.show_off_catalog_toggle || (it.is_pending_custom && !it.is_paid);
            const awaitingPharmacistPrice = it.awaiting_pharmacist_price || (offCatalog && unitPrice <= 0 && !it.is_paid);
            const awaitingCashier = it.awaiting_cashier_price || (offCatalog && unitPrice > 0 && !it.is_paid);
            const needsPharmacyCheck = it.needs_pharmacy_check || (showToggle && !offCatalog);
            return (
              <div key={it.id} className="mb-4 border-b border-slate-100 pb-4 last:mb-0 last:border-0 last:pb-0">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-900">
                      {itemLineLabel(it, t('labWorkflow.med_default'))}
                      {it.is_custom_zero || unitPrice <= 0 ? (
                        <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-800">
                          {t('labWorkflow.pha_custom_badge')}
                        </span>
                      ) : null}
                      {offCatalog ? (
                        <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold uppercase text-teal-900">
                          {t('labWorkflow.pha_off_catalog_badge')}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-slate-500">
                      {t('labWorkflow.line_no', { id: it.id })}
                      {` · ${t('labWorkflow.pha_qty_label')} ${qtyNeeded}`}
                      {unitPrice > 0 ? ` · ${unitPrice.toLocaleString()} FCFA` : ` · ${t('labWorkflow.pha_price_pending')}`}
                      {onHand != null
                        ? ` · ${t('labWorkflow.pha_stock_on_hand')} ${onHand}`
                        : ` · ${t('labWorkflow.pha_stock_unlinked')}`}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      served
                        ? 'bg-emerald-100 text-emerald-800'
                        : awaitingPharmacistPrice
                          ? 'bg-violet-100 text-violet-900'
                          : awaitingCashier
                            ? 'bg-sky-100 text-sky-900'
                            : needsPharmacyCheck
                              ? 'bg-violet-100 text-violet-900'
                              : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {served
                      ? t('labWorkflow.pha_dispensed')
                      : awaitingPharmacistPrice
                        ? t('labWorkflow.pha_awaiting_pharmacist_price')
                        : awaitingCashier
                          ? t('labWorkflow.pha_awaiting_cashier')
                          : needsPharmacyCheck
                            ? t('labWorkflow.pha_awaiting_pharmacy')
                            : t('labWorkflow.pha_not_dispensed')}
                  </span>
                </div>
                <div className="mb-3 grid gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-3">
                  <div>
                    <div className="text-xs font-bold uppercase text-slate-500">{t('consultation.med_dosage')}</div>
                    <div>{it.rx_dosage || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase text-slate-500">{t('consultation.med_frequency')}</div>
                    <div>{it.rx_frequency || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase text-slate-500">{t('consultation.med_days')}</div>
                    <div>{it.rx_duration || '—'}</div>
                  </div>
                  {it.rx_timing ? (
                    <div className="sm:col-span-3">
                      <div className="text-xs font-bold uppercase text-slate-500">{t('consultation.med_timing')}</div>
                      <div>{it.rx_timing}</div>
                    </div>
                  ) : null}
                  {it.rx_instructions ? (
                    <div className="sm:col-span-3">
                      <div className="text-xs font-bold uppercase text-slate-500">{t('consultation.med_instructions')}</div>
                      <div>{it.rx_instructions}</div>
                    </div>
                  ) : null}
                </div>
                {showToggle && !served ? (
                  <div className="mb-3 rounded-lg border border-teal-200 bg-teal-50/60 px-3 py-3">
                    {!offCatalog ? (
                      <form method="POST" action={markOffCatalogTo} className="space-y-3">
                        <input type="hidden" name="oi_id" value={it.id} />
                        <input type="hidden" name="available" value="1" />
                        <div className="text-sm text-teal-950">
                          <div className="font-bold">{t('labWorkflow.pha_off_catalog_toggle_label')}</div>
                          <div className="text-xs opacity-90">{t('labWorkflow.pha_off_catalog_price_hint')}</div>
                        </div>
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="block text-xs font-bold text-teal-900">
                            {t('labWorkflow.pha_unit_price_label')}
                            <input
                              type="number"
                              name="unit_price"
                              min="1"
                              step="1"
                              required
                              className="mt-1 block w-40 rounded-lg border border-teal-300 bg-white px-2 py-1.5 text-sm font-semibold"
                              placeholder="FCFA"
                            />
                          </label>
                          <button type="submit" className="pha-save-price-btn pha-save-price-btn--teal">
                            <i className="fa fa-tag" aria-hidden="true" />
                            {t('labWorkflow.pha_save_off_catalog_price')}
                          </button>
                        </div>
                      </form>
                    ) : unitPrice <= 0 ? (
                      <form method="POST" action={markOffCatalogTo} className="space-y-3">
                        <input type="hidden" name="oi_id" value={it.id} />
                        <input type="hidden" name="available" value="1" />
                        <div className="text-sm font-bold text-violet-900">{t('labWorkflow.pha_enter_price_title')}</div>
                        <div className="flex flex-wrap items-end gap-3">
                          <input
                            type="number"
                            name="unit_price"
                            min="1"
                            step="1"
                            required
                            className="w-40 rounded-lg border border-violet-300 bg-white px-2 py-1.5 text-sm font-semibold"
                          />
                          <button type="submit" className="pha-save-price-btn">
                            <i className="fa fa-check-circle" aria-hidden="true" />
                            {t('labWorkflow.pha_save_off_catalog_price')}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-teal-950">
                          <div className="font-bold">{t('labWorkflow.pha_off_catalog_priced')}</div>
                          <div className="text-xs">{t('labWorkflow.pha_price_set', { price: unitPrice.toLocaleString() })}</div>
                        </div>
                        <form method="POST" action={markOffCatalogTo}>
                          <input type="hidden" name="oi_id" value={it.id} />
                          <input type="hidden" name="available" value="0" />
                          <button type="submit" className="hms-btn hms-btn-secondary text-xs">
                            {t('labWorkflow.pha_clear_off_catalog')}
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                ) : null}
                {awaitingCashier && !served ? (
                  <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                    {t('labWorkflow.pha_awaiting_cashier_hint')}
                  </div>
                ) : null}
                {expiry && expiry.expired ? (
                  <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    {(expiry.warnings || []).map((w) => (
                      <div key={w}>{w}</div>
                    ))}
                  </div>
                ) : null}
                {stockShort ? (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {t('labWorkflow.pha_stock_short', {
                      need: qtyNeeded,
                      have: onHand})}
                  </div>
                ) : null}
                {offCatalog && canDispense && !served && onHand != null && onHand < qtyNeeded ? (
                  <div className="mb-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-900">
                    {t('labWorkflow.pha_off_catalog_stock_hint')}
                  </div>
                ) : null}
                {served ? (
                  it.served_notes ? <p className="text-xs text-slate-500">{it.served_notes}</p> : null
                ) : canDispense ? (
                  <form method="POST" action={serveTo} className="mt-3 space-y-3 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-teal-50/40 p-4 shadow-sm">
                    <input type="hidden" name="serve_ids[]" value={it.id} />
                    <label className="block text-xs font-bold uppercase tracking-wide text-emerald-800">
                      <i className="fa fa-pencil-square-o mr-1" aria-hidden="true" />
                      {t('labWorkflow.pha_notes')}
                    </label>
                    <input name={`note_${it.id}`} className="hms-input w-full text-sm" placeholder={t('labWorkflow.pha_notes_ph')} />
                    {stockShort && !offCatalog ? (
                      <label className="flex items-start gap-2 text-xs text-amber-900">
                        <input type="checkbox" name="force_stock" value="1" className="mt-0.5" />
                        <span>
                          {t('labWorkflow.pha_force_stock')}
                        </span>
                      </label>
                    ) : null}
                    <button type="submit" className="pha-dispense-btn">
                      <i className="fa fa-medkit text-base" aria-hidden="true" />
                      {t('labWorkflow.pha_dispense_line')}
                    </button>
                  </form>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </ValidateDetailShell>
  );
}

function ValidateDetailView({ kind = 'laboratory', code = '', patient = {}, doctor = null, items = [], resultMap = {}, flash, error }) {
  const { t } = useTranslation('clinical');
  const base = deptBase(kind);
  const inHouse = (items || []).filter((it) => String(it.status) !== 'external');
  const external = (items || []).filter((it) => String(it.status) === 'external');
  const submitTo = `${base}/submit/${encodeURIComponent(code)}`;
  const completedCount = inHouse.filter((it) => {
    const res = resultMap[it.id] || resultMap[String(it.id)] || {};
    return !!(res.notes || res.findings || res.conclusion_code || res.status === 'received');
  }).length;

  return (
    <ValidateDetailShell
      kind={kind}
      code={code}
      patient={patient}
      doctor={doctor}
      flash={flash}
      error={error}
      stats={[
        {
          label: t('labWorkflow.stat_in_house'),
          value: inHouse.length,
          tone: 'brand',
          icon: 'flask'},
        {
          label: t('labWorkflow.stat_completed'),
          value: `${completedCount}/${inHouse.length || 0}`,
          tone: completedCount >= inHouse.length && inHouse.length ? 'brand' : 'warning',
          icon: 'check-circle'},
        ...(external.length
          ? [{ label: t('labWorkflow.stat_external'), value: external.length, tone: 'danger', icon: 'external-link' }]
          : []),
      ]}
    >
      <form method="POST" action={submitTo}>
        <div className="mb-4 rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-bold">{t('labWorkflow.in_house_items', { count: inHouse.length })}</h2>
          {!inHouse.length ? (
            <p className="text-sm text-slate-400">{t('labWorkflow.no_in_house')}</p>
          ) : (
            inHouse.map((it) => {
              const res = resultMap[it.id] || resultMap[String(it.id)] || {};
              return (
                <div key={it.id} className="mb-4 border-b border-slate-100 pb-4 last:border-0">
                  <div className="mb-2 font-bold">{itemLineLabel(it, t('labWorkflow.test_default'))}</div>
                  <input type="hidden" name="item_ids[]" value={it.id} />
                  <label className="mb-1 block text-xs font-bold">{t('labWorkflow.findings')}</label>
                  <textarea name="findings[]" className="hms-input mb-2 w-full text-sm" rows={2} defaultValue={res.notes || res.findings || ''} />
                  <label className="mb-1 block text-xs font-bold">{t('labWorkflow.conclusion')}</label>
                  <input name="conclusion[]" className="hms-input w-full text-sm" defaultValue={res.conclusion_code || ''} />
                </div>
              );
            })
          )}
        </div>
        {external.length ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
            {t('labWorkflow.external_items', { count: external.length })}
          </div>
        ) : null}
        {inHouse.length ? (
          <button type="submit" className="hms-btn hms-btn-success">
            <i className="fa fa-check-circle" aria-hidden="true" />
            {t('labWorkflow.submit_findings')}
          </button>
        ) : null}
      </form>
    </ValidateDetailShell>
  );
}

function OrderAlertsView({ dept = 'laboratory', deptLabel: deptLabelProp = '', unacked = [], recent = [], flash, error }) {
  const { t } = useTranslation('clinical');
  const workPath = dept === 'radiology' ? '/radiology' : dept === 'pharmacy' ? '/pharmacy' : '/laboratory';
  const inboxPath = `${workPath}/order-alerts`;
  const label = deptLabelProp || deptLabel(t, dept);
  const blurb = dept === 'pharmacy' ? t('labWorkflow.blurb_pharmacy') : t('labWorkflow.blurb_orders');
  const theme = THEMES[dept] || THEMES.laboratory;

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-10 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero
          icon={dept === 'pharmacy' ? 'medkit' : dept === 'radiology' ? 'x-ray' : 'flask'}
          badge={theme.icon}
          title={t('labWorkflow.order_alerts_title', { dept: label })}
          subtitle={blurb}
        >
          <div className="hms-surface-hero-actions mt-4">
            <a href={workPath} className="hms-btn-secondary text-xs">
              {t('labWorkflow.back_to_dept', { dept: label })}
            </a>
          </div>
        </SurfaceHero>

        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <StatCard label={t('labWorkflow.needs_attention')} value={unacked.length} tone="warning" icon="bell" />
          <StatCard label={t('labWorkflow.recent')} value={recent.length} tone="default" icon="history" />
        </div>

        <h2 className="mb-3 font-bold text-ink">{t('labWorkflow.needs_attention')}</h2>
      {!unacked.length ? (
        <p className="mb-6 rounded-xl border bg-slate-50 p-6 text-center text-slate-500">{t('labWorkflow.no_new_alerts')}</p>
      ) : (
        unacked.map((a) => (
          <AlertCard key={a.id} alert={a} dept={dept} inboxPath={inboxPath} />
        ))
      )}

      <h2 className="mb-3 mt-8 font-bold">{t('labWorkflow.recent')}</h2>
      {!recent.length ? (
        <p className="text-sm text-slate-400">{t('labWorkflow.no_history')}</p>
      ) : (
        recent.map((a) => (
          <div key={a.id} className="mb-2 rounded-xl border bg-white p-4 text-sm">
            <div className="text-xs text-slate-500">{a.created_at ? new Date(a.created_at).toLocaleString() : ''}</div>
            <div className="font-bold">{a.test_display || t('labWorkflow.order')}</div>
            <div className="text-slate-500">
              {a.patient_display} · {a.ward_display} / {a.bed_display}
            </div>
          </div>
        ))
      )}
      </div>
    </div>
  );
}

function AlertCard({ alert: a, dept, inboxPath }) {
  const { t } = useTranslation('clinical');
  const ctx = String(a.context || '').toUpperCase();
  const ctxLabel =
    ctx === 'ER'
      ? t('labWorkflow.ctx_emergency')
      : ctx === 'IPD'
        ? t('labWorkflow.ctx_inpatient')
        : ctx === 'OPD'
          ? t('labWorkflow.ctx_outpatient')
          : ctx || t('labWorkflow.ctx_clinical');
  const oiLab =
    dept === 'laboratory' &&
    a.opd_order_item_id &&
    String(a.oi_item_type || '') === 'laboratory' &&
    String(a.oi_service_code || '').toUpperCase().startsWith('LAB-');

  return (
    <div className="mb-3 rounded-xl border border-l-4 border-l-amber-400 bg-white p-4 shadow-sm">
      <div className="mb-2 flex justify-between text-xs">
        <span className="rounded bg-amber-100 px-2 py-0.5 font-bold uppercase text-amber-800">{ctxLabel}</span>
        <span className="text-slate-500">{a.created_at ? new Date(a.created_at).toLocaleString() : ''}</span>
      </div>
      <div className="font-bold">{a.test_display || t('labWorkflow.order')}</div>
      <div className="text-sm text-slate-600">
        Dr. {a.doctor_display || '—'} · {a.patient_display || '—'}
      </div>
      <div className="text-xs text-slate-500">
        {a.ward_display || '—'} / {a.bed_display || '—'}
      </div>
      <form method="POST" action={`/api/clinical-dept-alerts/${a.id}/ack`} className="mt-3 flex flex-wrap gap-2">
        <input type="hidden" name="_return" value={inboxPath} />
        {oiLab ? (
          <button type="submit" name="action" value="open_bench" className="hms-btn hms-btn-primary text-xs">
            <i className="fa fa-flask" aria-hidden="true" />
            {t('labWorkflow.confirm_open_lab')}
          </button>
        ) : null}
        <button type="submit" name="action" value="seen" className="hms-btn hms-btn-secondary text-xs">
          <i className="fa fa-eye" aria-hidden="true" />
          {t('labWorkflow.mark_seen')}
        </button>
      </form>
    </div>
  );
}

export function LabWorkflowPageApp(props) {
  const { pageKey = 'lab-validate' } = props;

  if (pageKey === 'lab-validate' || pageKey === 'validate') {
    return <ValidateEntryView kind={props.kind || 'laboratory'} {...props} />;
  }
  if (pageKey === 'lab-validate-detail' || pageKey === 'validate-detail') {
    if (props.kind === 'pharmacy') {
      return <PharmacyValidateDetailView {...props} />;
    }
    return <ValidateDetailView {...props} />;
  }
  if (pageKey === 'order-alerts' || pageKey === 'clinical-dept-inbox') {
    return <OrderAlertsView {...props} />;
  }
  return <ValidateEntryView {...props} />;
}
