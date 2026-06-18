import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '../FormField';
import { Modal } from '../Modal';
import { ModalCancelButton, ModalSubmitButton } from '../ModalActions';
import { aclModuleLabel, aclPermLabel, aclRoleLabel } from '../../lib/aclI18n';
import { aclPost } from '../../lib/aclApi';
import { confirmModal } from '../../lib/modalBridge';
import { notifyError } from '../../lib/notifyBridge';

function PermModal({ open, perm, onClose, onSaved }) {
  const { t } = useTranslation(['access', 'superAdmin']);
  const [form, setForm] = useState({ id: '', code: '', label: '', gap_area: 0 });

  useEffect(() => {
    if (open) setForm(perm || { id: '', code: '', label: '', gap_area: 0 });
  }, [open, perm]);

  const save = () => {
    const act = form.id ? 'perm_edit' : 'perm_add';
    aclPost(act, {
      id: form.id,
      code: form.code,
      label: form.label,
      gap_area: form.gap_area}).then((j) => {
      if (j.ok) onSaved();
      else notifyError(j.error || t('shared.failed'));
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={form.id ? t('catalogue.edit_perm') : t('catalogue.add_perm')}
      size="md"
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <ModalSubmitButton type="button" onClick={save} />
        </>
      }
    >
      <div className="space-y-3">
        <FormField label={t('shared.code')} htmlFor="acl-perm-code">
          <input
            id="acl-perm-code"
            className="hms-input w-full"
            value={form.code}
            onChange={(ev) => setForm((f) => ({ ...f, code: ev.target.value }))}
            placeholder={t('catalogue.code_ph')}
          />
        </FormField>
        <FormField label={t('shared.label')} htmlFor="acl-perm-label">
          <input
            id="acl-perm-label"
            className="hms-input w-full"
            value={form.label}
            onChange={(ev) => setForm((f) => ({ ...f, label: ev.target.value }))}
          />
        </FormField>
        <FormField label={t('catalogue.group_area')} htmlFor="acl-perm-gap">
          <input
            id="acl-perm-gap"
            type="number"
            className="hms-input w-full"
            value={form.gap_area}
            onChange={(ev) => setForm((f) => ({ ...f, gap_area: ev.target.value }))}
          />
        </FormField>
      </div>
    </Modal>
  );
}

function RoleModal({ open, role, roles, onClose, onSaved }) {
  const { t } = useTranslation(['access', 'superAdmin']);
  const [title, setTitle] = useState('');
  const [cloneFrom, setCloneFrom] = useState('');

  useEffect(() => {
    if (open) {
      setTitle(role?.title || '');
      setCloneFrom('');
    }
  }, [open, role]);

  const save = () => {
    if (!title.trim()) {
      notifyError(t('shared.title_required'));
      return;
    }
    const payload = role?.role
      ? { action: 'role_edit', role_id: role.role, title: title.trim() }
      : { action: 'role_add', title: title.trim(), clone_from: cloneFrom };
    aclPost(payload.action, payload).then((j) => {
      if (j.ok) {
        window.location.href = `/hms-admin/access?role=${encodeURIComponent(j.role || role?.role || '')}&view=catalogue`;
      } else notifyError(j.error || t('shared.failed'));
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={role?.role ? t('catalogue.edit_role') : t('catalogue.new_role')}
      size="md"
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <ModalSubmitButton type="button" onClick={save} />
        </>
      }
    >
      <div className="space-y-3">
        <FormField label={t('catalogue.role_title_label')} htmlFor="acl-role-title" required>
          <input id="acl-role-title" className="hms-input w-full" value={title} onChange={(ev) => setTitle(ev.target.value)} />
        </FormField>
        {!role?.role ? (
          <FormField label={t('catalogue.clone_from')} htmlFor="acl-role-clone">
            <select id="acl-role-clone" className="hms-input w-full" value={cloneFrom} onChange={(ev) => setCloneFrom(ev.target.value)}>
              <option value="">{t('catalogue.empty_role')}</option>
              {(roles || []).map((r) => (
                <option key={r.role} value={r.role}>
                  {aclRoleLabel(r.role, r.title, t)} (#{r.role})
                </option>
              ))}
            </select>
          </FormField>
        ) : null}
      </div>
    </Modal>
  );
}

export function AclCataloguePanel({ allPermsGrouped = [], allRoles = [], roles = [] }) {
  const { t } = useTranslation(['access', 'superAdmin']);
  const [permFilter, setPermFilter] = useState('');
  const [permModal, setPermModal] = useState(null);
  const [roleModal, setRoleModal] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  const filteredGroups = useMemo(() => {
    const q = permFilter.trim().toLowerCase();
    if (!q) return allPermsGrouped;
    return allPermsGrouped
      .map((g) => ({
        ...g,
        items: (g.items || []).filter((p) =>
          `${p.code} ${p.label} ${p.module_code} ${p.action}`.toLowerCase().includes(q)
        )}))
      .filter((g) => g.items.length);
  }, [allPermsGrouped, permFilter]);

  const deletePerm = async (id) => {
    const ok = await confirmModal({
      title: t('catalogue.delete_perm_title'),
      message: t('catalogue.confirm_delete_perm'),
      confirmLabel: t('shared.delete'),
      tone: 'danger'});
    if (!ok) return;
    aclPost('perm_delete', { id }).then((j) => {
      if (j.ok) window.location.reload();
      else notifyError(j.error || t('shared.failed'));
    });
  };

  const deleteRole = async (rid) => {
    const ok = await confirmModal({
      title: t('catalogue.delete_role_title'),
      message: t('catalogue.confirm_delete_role'),
      confirmLabel: t('shared.delete'),
      tone: 'danger'});
    if (!ok) return;
    aclPost('role_delete', { role_id: rid }).then((j) => {
      if (j.ok) window.location.reload();
      else notifyError(j.error || t('shared.failed'));
    });
  };

  return (
    <>
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-slate-800">{t('catalogue.perm_title')}</h2>
            <p className="text-sm text-slate-500">{t('catalogue.perm_sub')}</p>
          </div>
          <div className="flex gap-2">
            <input
              className="hms-input text-sm"
              placeholder={t('catalogue.perm_filter_ph')}
              value={permFilter}
              onChange={(ev) => setPermFilter(ev.target.value)}
            />
            <button type="button" className="hms-btn-primary text-xs" onClick={() => setPermModal({})}>
              {t('shared.add')}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {filteredGroups.map((g) => {
            const meta = g.meta || {};
            const code = meta.code || 'misc';
            const isCollapsed = collapsed[code];
            return (
              <div key={code} className="overflow-hidden rounded-xl border border-slate-200">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 bg-slate-50 px-4 py-3 text-left text-sm font-bold text-slate-800"
                  onClick={() => setCollapsed((c) => ({ ...c, [code]: !c[code] }))}
                >
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-lg"
                    style={{ background: `${meta.color || '#1a6bd8'}22`, color: meta.color || '#1a6bd8' }}
                  >
                    <i className={`fa ${meta.icon || 'fa-cube'}`} aria-hidden="true" />
                  </span>
                  {aclModuleLabel(code, meta.label || code, t)}
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs">{(g.items || []).length}</span>
                  <i className={`fa fa-chevron-down ml-auto text-xs ${isCollapsed ? '-rotate-90' : ''}`} />
                </button>
                {!isCollapsed ? (
                  <table className="min-w-full text-sm">
                    <thead className="bg-white text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-2 text-left">{t('shared.code')}</th>
                        <th className="px-4 py-2 text-left">{t('shared.label')}</th>
                        <th className="px-4 py-2 text-left">{t('shared.action')}</th>
                        <th className="px-4 py-2 text-right">{t('shared.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(g.items || []).map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2">
                            <code className="text-xs">{p.code}</code>
                          </td>
                          <td className="px-4 py-2 font-semibold">{aclPermLabel(p.code, p.label, t)}</td>
                          <td className="px-4 py-2">
                            <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] uppercase">
                              {p.action || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              type="button"
                              className="mr-2 text-xs font-semibold text-brand-dark"
                              onClick={() => setPermModal(p)}
                            >
                              {t('shared.edit')}
                            </button>
                            <button
                              type="button"
                              className="text-xs font-semibold text-red-600"
                              onClick={() => deletePerm(p.id)}
                            >
                              {t('shared.delete')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-800">{t('catalogue.role_title')}</h2>
            <p className="text-sm text-slate-500">{t('catalogue.role_sub')}</p>
          </div>
          <button type="button" className="hms-btn-primary text-xs" onClick={() => setRoleModal({})}>
            {t('shared.add_role')}
          </button>
        </div>
        <table className="min-w-full text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left">{t('shared.code')}</th>
              <th className="px-4 py-2 text-left">{t('shared.title')}</th>
              <th className="px-4 py-2 text-right">{t('shared.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {allRoles.map((r) => (
              <tr key={r.role} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <code className="text-xs">{r.role}</code>
                </td>
                <td className="px-4 py-2 font-semibold">{aclRoleLabel(r.role, r.title, t)}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    className="mr-2 text-xs font-semibold text-brand-dark"
                    onClick={() => setRoleModal(r)}
                  >
                    {t('shared.edit')}
                  </button>
                  {!['1', '99'].includes(String(r.role)) ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-red-600"
                      onClick={() => deleteRole(r.role)}
                    >
                      {t('shared.delete')}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PermModal
        open={permModal != null}
        perm={permModal}
        onClose={() => setPermModal(null)}
        onSaved={() => window.location.reload()}
      />
      <RoleModal
        open={roleModal != null}
        role={roleModal?.role ? roleModal : null}
        roles={roles}
        onClose={() => setRoleModal(null)}
        onSaved={() => {}}
      />
    </>
  );
}
