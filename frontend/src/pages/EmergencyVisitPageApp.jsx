import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { FormField } from '../components/FormField';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { confirmModal } from '../lib/modalBridge';
import { openAddChargeModal } from '../lib/addChargeBridge';
import { Modal } from '../components/Modal';
import { formatMoney, priceUnitLabel } from '../lib/hmsLocale';

const FLAGS = ['trauma', 'cardiac', 'stroke', 'pediatric', 'psych', 'obstetric'];
const PATHWAY_KEYS = [
  { v: 'discharge', lbl: 'pathway_discharge', hint: 'pathway_discharge_hint' },
  { v: 'ssu', lbl: 'pathway_ssu', hint: 'pathway_ssu_hint' },
  { v: 'ipd', lbl: 'pathway_ipd', hint: 'pathway_ipd_hint' },
  { v: 'ot', lbl: 'pathway_ot', hint: 'pathway_ot_hint' },
  { v: 'transfer', lbl: 'pathway_transfer', hint: 'pathway_transfer_hint' },
  { v: 'deceased', lbl: 'pathway_deceased', hint: 'pathway_deceased_hint' },
  { v: 'lwbs', lbl: 'pathway_lwbs', hint: 'pathway_lwbs_hint' },
];
const CASE_TYPE_KEYS = [
  ['poisoning', 'case_poisoning'],
  ['assault', 'case_assault'],
  ['rta', 'case_rta'],
  ['burn', 'case_burn'],
  ['sexual_assault', 'case_sexual_assault'],
  ['domestic_violence', 'case_domestic_violence'],
  ['unknown_dead_body', 'case_unknown_dead_body'],
  ['other', 'case_other'],
];
const ORDER_ICONS = {
  lab: '🧪',
  radiology: '📷',
  pharmacy: '💊',
  blood_bank: '🩸',
  procedure: '✂️'};
const ORDER_STATUS_KEYS = {
  ordered: 'order_status_ordered',
  sample_collected: 'order_status_sample_collected',
  in_progress: 'order_status_in_progress',
  completed: 'order_status_completed',
  cancelled: 'order_status_cancelled'};

function fmtFcfa(n) {
  return formatMoney(n);
}

function statusChip(st) {
  const s = String(st || 'ordered').toLowerCase();
  const map = {
    ordered: 'bg-blue-100 text-blue-800',
    sample_collected: 'bg-amber-100 text-amber-900',
    in_progress: 'bg-amber-100 text-amber-900',
    completed: 'bg-emerald-100 text-emerald-800',
    critical: 'bg-red-100 text-red-800',
    cancelled: 'bg-slate-100 text-slate-600'};
  return map[s] || 'bg-slate-100 text-slate-600';
}

const ORDER_CATALOG_CATEGORY = {
  lab: 'laboratory',
  radiology: 'radiology',
  blood_bank: 'laboratory',
  procedure: 'service'};

function ErOrderCatalogFields({ orderType, t }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [sourceModule, setSourceModule] = useState('');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    setSelectedId('');
    setDescription('');
    setQuantity('1');
    setSourceModule('');
    setAmount('');
    setItems([]);
    const ot = String(orderType || '').trim().toLowerCase();
    if (!ot) return undefined;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        if (ot === 'pharmacy') {
          const r = await fetch('/api/pharmacy/inventory-for-charge', { credentials: 'same-origin' });
          const data = await r.json();
          if (!cancelled) {
            setItems(Array.isArray(data) ? data : []);
            setSourceModule('inventory');
          }
        } else {
          const cat = ORDER_CATALOG_CATEGORY[ot];
          if (!cat) {
            if (!cancelled) setItems([]);
            return;
          }
          const r = await fetch(`/api/service-catalog?category=${encodeURIComponent(cat)}`, {
            credentials: 'same-origin'});
          const data = await r.json();
          if (!cancelled) {
            setItems(Array.isArray(data) ? data : []);
            setSourceModule('service_catalog');
          }
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderType]);

  function onPick(e) {
    const id = e.target.value;
    setSelectedId(id);
    const hit = items.find((it) => String(it.id) === String(id));
    if (hit) {
      setDescription(hit.name || '');
      setAmount(String(Math.round(parseFloat(hit.price || 0) || 0)));
    } else {
      setDescription('');
      setAmount('');
    }
  }

  const ot = String(orderType || '').trim().toLowerCase();
  const showCatalog = ['lab', 'radiology', 'pharmacy', 'blood_bank', 'procedure'].includes(ot);
  const qtyNum = Math.max(1, parseInt(quantity, 10) || 1);
  const lineTotal = (parseFloat(amount) || 0) * qtyNum;

  return (
    <>
      <input type="hidden" name="catalog_id" value={selectedId} />
      <input type="hidden" name="source_module" value={sourceModule} />
      <input type="hidden" name="amount" value={amount} />
      {showCatalog ? (
        <div className="mt-3">
          <label className="mb-1 block text-xs font-bold">
            {t('emergencyVisit.order_catalog')}
          </label>
          <select className="hms-input w-full" value={selectedId} onChange={onPick} disabled={loading}>
            <option value="">
              {loading
                ? t('emergencyVisit.catalog_loading')
                : t('emergencyVisit.order_catalog_ph')}
            </option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name} — {fmtFcfa(it.price)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <label className="mb-1 mt-3 block text-xs font-bold">
        {t('emergencyVisit.description')} <span className="text-red-600">*</span>
      </label>
      <input
        type="text"
        name="description"
        className="hms-input w-full"
        required
        placeholder={t('emergencyVisit.description_ph')}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-bold">
            {t('emergencyVisit.order_qty')}
          </label>
          <input
            type="number"
            name="quantity"
            className="hms-input w-24"
            min="1"
            max="99"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        {lineTotal > 0 ? (
          <p className="pb-2 text-xs font-bold text-emerald-800">
            {t('emergencyVisit.order_charge_preview', {
              total: fmtFcfa(lineTotal)})}
          </p>
        ) : null}
      </div>
    </>
  );
}

function Section({ title, icon, badge, action, children }) {
  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 font-bold text-slate-800">
        <span>
          {icon ? <span className="mr-2">{icon}</span> : null}
          {title}
        </span>
        <div className="flex items-center gap-2 text-sm font-normal">{badge}{action}</div>
      </div>
      {children}
    </div>
  );
}

