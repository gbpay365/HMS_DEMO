import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { notifyError } from '../lib/notifyBridge';
import { WardBedCard } from '../components/ward/WardBedCard';
import { FlashMessages } from '../components/FlashMessages';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';
import { formatFcfa, ipdStatusPillLocalized } from '../lib/wardUi';
import {
  WardAdmitModal,
  WardCallDischargeModal,
  WardDischargeModal,
  WardManageBedsModal,
  WardMessageModal} from '../modals/WardModals';

export function WardsPageApp({
  grouped = {},
  wardNames = [],
  bedCount = 0,
  pendingBed = [],
  activeAdmissions = [],
  flash = null,
  error = null,
  userRole = ''}) {
  const { t } = useTranslation('ipd');
  const dragRef = useRef(null);
  const wards = useMemo(() => Object.keys(grouped || {}), [grouped]);

  const stats = useMemo(() => {
    let total = 0;
    let avail = 0;
    let occ = 0;
    let hk = 0;
    wards.forEach((w) => {
      (grouped[w] || []).forEach((b) => {
        total += 1;
        if (b.status === 'occupied') occ += 1;
        else if (b.status === 'available') avail += 1;
        else hk += 1;
      });
    });
    return { total, avail, occ, hk };
  }, [grouped, wards]);

  const availableBeds = useMemo(() => {
    const out = [];
    wards.forEach((w) => {
      (grouped[w] || []).forEach((b) => {
        if (b.status === 'available') out.push({ ...b, ward_name: w });
      });
    });
    return out;
  }, [grouped, wards]);

  const [admitBed, setAdmitBed] = useState(null);
  const [pendingPatient, setPendingPatient] = useState(null);
  const [manageWard, setManageWard] = useState(null);
  const [dcModal, setDcModal] = useState(null);
  const [callDcModal, setCallDcModal] = useState(null);
  const [addBedOpen, setAddBedOpen] = useState(false);
  const [msgModal, setMsgModal] = useState(null);

  const onDragStart = (ev, admissionId) => {
    dragRef.current = admissionId;
    try {
      ev.dataTransfer.setData('text/plain', JSON.stringify({ admission_id: admissionId }));
    } catch {
      /* ignore */
    }
  };

  const onTransferDrop = async (ev, toBedId) => {
    let admissionId = dragRef.current;
    try {
      const raw = ev.dataTransfer.getData('text/plain');
      if (raw) admissionId = JSON.parse(raw).admission_id || admissionId;
    } catch {
      /* ignore */
    }
    dragRef.current = null;
    if (!admissionId || !toBedId) return;
    try {
      const r = await fetch('/wards/transfer-patient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ admission_id: admissionId, to_bed_id: toBedId })});
      const d = await r.json();
      if (!d.ok) {
        notifyError(d.error || t('wards.transfer_failed'));
        return;
      }
      window.location.reload();
    } catch {
      notifyError(t('wards.transfer_failed'));
    }
  };

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-10 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero icon="bed" title={t('wards.title')} subtitle={`${t('wards.subtitle')} ${t('wards.hub_link')}`}>
          <div className="hms-surface-hero-actions mt-4">
            <a href="/ipd" className="hms-btn-primary text-xs">
              {t('wards.ipd_hub')}
            </a>
            <a href="/cashier/ipd-settle" className="hms-btn-secondary text-xs">
              {t('wards.ipd_settle')}
            </a>
            <button type="button" className="hms-btn-secondary text-xs" onClick={() => setAddBedOpen(true)}>
              {t('wards.manage_beds')}
            </button>
            <a href="/ipd/handover" className="hms-btn-secondary text-xs">
              <i className="fa fa-exchange mr-1" aria-hidden="true" />
              {t('handover.short_label')}
            </a>
            <a href="/nursing/supply-requests" className="hms-btn-secondary text-xs">
              <i className="fa fa-medkit mr-1" aria-hidden="true" />
              {t('supply.short_label')}
            </a>
            <a href="/ipd/ward-rounds" className="hms-btn-secondary text-xs">
              {t('census.ward_rounds')}
            </a>
            <a href="/ipd/census" className="hms-btn-secondary text-xs">
              {t('hub.menu_census')}
            </a>
            <a href="/wards" className="hms-btn-secondary text-xs">
              {t('wards.refresh')}
            </a>
          </div>
        </SurfaceHero>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t('wards.kpi_total')} value={stats.total || bedCount} tone="brand" icon="bed" />
          <StatCard label={t('wards.kpi_avail')} value={stats.avail} tone="brand" icon="check-circle" />
          <StatCard label={t('wards.kpi_occupied')} value={stats.occ} tone="warning" icon="user" />
          <StatCard label={t('wards.kpi_hk')} value={stats.hk} tone="default" icon="refresh" />
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            {wards.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-500">
                {t('wards.no_wards')}
              </div>
            ) : (
              wards.map((wardName) => (
                <div key={wardName} className="mb-4 rounded-2xl border border-slate-100 bg-white shadow-card">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50"
                    onClick={() => setManageWard(wardName)}
                  >
                    <div>
                      <h2 className="font-bold text-ink">{wardName}</h2>
                      <p className="text-xs text-slate-500">{t('wards.click_manage')}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">
                      {t('shared.beds', { count: (grouped[wardName] || []).length })}
                    </span>
                  </button>
                  <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                    {(grouped[wardName] || []).map((bed) => (
                      <WardBedCard
                        key={bed.id}
                        bed={{ ...bed, ward_name: wardName }}
                        userRole={userRole}
                        onAdmit={(b) => {
                          setAdmitBed({ ...b, ward_name: wardName });
                        }}
                        onClinicalDc={(b) =>
                          setDcModal({ id: b.admission_id, name: `${b.first_name} ${b.last_name}` })
                        }
                        onCallDischarge={(b) =>
                          setCallDcModal({ id: b.admission_id, name: `${b.first_name} ${b.last_name}` })
                        }
                        onMessage={(b) =>
                          setMsgModal({ id: b.admission_id, name: `${b.first_name} ${b.last_name}` })
                        }
                        onDragStart={onDragStart}
                        onTransferDrop={onTransferDrop}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="lg:col-span-4">
            {pendingBed.length > 0 ? (
              <div className="mb-4 rounded-2xl border-2 border-orange-300 bg-orange-50/50 p-4 shadow-card">
                <h3 className="mb-2 font-bold text-orange-900">
                  {t('wards.awaiting_bed', { count: pendingBed.length })}
                </h3>
                <div className="space-y-3">
                  {pendingBed.map((pb) => (
                    <div key={pb.id} className="flex items-start justify-between gap-2 rounded-xl border border-orange-200 bg-white p-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold">{pb.patient_name}</div>
                        <div className="text-xs text-slate-500">{pb.admitting_diagnosis?.slice(0, 60) || t('wards.admission_order')}</div>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-lg bg-orange-500 px-2 py-1 text-[10px] font-bold text-white"
                        onClick={() => {
                          setPendingPatient(pb);
                          setAdmitBed(null);
                        }}
                      >
                        {t('shared.assign')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="sticky top-20 rounded-2xl border border-slate-100 bg-white shadow-card">
              <div className="border-b border-slate-100 px-4 py-3 font-bold text-ink">
                {t('wards.active_admissions', { count: activeAdmissions.length })}
              </div>
              <div className="max-h-[600px] space-y-2 overflow-y-auto p-3">
                {activeAdmissions.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500">{t('wards.no_active')}</p>
                ) : (
                  activeAdmissions.map((a) => {
                    const pill = ipdStatusPillLocalized(a.ipd_status, t);
                    return (
                      <div key={a.id} className="flex gap-3 rounded-xl border border-slate-100 p-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">
                          {(a.first_name || '?')[0]}
                          {(a.last_name || '?')[0]}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold text-sm">
                            {a.first_name} {a.last_name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {a.ward_name} · {a.bed_label} · {t('shared.day_n', { n: a.los_days || 0 })}
                          </div>
                          <span className={`mt-1 inline-block ${pill.className}`}>{pill.label}</span>
                          <div className="mt-1 text-xs font-bold text-red-600">
                            {formatFcfa(a.running_bill)}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            <a href={`/patient-chart/${a.patient_id}`} className="text-[10px] text-brand hover:underline">
                              {t('shared.chart')}
                            </a>
                            <a href={`/ipd/running-bill/${a.id}`} className="text-[10px] text-brand hover:underline">
                              {t('shared.forecast')}
                            </a>
                            <a href={`/ipd/treatment/${a.id}`} className="text-[10px] text-brand hover:underline">
                              {t('shared.tx')}
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        <WardAdmitModal
          open={!!admitBed || !!pendingPatient}
          onClose={() => {
            setAdmitBed(null);
            setPendingPatient(null);
          }}
          bed={admitBed}
          pendingPatient={pendingPatient}
          availableBeds={availableBeds}
        />
        <WardDischargeModal
          open={!!dcModal}
          onClose={() => setDcModal(null)}
          mode="clinical"
          admissionId={dcModal?.id}
          patientName={dcModal?.name}
        />
        <WardCallDischargeModal
          open={!!callDcModal}
          onClose={() => setCallDcModal(null)}
          admissionId={callDcModal?.id}
          patientName={callDcModal?.name}
        />
        <WardManageBedsModal
          open={!!manageWard}
          onClose={() => setManageWard(null)}
          wardName={manageWard || ''}
          beds={manageWard ? grouped[manageWard] || [] : []}
        />
        {addBedOpen ? (
          <WardManageBedsModal open onClose={() => setAddBedOpen(false)} wardName={wardNames[0] || t('pages.general_ward')} beds={[]} />
        ) : null}
        <WardMessageModal
          open={!!msgModal}
          onClose={() => setMsgModal(null)}
          admissionId={msgModal?.id}
          patientName={msgModal?.name}
        />
      </div>
    </div>
  );
}
