import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionMenu } from '../components/ActionMenu';
import { FlashMessages } from '../components/FlashMessages';
import { Pager } from '../components/Pager';
import { SearchField } from '../components/SearchField';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { SurfaceHero } from '../components/SurfaceHero';
import { useClientPagination } from '../hooks/useClientPagination';
import { confirmModal } from '../lib/modalBridge';
import { formatDate, hasPerm, patientTypeBadge, patientTypeLabel } from '../lib/listUi';
import { DEFAULT_PAGE_SIZE } from '../lib/pagination';
import { EditPatientModal } from '../modals/EditPatientModal';
import { RegisterPatientModal } from '../modals/RegisterPatientModal';

function initials(fn, ln) {
  return `${(fn || '')[0] || ''}${(ln || '')[0] || ''}`.toUpperCase() || 'P';
}

function postAction(url) {
  const f = document.createElement('form');
  f.method = 'POST';
  f.action = url;
  document.body.appendChild(f);
  f.submit();
}

export function PatientsPageApp({
  patients = [],
  patientTotal = 0,
  flash = null,
  error = null,
  userPerms = [],
  canWrite = false,
  canDeletePatient = false,
  fromMaternity = false}) {
  const { t } = useTranslation('ops');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [registerPrefill, setRegisterPrefill] = useState({ name: '', phone: '' });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search || '');
    const fromMat = fromMaternity || String(params.get('from') || '').toLowerCase() === 'maternity';
    setRegisterPrefill({
      name: String(params.get('prefill_name') || '').trim(),
      phone: String(params.get('prefill_phone') || '').trim(),
    });
    if (/[\?&]action=new(?:&|$)/.test(window.location.search || '') || fromMat) {
      setRegisterOpen(true);
    }
  }, [fromMaternity]);

  const can = (keys) => hasPerm(userPerms, keys);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return patients.filter((p) => {
      if (selectedId) return String(p.id) === String(selectedId);
      if (!q) return true;
      const code = p.patient_code || `#P-${p.id}`;
      const hay = [p.first_name, p.last_name, p.phone, p.email, code, p.id, p.gender, p.patient_type]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [patients, search, selectedId]);

  const { setPage, pager, rows: pageRows } = useClientPagination(rows, {
    pageSize,
    resetKeys: [search, selectedId, pageSize]});

  const openEdit = (id) => {
    setEditId(id);
    setEditOpen(true);
  };

  const confirmDelete = async (id, name) => {
    const ok = await confirmModal({
      title: t('patients.delete_title'),
      message: t('patients.delete_msg', { name }),
      confirmLabel: t('patients.delete_confirm'),
      tone: 'danger'});
    if (ok) postAction(`/patients/${id}/delete`);
  };

  const confirmCredit = async (id, name) => {
    const ok = await confirmModal({
      title: t('patients.credit_title'),
      message: t('patients.credit_msg', { name }),
      confirmLabel: t('patients.credit_confirm')});
    if (ok) postAction(`/patients/${id}/open-credit`);
  };

  const menuItems = (p) => {
    const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || `Patient #${p.id}`;
    const items = [];
    if (can(['patient.directory.chart', 'chart.read', 'patient.read'])) {
      items.push({
        href: `/patient-chart/${p.id}`,
        label: t('patients.view_chart'),
        icon: <span className="text-brand">📁</span>});
    }
    if (can(['patient.directory.insurance', 'insurance.read'])) {
      items.push({
        href: `/patients/${p.id}/insurance`,
        label: t('patients.manage_insurance'),
        icon: <span className="text-brand">🛡</span>});
    }
    if (can(['patient.directory.credit', 'credit.read', 'credit.write'])) {
      items.push({
        href: '#',
        label: t('patients.open_credit'),
        icon: <span className="text-emerald-600">💳</span>,
        onClick: (e) => {
          e.preventDefault();
          confirmCredit(p.id, name);
        }});
    }
    if (can(['patient.directory.edit', 'patient.write'])) {
      items.push({
        href: '#',
        label: t('patients.edit_profile'),
        icon: <span className="text-brand">✎</span>,
        onClick: (e) => {
          e.preventDefault();
          openEdit(p.id);
        }});
    }
    if (canDeletePatient) {
      items.push({
        href: '#',
        label: t('patients.delete'),
        icon: <span className="text-red-500">🗑</span>,
        danger: true,
        onClick: (e) => {
          e.preventDefault();
          confirmDelete(p.id, name);
        }});
    }
    return items;
  };

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-8 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero icon="address-book" title={t('patients.title')} subtitle={t('patients.subtitle')}>
          <div className="hms-surface-hero-actions mt-4">
            <a
              href={`/patients/print-list${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hms-btn-secondary text-xs"
            >
              {t('patients.export_pdf')}
            </a>
            <a href="/admin/patient-duplicates" className="hms-btn-secondary text-xs">
              {t('patients.merge_review')}
            </a>
            {canWrite ? (
              <button type="button" className="hms-btn-primary text-xs" onClick={() => setRegisterOpen(true)}>
                {t('patients.register')}
              </button>
            ) : null}
          </div>
        </SurfaceHero>

        {canDeletePatient ? (
          <p className="mb-4 text-xs text-slate-500">{t('patients.delete_hint')}</p>
        ) : null}

        <div className="hms-compact-kpi-grid hms-compact-kpi-grid--3 mb-3">
          <StatCard label={t('patients.stat_total')} value={patientTotal || patients.length} tone="brand" icon="users" />
          <StatCard label={t('patients.stat_filtered')} value={rows.length} tone="default" icon="search" />
          <StatCard label={t('patients.stat_on_page')} value={pageRows.length} tone="brand" icon="list" />
        </div>

        <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SearchField
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedId(null);
              }}
              placeholder={t('patients.search_ph')}
            />
            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              {t('patients.total_count', {
                total: patientTotal,
                count: rows.length,
                matchLabel: rows.length === 1 ? t('shared.match') : t('shared.matches')})}
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('patients.col_id')}</th>
                  <th className="px-4 py-3">{t('patients.col_name')}</th>
                  <th className="px-4 py-3">{t('patients.col_contact')}</th>
                  <th className="px-4 py-3">{t('patients.col_gender')}</th>
                  <th className="px-4 py-3">{t('patients.col_type')}</th>
                  <th className="px-4 py-3">{t('patients.col_registered')}</th>
                  <th className="px-4 py-3 text-right">{t('patients.col_action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                      {t('patients.empty')}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((p) => {
                    const fn = p.first_name || '';
                    const ln = p.last_name || '';
                    const fullName = `${fn} ${ln}`.trim();
                    const code = p.patient_code || `#P-${p.id}`;
                    const pt = patientTypeBadge(p.patient_type);
                    const items = menuItems(p);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-semibold text-brand">{code}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-light text-xs font-bold text-brand">
                              {initials(fn, ln)}
                            </div>
                            <span className="font-semibold text-ink">{fullName || t('patients.fallback_name', { id: p.id })}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-ink">{p.phone || '—'}</div>
                          <div className="text-xs text-slate-500">{p.email || ''}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs">{p.gender || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge variant={pt.variant} label={patientTypeLabel(t, p.patient_type)} />
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{formatDate(p.created_at)}</td>
                        <td className="px-4 py-3 text-right">{items.length ? <ActionMenu items={items} /> : null}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pager
            pager={pager}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </div>
      </div>

      <RegisterPatientModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        fromMaternity={fromMaternity}
        prefillName={registerPrefill.name}
        prefillPhone={registerPrefill.phone}
      />
      <EditPatientModal
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditId(null);
        }}
        patientId={editId}
      />
    </div>
  );
}
