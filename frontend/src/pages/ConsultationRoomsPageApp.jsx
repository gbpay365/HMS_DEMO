import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { StatCard } from '../components/StatCard';
import { SurfaceHero } from '../components/SurfaceHero';

const ROOM_COLORS = ['#0ea5e9', '#0891b2', '#1a6bd8', '#7c3aed', '#059669', '#d97706'];

function roomAccent(code, index) {
  const str = String(code || index);
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return ROOM_COLORS[Math.abs(hash) % ROOM_COLORS.length];
}

function doctorLabel(d) {
  return `Dr. ${d.first_name || ''} ${d.last_name || ''}`.trim();
}

function FieldLabel({ icon, children }) {
  return (
    <label className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
      <i className={`fa ${icon} text-sky-600`} aria-hidden="true" />
      {children}
    </label>
  );
}

function DoctorPicker({ doctors, name, selectedIds = [], compact = false }) {
  const { t } = useTranslation('legacy');
  const selected = new Set((selectedIds || []).map(String));

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-slate-50/80 ${compact ? 'p-2' : 'p-3'}`}
      style={{ maxHeight: compact ? 160 : 200, overflowY: 'auto' }}
    >
      {!doctors.length ? (
        <p className="text-center text-sm text-slate-400">
          <i className="fa fa-user-md mb-2 block text-2xl" aria-hidden="true" />
          {t('admin_consultation_rooms.no_doctors')}
        </p>
      ) : (
        <div className="space-y-1.5">
          {doctors.map((d) => (
            <label
              key={d.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-transparent bg-white px-3 py-2 text-sm shadow-sm transition hover:border-sky-200 hover:bg-sky-50/50"
            >
              <input
                type="checkbox"
                name={name}
                value={d.id}
                defaultChecked={selected.has(String(d.id))}
                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-cyan-700 text-xs font-bold text-white">
                {(d.first_name || '?')[0]}
                {(d.last_name || '?')[0]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-ink">
                  {d.last_name}, {d.first_name}
                </span>
                {d.primary_department ? (
                  <span className="ml-1 text-xs text-slate-500">· {d.primary_department}</span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">
        {t('admin_consultation_rooms.checkbox_hint')}
      </p>
    </div>
  );
}

export function ConsultationRoomsPageApp({
  rooms = [],
  doctors = [],
  flash = null,
  error = null}) {
  const { t } = useTranslation('legacy');
  const [editingId, setEditingId] = useState(null);

  const stats = useMemo(() => {
    const active = rooms.filter((r) => r.status);
    const withDoctors = rooms.filter((r) => (r.room_doctors || []).length > 0);
    const departments = new Set(rooms.map((r) => r.department).filter(Boolean));
    return {
      total: rooms.length,
      active: active.length,
      withDoctors: withDoctors.length,
      departments: departments.size};
  }, [rooms]);

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-10 pt-2 sm:px-6">
        <FlashMessages flash={flash} error={error} />

        <SurfaceHero
          icon="door-open"
          title={t('admin_consultation_rooms.title')}
          subtitle={t('admin_consultation_rooms.subtitle')}
        >
          <div className="hms-surface-hero-actions mt-4">
            <a href="/opd-queue" className="hms-btn-secondary text-xs">
              <i className="fa fa-list-alt" aria-hidden="true" />
              {t('admin_consultation_rooms.opd_queue')}
            </a>
          </div>
        </SurfaceHero>

        <div className="hms-compact-kpi-grid mb-4">
          <StatCard
            label={t('admin_consultation_rooms.stat_total')}
            value={stats.total}
            tone="brand"
          />
          <StatCard
            label={t('admin_consultation_rooms.stat_active')}
            value={stats.active}
          />
          <StatCard
            label={t('admin_consultation_rooms.stat_with_doctors')}
            value={stats.withDoctors}
          />
          <StatCard
            label={t('admin_consultation_rooms.stat_departments')}
            value={stats.departments}
          />
        </div>

        <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-lg text-sky-700">
              <i className="fa fa-plus-circle" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-extrabold text-ink">
                {t('admin_consultation_rooms.add_room')}
              </h2>
              <p className="text-xs text-slate-500">
                {t('admin_consultation_rooms.add_hint')}
              </p>
            </div>
          </div>

          <form method="POST" action="/admin/consultation-rooms/add" className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-2">
              <FieldLabel icon="fa-hashtag">
                {t('admin_consultation_rooms.label_code')}
              </FieldLabel>
              <input
                name="code"
                required
                maxLength={40}
                placeholder={t('admin_consultation_rooms.code_placeholder')}
                className="hms-input w-full"
              />
            </div>
            <div className="lg:col-span-3">
              <FieldLabel icon="fa-tag">
                {t('admin_consultation_rooms.label_display_name')}
              </FieldLabel>
              <input
                name="name"
                required
                maxLength={160}
                placeholder={t('admin_consultation_rooms.name_placeholder')}
                className="hms-input w-full"
              />
            </div>
            <div className="lg:col-span-2">
              <FieldLabel icon="fa-sitemap">
                {t('admin_consultation_rooms.label_department')}
              </FieldLabel>
              <input
                name="department"
                maxLength={120}
                placeholder={t('admin_consultation_rooms.optional')}
                className="hms-input w-full"
              />
            </div>
            <div className="lg:col-span-1">
              <FieldLabel icon="fa-sort-numeric-asc">
                {t('admin_consultation_rooms.label_sort')}
              </FieldLabel>
              <input type="number" name="sort_order" defaultValue={0} className="hms-input w-full" />
            </div>
            <div className="lg:col-span-3">
              <FieldLabel icon="fa-user-md">
                {t('admin_consultation_rooms.label_doctors')}
              </FieldLabel>
              <DoctorPicker doctors={doctors} name="assigned_doctor_ids" />
            </div>
            <div className="flex items-end lg:col-span-1">
              <button type="submit" className="hms-btn-primary w-full py-3 text-sm font-bold">
                <i className="fa fa-check mr-2" aria-hidden="true" />
                {t('admin_consultation_rooms.add')}
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                <i className="fa fa-building" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-extrabold text-ink">
                  {t('admin_consultation_rooms.configured_rooms')}
                </h2>
                <p className="text-xs text-slate-500">
                  {t('admin_consultation_rooms.rooms_count', {
                    count: rooms.length})}
                </p>
              </div>
            </div>
          </div>

          {!rooms.length ? (
            <div className="px-6 py-16 text-center text-slate-400">
              <i className="fa fa-door-open mb-3 block text-4xl text-sky-200" aria-hidden="true" />
              <p className="font-semibold text-slate-600">
                {t('admin_consultation_rooms.no_rooms')}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm">
                {t('admin_consultation_rooms.no_rooms_hint')}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 p-5 lg:grid-cols-2">
              {rooms.map((room, index) => {
                const accent = roomAccent(room.code, index);
                const isEditing = editingId === room.id;
                const roomDoctors = room.room_doctors || [];

                return (
                  <div
                    key={room.id}
                    className={`overflow-hidden rounded-2xl border transition ${room.status ? 'border-slate-100 bg-white' : 'border-slate-200 bg-slate-50 opacity-80'}`}
                    style={{ boxShadow: '0 4px 20px rgba(15,23,42,0.06)' }}
                  >
                    <div
                      className="flex items-start justify-between gap-3 px-4 py-4"
                      style={{
                        background: `linear-gradient(135deg, ${accent}18, transparent 70%)`,
                        borderBottom: `1px solid ${accent}22`}}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg text-white shadow-sm"
                          style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}
                        >
                          <i className="fa fa-door-open" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <code
                              className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white"
                              style={{ backgroundColor: accent }}
                            >
                              {room.code}
                            </code>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${room.status ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}
                            >
                              {room.status
                                ? t('admin_consultation_rooms.status_active')
                                : t('admin_consultation_rooms.status_inactive')}
                            </span>
                          </div>
                          <h3 className="mt-1 truncate text-lg font-extrabold text-ink">{room.name}</h3>
                          {room.department ? (
                            <p className="text-xs text-slate-500">
                              <i className="fa fa-sitemap mr-1" aria-hidden="true" />
                              {room.department}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingId(isEditing ? null : room.id)}
                        className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-sky-300 hover:text-sky-700"
                      >
                        <i className={`fa ${isEditing ? 'fa-times' : 'fa-pencil'} mr-1`} aria-hidden="true" />
                        {isEditing
                          ? t('admin_consultation_rooms.cancel')
                          : t('admin_consultation_rooms.edit')}
                      </button>
                    </div>

                    <div className="space-y-3 px-4 py-4">
                      <div>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          <i className="fa fa-user-md mr-1" aria-hidden="true" />
                          {t('admin_consultation_rooms.col_doctors')}
                        </p>
                        {roomDoctors.length ? (
                          <div className="flex flex-wrap gap-2">
                            {roomDoctors.map((d) => (
                              <span
                                key={d.id}
                                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                                style={{ backgroundColor: accent }}
                              >
                                <i className="fa fa-stethoscope" aria-hidden="true" />
                                {doctorLabel(d)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        <i className="fa fa-sort-numeric-asc mr-1" aria-hidden="true" />
                        {t('admin_consultation_rooms.sort_order')}:{' '}
                        <strong>{room.sort_order}</strong>
                      </p>
                    </div>

                    {isEditing ? (
                      <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-4">
                        <form
                          method="POST"
                          action={`/admin/consultation-rooms/${room.id}/update`}
                          className="space-y-4"
                        >
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <FieldLabel icon="fa-tag">
                                {t('admin_consultation_rooms.col_name')}
                              </FieldLabel>
                              <input
                                name="name"
                                required
                                defaultValue={room.name}
                                maxLength={160}
                                className="hms-input w-full"
                              />
                            </div>
                            <div>
                              <FieldLabel icon="fa-sitemap">
                                {t('admin_consultation_rooms.label_department')}
                              </FieldLabel>
                              <input
                                name="department"
                                defaultValue={room.department || ''}
                                maxLength={120}
                                className="hms-input w-full"
                              />
                            </div>
                            <div>
                              <FieldLabel icon="fa-sort-numeric-asc">
                                {t('admin_consultation_rooms.label_sort')}
                              </FieldLabel>
                              <input
                                type="number"
                                name="sort_order"
                                defaultValue={room.sort_order}
                                className="hms-input w-full"
                              />
                            </div>
                            <div>
                              <FieldLabel icon="fa-toggle-on">
                                {t('admin_consultation_rooms.col_active')}
                              </FieldLabel>
                              <select name="status" defaultValue={room.status ? '1' : '0'} className="hms-input w-full">
                                <option value="1">{t('admin_consultation_rooms.yes')}</option>
                                <option value="0">{t('admin_consultation_rooms.no')}</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <FieldLabel icon="fa-user-md">
                              {t('admin_consultation_rooms.label_doctors')}
                            </FieldLabel>
                            <DoctorPicker
                              doctors={doctors}
                              name="assigned_doctor_ids"
                              selectedIds={room.attached_doctor_ids || []}
                              compact
                            />
                          </div>
                          <button type="submit" className="hms-btn-primary px-5 py-2.5 text-sm font-bold">
                            <i className="fa fa-save mr-2" aria-hidden="true" />
                            {t('admin_consultation_rooms.save')}
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