function OrderModal({ open, onClose, visitId, erClosed, title, children, action, submitLabel, formId, t }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <ModalCancelButton onClick={onClose} label={t('common:actions.cancel')} />
          <ModalSubmitButton form={formId} label={submitLabel} disabled={erClosed} />
        </>
      }
    >
      <form id={formId} method="POST" action={action}>
        <input type="hidden" name="visit_id" value={visitId} />
        <fieldset disabled={erClosed} className="m-0 min-w-0 border-0 p-0">
          {children}
        </fieldset>
      </form>
    </Modal>
  );
}

export function EmergencyVisitPageApp({
  visit = {},
  triage = null,
  bed = null,
  beds = [],
  orders = [],
  charges = [],
  disposition = null,
  mlc = null,
  departments = [],
  totalCharges = 0,
  ACUITY = {},
  hasErConsultation = false,
  flash = null,
  error = null}) {
  const { t } = useTranslation('clinical');
  const erCompleted =
    String(visit.queue_status || '') === 'completed' || String(visit.queue_status || '') === 'cancelled';
  const erClinicalDc =
    String(visit.queue_status || '') === 'clinical_discharged' || !!visit.clinical_discharged_at;
  const erClosed = erCompleted;
  const erClinicalLocked = erClinicalDc || erCompleted;
  const [orderOpen, setOrderOpen] = useState(false);
  const [newOrderType, setNewOrderType] = useState('lab');
  const [erCode, setErCode] = useState('');
  const [erCodeValid, setErCodeValid] = useState(false);
  const [erCodeFeedback, setErCodeFeedback] = useState('');
  const [updateOrder, setUpdateOrder] = useState(null);
  const [pathway, setPathway] = useState(disposition?.pathway || '');
  const [acuityLevel, setAcuityLevel] = useState(() => {
    const saved = triage?.acuity_level ?? visit?.acuity_level;
    return saved != null && saved !== '' ? String(saved) : '';
  });

  const pathways = useMemo(
    () => PATHWAY_KEYS.map((p) => ({ v: p.v, lbl: t(`emergencyVisit.${p.lbl}`), hint: t(`emergencyVisit.${p.hint}`) })),
    [t]
  );

  const defaultDepartments = useMemo(
    () => [{ name: t('emergencyVisit.dept_general_medicine') }, { name: t('emergencyVisit.dept_icu') }],
    [t]
  );

  const vitalsFields = useMemo(
    () => [
      ['bp_systolic', 'vital_bp_sys', triage?.bp_systolic],
      ['bp_diastolic', 'vital_bp_dia', triage?.bp_diastolic],
      ['pulse', 'vital_pulse', triage?.pulse],
      ['spo2', 'vital_spo2', triage?.spo2],
      ['temp_celsius', 'vital_temp', triage?.temp_celsius],
      ['respiratory_rate', 'vital_rr', triage?.respiratory_rate],
      ['gcs', 'vital_gcs', triage?.gcs],
      ['pain_score', 'vital_pain', triage?.pain_score],
    ],
    [triage]
  );

  const age = visit.dob ? new Date().getFullYear() - new Date(visit.dob).getFullYear() : null;
  const doorToDoc = useMemo(() => {
    if (!visit.queue_started_at || !visit.doctor_first_seen) return null;
    return Math.round((new Date(visit.doctor_first_seen) - new Date(visit.queue_started_at)) / 60000);
  }, [visit.queue_started_at, visit.doctor_first_seen]);

  const acuityMeta = visit.acuity_level ? ACUITY[visit.acuity_level] : null;

  function openChargeModal() {
    if (erClinicalLocked) return;
    openAddChargeModal();
  }

  async function confirmMlcLock(ev) {
    ev.preventDefault();
    const form = ev.target;
    const submit = () => {
      form.__hmsConfirmed = true;
      form.submit();
    };
    const ok = await confirmModal({
      title: t('emergencyVisit.mlc_lock_title'),
      message: t('emergencyVisit.mlc_lock_msg'),
      confirmLabel: t('emergencyVisit.mlc_lock_confirm'),
      tone: 'danger'});
    if (ok) submit();
  }

  function orderStatusLabel(st) {
    const key = ORDER_STATUS_KEYS[st];
    return key ? t(`emergencyVisit.${key}`) : st.replace(/_/g, ' ');
  }

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-8 pt-2">
      <FlashMessages flash={flash} error={error} />

      {erCompleted ? (
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
          {t('emergencyVisit.closed_banner')}
        </div>
      ) : erClinicalDc ? (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
          {t('erDischarge.awaiting_financial_banner')}
        </div>
      ) : null}

      <SurfaceHero
        icon="ambulance"
        title={`${visit.first_name} ${visit.last_name}`}
        subtitle={[
          visit.ticket_number,
          visit.gender || '—',
          age ? t('emergencyVisit.age_years', { age }) : null,
          visit.phone || t('emergencyVisit.no_phone'),
          bed ? `🛏 ${bed.label || bed.bed_code}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      >
        <div className="hms-surface-hero-chips mt-3">
          {visit.acuity_level && acuityMeta ? (
            <span className="hms-icon-chip" style={{ background: acuityMeta.color }}>
              L{visit.acuity_level} · {acuityMeta.label}
            </span>
          ) : null}
          {visit.mlc_flag ? <span className="hms-icon-chip">MLC</span> : null}
          {doorToDoc != null ? (
            <span className="hms-icon-chip">{t('emergencyVisit.stat_door_to_doc', { minutes: doorToDoc })}</span>
          ) : null}
        </div>
        <div className="hms-surface-hero-actions mt-4">
          <a href="/emergency" className="hms-btn-secondary text-xs">
            <i className="fa fa-arrow-left" aria-hidden="true" />
            {t('emergencyVisit.er_board')}
          </a>
          {!visit.doctor_first_seen && visit.acuity_level && !erClosed ? (
            <form method="POST" action="/emergency/doctor-seen" className="inline">
              <input type="hidden" name="visit_id" value={visit.id} />
              <button type="submit" className="hms-btn-secondary text-xs font-bold">
                <i className="fa fa-user-md" aria-hidden="true" />
                {t('emergencyVisit.mark_doctor_seen')}
              </button>
            </form>
          ) : null}
          <a
            href={`/consultation-new?patient_id=${visit.patient_id}&visit_id=${visit.id}`}
            className="hms-btn-primary text-xs"
          >
            <i className="fa fa-stethoscope" aria-hidden="true" />
            {t('emergencyVisit.soap_consultation')}
          </a>
          <a
            href={`/nursing/vitals?patient_id=${visit.patient_id}&opd_visit_id=${visit.id}&redirect_to=${encodeURIComponent(`/emergency/visit/${visit.id}`)}`}
            className="hms-btn-secondary text-xs"
          >
            <i className="fa fa-heartbeat" aria-hidden="true" />
            {t('emergencyVisit.vitals')}
          </a>
          <a
            href={`/death-registry?source=er&visit_id=${visit.id}`}
            className="hms-btn-secondary text-xs"
          >
            <i className="fa fa-heart-o" aria-hidden="true" />
            {t('emergencyVisit.death_registry')}
          </a>
        </div>
      </SurfaceHero>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label={t('emergencyVisit.stat_orders')} value={orders.length} tone="brand" icon="list-alt" />
        <StatCard
          label={t('emergencyVisit.stat_charges')}
          value={`${fmtFcfa(totalCharges)}`}
          hint={priceUnitLabel()}
          tone="warning"
          icon="money"
        />
        <StatCard
          label={t('emergencyVisit.stat_consult')}
          value={hasErConsultation ? t('emergencyVisit.consultation_recorded') : t('emergencyVisit.step1_required')}
          tone={hasErConsultation ? 'brand' : 'danger'}
          icon="stethoscope"
        />
      </div>

      <Section
        title={t('emergencyVisit.clinical_docs')}
        icon="📋"
        badge={
          hasErConsultation ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
              {t('emergencyVisit.consultation_recorded')}
            </span>
          ) : (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">{t('emergencyVisit.step1_required')}</span>
          )
        }
      >
        <div className="p-4">
          {!hasErConsultation ? (
            <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
              {t('emergencyVisit.create_consult_first')}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <a
              href={`/consultation-new?patient_id=${visit.patient_id}&visit_id=${visit.id}`}
              className="hms-btn hms-btn-primary text-sm font-bold"
            >
              <i className="fa fa-stethoscope" aria-hidden="true" />
              {hasErConsultation ? t('emergencyVisit.edit_consultation') : t('emergencyVisit.create_consultation')}
            </a>
            {hasErConsultation ? (
              <a href={`/prescriptions?patient_id=${visit.patient_id}`} className="hms-btn hms-btn-outline-success text-sm">
                <i className="fa fa-medkit" aria-hidden="true" />
                {t('emergencyVisit.prescription_registry')}
              </a>
            ) : (
              <button type="button" className="hms-btn hms-btn-secondary text-sm opacity-60" disabled title={t('emergencyVisit.requires_consultation')}>
                <i className="fa fa-lock" aria-hidden="true" />
                {t('emergencyVisit.prescription_locked')}
              </button>
            )}
          </div>
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Section
            title={t('emergencyVisit.phase1_triage')}
            icon="🩺"
            badge={
              triage ? (
                <span className="text-xs text-slate-500">
                  {t('emergencyVisit.saved_at', { time: triage.updated_at ? new Date(triage.updated_at).toLocaleString() : '' })}
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{t('shared.pending')}</span>
              )
            }
          >
            <form method="POST" action="/emergency/triage" className="p-4">
              <input type="hidden" name="visit_id" value={visit.id} />
              <fieldset disabled={erClinicalLocked} className="border-0 p-0 m-0 min-w-0">
                <label className="mb-2 block text-xs font-bold uppercase text-slate-600">
                  {t('emergencyVisit.acuity_level')} <span className="text-red-600">*</span>
                </label>
                <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
                  {[1, 2, 3, 4, 5].map((lv) => {
                    const a = ACUITY[lv] || ACUITY[String(lv)] || { label: `L${lv}`, color: '#64748b' };
                    const selected = acuityLevel === String(lv);
                    return (
                      <label key={lv} className="cursor-pointer text-center">
                        <input
                          type="radio"
                          name="acuity_level"
                          value={lv}
                          checked={selected}
                          onChange={() => setAcuityLevel(String(lv))}
                          className="sr-only"
                          required={lv === 1 && !acuityLevel}
                        />
                        <span
                          className={`block rounded-lg px-2 py-2 text-xs font-extrabold text-white transition ${
                            selected ? 'ring-4 ring-slate-900/40 scale-[1.03] shadow-lg' : 'opacity-60 hover:opacity-85'
                          }`}
                          style={{ background: a.color, opacity: selected ? 1 : undefined }}
                        >
                          L{lv}
                          <small className="mt-0.5 block text-[10px] font-semibold opacity-95">{a.label}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>

                <label className="mb-2 block text-xs font-bold uppercase text-slate-600">{t('emergencyVisit.vitals_label')}</label>
                <div className="mb-3 grid grid-cols-3 gap-2 md:grid-cols-6">
                  {vitalsFields.map(([name, phKey, val]) => (
                    <input
                      key={name}
                      type="number"
                      name={name}
                      className="hms-input text-sm"
                      placeholder={t(`emergencyVisit.${phKey}`)}
                      defaultValue={val ?? ''}
                      step={name === 'temp_celsius' ? '0.1' : '1'}
                      min={name === 'gcs' ? 3 : name === 'pain_score' ? 0 : undefined}
                      max={name === 'gcs' ? 15 : name === 'pain_score' ? 10 : undefined}
                    />
                  ))}
                </div>

                <label className="mb-2 block text-xs font-bold uppercase text-slate-600">{t('emergencyVisit.flags')}</label>
                <div className="mb-3 flex flex-wrap gap-3 text-sm">
                  {FLAGS.map((fl) => (
                    <label key={fl} className="flex items-center gap-1">
                      <input type="checkbox" name={`flag_${fl}`} value="1" defaultChecked={!!triage?.[`flag_${fl}`]} />
                      {t(`emergencyVisit.flag_${fl}`)}
                    </label>
                  ))}
                </div>

                <div className="mb-4 grid gap-3 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <FormField label={t('emergencyVisit.chief_complaint')}>
                      <textarea
                        name="chief_complaint"
                        className="hms-input w-full text-sm"
                        rows={2}
                        defaultValue={triage?.chief_complaint || visit.chief_complaint || ''}
                      />
                    </FormField>
                  </div>
                  <div>
                    <FormField label={t('emergencyVisit.assign_bed')}>
                      <select name="bed_id" className="hms-input w-full text-sm" defaultValue={visit.er_bed_id || triage?.bed_id || ''}>
                        <option value="">{t('emergencyVisit.no_bed')}</option>
                        {beds.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.bay_type} · {b.bed_code}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  </div>
                </div>

                <div className="text-right">
                  <button type="submit" className="hms-btn hms-btn-warning font-bold">
                    <i className="fa fa-heartbeat" aria-hidden="true" />
                    {triage ? t('emergencyVisit.update_triage') : t('emergencyVisit.save_triage')}
                  </button>
                </div>
              </fieldset>
            </form>
          </Section>

          <Section
            title={t('emergencyVisit.phase2_orders')}
            icon="🧪"
            action={
              <button
                type="button"
                className="hms-btn hms-btn-outline-primary text-xs"
                disabled={erClinicalLocked}
                onClick={() => setOrderOpen(true)}
              >
                {t('emergencyVisit.new_order')}
              </button>
            }
          >
            {!orders.length ? (
              <p className="p-4 text-center text-sm text-slate-400">{t('emergencyVisit.no_orders')}</p>
            ) : (
              <div>
                {orders.map((o) => {
                  const st = (o.status || 'ordered').toLowerCase();
                  const canEdit = st !== 'completed' && st !== 'cancelled' && !erClinicalLocked;
                  return (
                    <div
                      key={o.id}
                      className={`flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0 ${o.critical_alert ? 'bg-red-50' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          {ORDER_ICONS[o.order_type] || '•'} {o.order_type}
                          {o.priority === 'stat' ? (
                            <span className="ml-1 rounded bg-red-600 px-1 text-[10px] text-white">{t('emergencyVisit.priority_stat')}</span>
                          ) : null}
                          {o.critical_alert ? (
                            <span className="ml-1 rounded bg-red-600 px-1 text-[10px] text-white">CRITICAL</span>
                          ) : null}
                        </div>
                        <div className="font-bold text-slate-800">{o.description}</div>
                        {o.result_summary ? (
                          <div className="text-xs text-slate-600">
                            <strong>{t('emergencyVisit.result')}</strong> {o.result_summary}
                          </div>
                        ) : null}
                        <div className="text-[11px] text-slate-400">
                          {t('emergencyVisit.ordered_at', { time: o.ordered_at ? new Date(o.ordered_at).toLocaleString() : '—' })}
                          {o.completed_at ? t('emergencyVisit.done_at', { time: new Date(o.completed_at).toLocaleString() }) : ''}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusChip(st)}`}>
                          {orderStatusLabel(st)}
                        </span>
                        {canEdit ? (
                          <button
                            type="button"
                            className="ml-1 text-xs text-blue-600 underline"
                            onClick={() => setUpdateOrder(o)}
                          >
                            {t('common:actions.edit').toLowerCase()}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          <Section title={t('erDischarge.workflow_title')} icon="🏥">
            <div className="space-y-3 p-4 text-sm">
              <div className={`rounded-xl border-2 px-4 py-3 ${erClinicalDc ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                <div className="text-xs font-bold uppercase text-slate-500">{t('erDischarge.step_clinical')}</div>
                <div className="font-bold text-slate-900">
                  {erClinicalDc
                    ? t('erDischarge.clinical_done', {
                        date: visit.clinical_discharged_at
                          ? new Date(visit.clinical_discharged_at).toLocaleString()
                          : '—'})
                    : t('erDischarge.clinical_pending')}
                </div>
              </div>
              <div className={`rounded-xl border-2 px-4 py-3 ${visit.er_payment_code ? 'border-emerald-300 bg-emerald-50' : erClinicalDc ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                <div className="text-xs font-bold uppercase text-slate-500">{t('erDischarge.step_financial')}</div>
                <div className="font-bold text-slate-900">
                  {visit.er_payment_code
                    ? t('erDischarge.financial_done', { code: visit.er_payment_code })
                    : erClinicalDc
                      ? t('erDischarge.financial_pending')
                      : t('erDischarge.financial_waiting')}
                </div>
                {erClinicalDc && !visit.er_payment_code ? (
                  <a href="/cashier" className="mt-2 inline-block text-xs font-bold text-red-700 underline">
                    {t('erDischarge.open_cashier')}
                  </a>
                ) : null}
              </div>
              <div className={`rounded-xl border-2 px-4 py-3 ${erCompleted ? 'border-emerald-300 bg-emerald-50' : visit.er_payment_code ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                <div className="text-xs font-bold uppercase text-slate-500">{t('erDischarge.step_confirm')}</div>
                {erCompleted ? (
                  <div className="font-bold text-emerald-800">{t('erDischarge.confirm_done')}</div>
                ) : visit.er_payment_code ? (
                  <form method="POST" action="/emergency/confirm-discharge" className="mt-2 space-y-2">
                    <input type="hidden" name="visit_id" value={visit.id} />
                    <input type="hidden" name="payment_code" value={erCodeValid ? erCode.trim().toUpperCase() : ''} />
                    <p className="text-xs text-slate-600">{t('erDischarge.confirm_hint')}</p>
                    <div className="flex gap-2">
                      <input
                        className="hms-input uppercase"
                        value={erCode}
                        onChange={(ev) => {
                          setErCode(ev.target.value.toUpperCase());
                          setErCodeValid(false);
                        }}
                        placeholder={t('erDischarge.code_ph')}
                      />
                      <button
                        type="button"
                        className="hms-btn-primary shrink-0 text-xs"
                        onClick={async () => {
                          const c = erCode.trim().toUpperCase();
                          if (!c) return;
                          setErCodeFeedback(t('erDischarge.validating'));
                          try {
                            const r = await fetch(
                              `/emergency/validate-er-code?visit_id=${visit.id}&code=${encodeURIComponent(c)}`,
                              { credentials: 'same-origin' }
                            );
                            const d = await r.json();
                            if (!d.ok) {
                              setErCodeValid(false);
                              setErCodeFeedback(d.error || t('erDischarge.invalid_code'));
                              return;
                            }
                            setErCodeValid(true);
                            setErCodeFeedback(t('erDischarge.code_valid'));
                          } catch {
                            setErCodeValid(false);
                            setErCodeFeedback(t('erDischarge.validation_failed'));
                          }
                        }}
                      >
                        {t('shared.validate')}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">{erCodeFeedback}</p>
                    <button type="submit" className="hms-btn hms-btn-success text-xs font-bold" disabled={!erCodeValid}>
                      <i className="fa fa-check-circle" aria-hidden="true" />
                      {t('erDischarge.confirm_btn')}
                    </button>
                  </form>
                ) : (
                  <div className="font-bold text-slate-600">{t('erDischarge.confirm_waiting')}</div>
                )}
              </div>
            </div>
          </Section>

          <Section
            title={t('emergencyVisit.phase3_disposition')}
            icon="🚪"
            badge={
              disposition ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                  {String(disposition.pathway).toUpperCase()}
                </span>
              ) : null
            }
          >
            <div className="p-4">
              {disposition ? (
                <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm">
                  <strong>{t('emergencyVisit.pathway_label')}</strong> {disposition.pathway}
                  {disposition.admit_department ? ` · ${disposition.admit_department}` : ''}
                  {disposition.summary ? (
                    <p className="mb-0 mt-1">
                      <strong>{t('emergencyVisit.summary_label')}</strong> {disposition.summary}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <form method="POST" action="/emergency/disposition">
                <input type="hidden" name="visit_id" value={visit.id} />
                <fieldset disabled={erClinicalLocked} className="border-0 p-0 m-0 min-w-0">
                  <label className="mb-2 block text-xs font-bold uppercase text-slate-600">{t('emergencyVisit.choose_pathway')}</label>
                  <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3">
                    {pathways.map((p) => {
                      const sel = (pathway || disposition?.pathway) === p.v;
                      return (
                        <label
                          key={p.v}
                          className={`cursor-pointer rounded-xl border-2 p-3 transition ${sel ? 'border-red-600 bg-red-50' : 'border-slate-200 hover:shadow-sm'}`}
                        >
                          <input
                            type="radio"
                            name="pathway"
                            value={p.v}
                            checked={sel}
                            onChange={() => setPathway(p.v)}
                            className="sr-only"
                          />
                          <div className="font-bold text-slate-800">{p.lbl}</div>
                          <div className="text-xs text-slate-500">{p.hint}</div>
                        </label>
                      );
                    })}
                  </div>

                  {pathway === 'ipd' ? (
                    <div className="mb-3">
                      <label className="mb-1 block text-xs font-bold">{t('emergencyVisit.admitting_department')}</label>
                      <select name="admit_department" className="hms-input w-full text-sm" defaultValue={disposition?.admit_department || ''}>
                        {(departments.length ? departments : defaultDepartments).map((d) => (
                          <option key={d.name}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {pathway === 'ssu' ? (
                    <div className="mb-3">
                      <label className="mb-1 block text-xs font-bold">{t('emergencyVisit.expected_hours')}</label>
                      <input type="number" name="ssu_expected_hours" min={1} max={48} className="hms-input w-40 text-sm" placeholder={t('emergencyVisit.expected_hours_ph')} />
                    </div>
                  ) : null}
                  {pathway === 'ot' ? (
                    <div className="mb-3">
                      <label className="mb-1 block text-xs font-bold">{t('emergencyVisit.ot_procedure')}</label>
                      <input type="text" name="ot_procedure" className="hms-input w-full text-sm" placeholder={t('emergencyVisit.ot_procedure_ph')} />
                    </div>
                  ) : null}
                  {pathway === 'transfer' ? (
                    <div className="mb-3">
                      <label className="mb-1 block text-xs font-bold">{t('emergencyVisit.transfer_to')}</label>
                      <input type="text" name="transfer_to" className="hms-input w-full text-sm" placeholder={t('emergencyVisit.transfer_to_ph')} />
                    </div>
                  ) : null}
                  {pathway === 'discharge' ? (
                    <div className="mb-3 grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-bold">{t('emergencyVisit.take_home_meds')}</label>
                        <textarea name="take_home_meds" className="hms-input w-full text-sm" rows={2} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold">{t('emergencyVisit.return_precautions')}</label>
                        <textarea name="return_precautions" className="hms-input w-full text-sm" rows={2} />
                      </div>
                    </div>
                  ) : null}

                  <div className="mb-3">
                    <label className="mb-1 block text-xs font-bold">{t('emergencyVisit.clinical_summary')}</label>
                    <textarea name="summary" className="hms-input w-full text-sm" rows={2} defaultValue={disposition?.summary || ''} />
                  </div>

                  <div className="text-right">
                    <button type="submit" className="hms-btn hms-btn-success font-bold">
                      <i className="fa fa-sign-out" aria-hidden="true" />
                      {pathway === 'discharge'
                        ? t('erDischarge.sign_clinical')
                        : t('emergencyVisit.confirm_disposition')}
                    </button>
                  </div>
                </fieldset>
              </form>
            </div>
          </Section>
        </div>

        <div className="lg:col-span-5">
          <Section title={t('emergencyVisit.visit_timeline')} icon="⏱">
            <div className="space-y-1 p-4 text-sm">
              <div>
                <strong>{t('emergencyVisit.arrived')}</strong>{' '}
                {visit.queue_started_at ? new Date(visit.queue_started_at).toLocaleString() : '—'}
                {visit.arrival_mode ? ` · ${String(visit.arrival_mode).replace('_', ' ')}` : ''}
              </div>
              <div>
                <strong>{t('emergencyVisit.doctor_first_seen')}</strong>{' '}
                {visit.doctor_first_seen ? new Date(visit.doctor_first_seen).toLocaleString() : t('emergencyVisit.pending_dash')}
              </div>
              {doorToDoc != null ? (
                <div>
                  <strong>{t('emergencyVisit.door_to_doctor')}</strong>{' '}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${doorToDoc <= 30 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                    {t('emergencyVisit.minutes', { count: doorToDoc })}
                  </span>
                </div>
              ) : null}
              <div>
                <strong>{t('shared.status')}:</strong>{' '}
                <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-bold">
                  {String(visit.queue_status || '—').replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          </Section>

          <Section
            title={t('emergencyVisit.phase4_charges')}
            icon="💳"
            action={
              <button type="button" className="hms-btn hms-btn-outline-danger text-xs" disabled={erClinicalLocked} onClick={openChargeModal}>
                {t('emergencyVisit.add_charge')}
              </button>
            }
          >
            <div className="mx-4 mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900">
              {t('emergencyVisit.charges_hint')}
            </div>
            {!charges.length ? (
              <p className="p-4 text-center text-sm text-slate-400">{t('emergencyVisit.no_charges')}</p>
            ) : (
              <>
                {charges.map((c) => (
                  <div key={c.id} className="flex justify-between gap-3 border-b border-dashed border-slate-100 px-4 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold">{c.description}</div>
                      {c.clinical_summary ? (
                        <div className="text-[11px] text-slate-500">{c.clinical_summary}</div>
                      ) : null}
                      <div className="text-[11px] text-slate-400">
                        {c.charge_type} · {c.created_at ? new Date(c.created_at).toLocaleString() : ''}
                        {c.settled ? <span className="ml-1 font-bold text-emerald-600">{t('emergencyVisit.settled')}</span> : null}
                      </div>
                    </div>
                    <div className="shrink-0 font-bold text-red-600">{fmtFcfa(c.amount)}</div>
                  </div>
                ))}
                <div className="flex justify-between bg-red-50 px-4 py-2 font-bold text-red-800">
                  <span>{t('emergencyVisit.total_open_tab')}</span>
                  <span>{fmtFcfa(totalCharges)}</span>
                </div>
              </>
            )}
          </Section>

          {visit.mlc_flag || mlc ? (
            <Section
              title={t('emergencyVisit.mlc_title')}
              icon="⚖️"
              badge={mlc?.mlc_number ? <span className="font-mono text-xs">{mlc.mlc_number}</span> : null}
            >
              <div className="p-4">
                {mlc?.locked ? (
                  <div className="mb-3 flex items-center justify-between rounded-lg bg-slate-800 px-4 py-3 text-sm font-bold text-white">
                    <span>{t('emergencyVisit.mlc_locked')}</span>
                    <a href={`/emergency/mlc/print/${visit.id}`} target="_blank" rel="noreferrer" className="hms-btn hms-btn-light text-xs">
                      {t('emergencyVisit.print_copies')}
                    </a>
                  </div>
                ) : null}

                <form method="POST" action="/emergency/mlc">
                  <input type="hidden" name="visit_id" value={visit.id} />
                  <fieldset disabled={!!mlc?.locked} className="border-0 p-0 m-0 min-w-0">
                    <div className="mb-3 grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-bold">{t('emergencyVisit.case_type')}</label>
                        <select name="case_type" className="hms-input w-full text-sm" defaultValue={mlc?.case_type || 'other'}>
                          {CASE_TYPE_KEYS.map(([v, lblKey]) => (
                            <option key={v} value={v}>
                              {t(`emergencyVisit.${lblKey}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold">{t('emergencyVisit.incident_time')}</label>
                        <input
                          type="datetime-local"
                          name="incident_at"
                          className="hms-input w-full text-sm"
                          defaultValue={mlc?.incident_at ? new Date(mlc.incident_at).toISOString().slice(0, 16) : ''}
                        />
                      </div>
                      {[
                        ['incident_place', 'incident_place'],
                        ['brought_by', 'brought_by'],
                        ['police_station', 'police_station'],
                        ['officer_name', 'officer_name'],
                      ].map(([name, lblKey]) => (
                        <div key={name}>
                          <label className="mb-1 block text-xs font-bold">{t(`emergencyVisit.${lblKey}`)}</label>
                          <input type="text" name={name} className="hms-input w-full text-sm" defaultValue={mlc?.[name] || ''} />
                        </div>
                      ))}
                    </div>
                    {[
                      ['narrative', 'narrative'],
                      ['examination', 'examination'],
                      ['injuries', 'injuries'],
                    ].map(([name, lblKey]) => (
                      <div key={name} className="mb-3">
                        <label className="mb-1 block text-xs font-bold">{t(`emergencyVisit.${lblKey}`)}</label>
                        <textarea name={name} className="hms-input w-full text-sm" rows={2} defaultValue={mlc?.[name] || ''} />
                      </div>
                    ))}
                    <div className="mb-3">
                      <label className="mb-1 block text-xs font-bold">{t('emergencyVisit.provisional_dx')}</label>
                      <input type="text" name="provisional_dx" className="hms-input w-full text-sm" defaultValue={mlc?.provisional_dx || ''} />
                    </div>
                    {!mlc?.locked ? (
                      <button type="submit" className="hms-btn hms-btn-secondary text-sm">
                        <i className="fa fa-save" aria-hidden="true" />
                        {t('emergencyVisit.save_mlc')}
                      </button>
                    ) : null}
                  </fieldset>
                </form>

                {mlc && !mlc.locked ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form method="POST" action="/emergency/mlc/notify-police">
                      <input type="hidden" name="visit_id" value={visit.id} />
                      <button type="submit" className="hms-btn hms-btn-outline-primary text-sm" disabled={!!mlc.police_notified_at}>
                        <i className="fa fa-phone" aria-hidden="true" />
                        {mlc.police_notified_at
                          ? t('emergencyVisit.police_notified_at', { time: new Date(mlc.police_notified_at).toLocaleString() })
                          : t('emergencyVisit.notify_police')}
                      </button>
                    </form>
                    <form method="POST" action="/emergency/mlc/lock" onSubmit={confirmMlcLock}>
                      <input type="hidden" name="visit_id" value={visit.id} />
                      <button type="submit" className="hms-btn hms-btn-dark text-sm">
                        {t('emergencyVisit.sign_lock')}
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            </Section>
          ) : null}
        </div>
      </div>

      <OrderModal
        open={orderOpen}
        onClose={() => setOrderOpen(false)}
        visitId={visit.id}
        erClosed={erClinicalLocked}
        title={t('emergencyVisit.order_modal_new')}
        action="/emergency/order"
        submitLabel={t('emergencyVisit.place_order')}
        formId="er-order-new-form"
        t={t}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-bold">
              {t('emergencyVisit.order_type')} <span className="text-red-600">*</span>
            </label>
            <select
              name="order_type"
              className="hms-input w-full"
              required
              value={newOrderType}
              onChange={(e) => setNewOrderType(e.target.value)}
            >
              <option value="lab">{t('emergencyVisit.order_type_lab')}</option>
              <option value="radiology">{t('emergencyVisit.order_type_radiology')}</option>
              <option value="pharmacy">{t('emergencyVisit.order_type_pharmacy')}</option>
              <option value="blood_bank">{t('emergencyVisit.order_type_blood_bank')}</option>
              <option value="procedure">{t('emergencyVisit.order_type_procedure')}</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold">{t('emergencyVisit.priority')}</label>
            <select name="priority" className="hms-input w-full" defaultValue="stat">
              <option value="stat">{t('emergencyVisit.priority_stat')}</option>
              <option value="urgent">{t('emergencyVisit.priority_urgent')}</option>
              <option value="routine">{t('emergencyVisit.priority_routine')}</option>
            </select>
          </div>
        </div>
        <ErOrderCatalogFields orderType={newOrderType} t={t} />
      </OrderModal>

      <OrderModal
        open={!!updateOrder}
        onClose={() => setUpdateOrder(null)}
        visitId={visit.id}
        erClosed={erClinicalLocked}
        title={t('emergencyVisit.order_modal_update')}
        action="/emergency/order/update"
        submitLabel={t('common:actions.save')}
        formId="er-order-update-form"
        t={t}
      >
        <input type="hidden" name="order_id" value={updateOrder?.id || ''} />
        <div className="mb-2 font-bold">
          {updateOrder ? `${String(updateOrder.order_type).toUpperCase()} · ${updateOrder.description}` : ''}
        </div>
        <label className="mb-1 block text-xs font-bold">{t('emergencyVisit.order_status')}</label>
        <select name="status" className="hms-input mb-3 w-full" defaultValue={updateOrder?.status || 'ordered'}>
          <option value="ordered">{t('emergencyVisit.order_status_ordered')}</option>
          <option value="sample_collected">{t('emergencyVisit.order_status_sample_collected')}</option>
          <option value="in_progress">{t('emergencyVisit.order_status_in_progress')}</option>
          <option value="completed">{t('emergencyVisit.order_status_completed')}</option>
          <option value="cancelled">{t('emergencyVisit.order_status_cancelled')}</option>
        </select>
        <label className="mb-1 block text-xs font-bold">{t('emergencyVisit.result_summary')}</label>
        <textarea name="result_summary" className="hms-input mb-3 w-full" rows={3} defaultValue={updateOrder?.result_summary || ''} />
        <label className="flex items-center gap-2 text-sm font-bold text-red-700">
          <input type="checkbox" name="critical_alert" value="1" defaultChecked={!!updateOrder?.critical_alert} />
          {t('emergencyVisit.critical_result')}
        </label>
      </OrderModal>
      </div>
    </div>
  );
}
