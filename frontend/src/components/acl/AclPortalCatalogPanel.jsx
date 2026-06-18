import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '../FormField';
import { Modal } from '../Modal';
import { ModalCancelButton, ModalSubmitButton } from '../ModalActions';
import { aclRoleLabel } from '../../lib/aclI18n';
import { aclPost } from '../../lib/aclApi';
import { confirmModal } from '../../lib/modalBridge';
import { notifyError } from '../../lib/notifyBridge';

function PortalModal({ open, mode, initial, selRole, selRoleTitle, onClose, onSaved }) {
  const { t } = useTranslation(['access', 'superAdmin']);
  const [form, setForm] = useState(initial);

  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    const payload = {
      portal_code: form.code.trim(),
      label: form.label.trim(),
      home_url: form.home_url.trim(),
      icon: form.icon.trim(),
      color: form.color,
      description: form.description.trim(),
      sort_order: form.sort_order};
    if (mode === 'add') {
      payload.starter_template = form.template;
      if (form.assignRole && selRole) {
        payload.assign_role = selRole;
        payload.set_home = form.setHome ? '1' : '0';
      }
      aclPost('portal_add', payload).then((j) => {
        if (!j.ok) {
          notifyError(j.error || t('shared.failed'));
          return;
        }
        onSaved(j);
      });
    } else {
      payload.enabled = form.enabled;
      aclPost('portal_edit', payload).then((j) => {
        if (!j.ok) notifyError(j.error || t('shared.failed'));
        else onSaved(j);
      });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'add' ? t('portal_catalog.create_title') : t('portal_catalog.edit_title')}
      size="lg"
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <ModalSubmitButton type="button" onClick={save} label={t('portal_catalog.save_portal')} />
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('portal_catalog.portal_code')} htmlFor="acl-portal-code">
            <input
              id="acl-portal-code"
              className="hms-input w-full"
              value={form.code}
              disabled={mode === 'edit'}
              onChange={(ev) => set('code', ev.target.value)}
              placeholder={t('portal_catalog.code_ph')}
            />
          </FormField>
          <FormField label={t('portal_catalog.display_name')} htmlFor="acl-portal-label">
            <input
              id="acl-portal-label"
              className="hms-input w-full"
              value={form.label}
              onChange={(ev) => set('label', ev.target.value)}
            />
          </FormField>
        </div>
        <FormField label={t('portal_catalog.home_url')} htmlFor="acl-portal-home">
          <input
            id="acl-portal-home"
            className="hms-input w-full"
            value={form.home_url}
            onChange={(ev) => set('home_url', ev.target.value)}
          />
        </FormField>
        {mode === 'add' && selRole ? (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.assignRole}
                onChange={(ev) => set('assignRole', ev.target.checked)}
              />
              {t('portal_catalog.assign_role', { role: aclRoleLabel(selRole, selRoleTitle, t) || selRole })}
            </label>
            <label className="ml-5 flex items-center gap-2">
              <input type="checkbox" checked={form.setHome} onChange={(ev) => set('setHome', ev.target.checked)} />
              {t('portal_catalog.set_home')}
            </label>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label={t('portal_catalog.icon')} htmlFor="acl-portal-icon">
            <input id="acl-portal-icon" className="hms-input w-full" value={form.icon} onChange={(ev) => set('icon', ev.target.value)} />
          </FormField>
          <FormField label={t('portal_catalog.colour')} htmlFor="acl-portal-color">
            <input
              id="acl-portal-color"
              type="color"
              className="hms-input w-full p-1"
              value={form.color}
              onChange={(ev) => set('color', ev.target.value)}
            />
          </FormField>
          <FormField label={t('portal_catalog.sort_order')} htmlFor="acl-portal-sort">
            <input
              id="acl-portal-sort"
              type="number"
              className="hms-input w-full"
              value={form.sort_order}
              onChange={(ev) => set('sort_order', ev.target.value)}
            />
          </FormField>
        </div>
        {mode === 'add' ? (
          <FormField label={t('portal_catalog.starter_tiles')} htmlFor="acl-portal-template">
            <select
              id="acl-portal-template"
              className="hms-input w-full"
              value={form.template}
              onChange={(ev) => set('template', ev.target.value)}
            >
              <option value="executive">{t('portal_catalog.template_executive')}</option>
              <option value="clinical">{t('portal_catalog.template_clinical')}</option>
              <option value="minimal">{t('portal_catalog.template_minimal')}</option>
            </select>
          </FormField>
        ) : (
          <FormField label={t('shared.status')} htmlFor="acl-portal-enabled">
            <select
              id="acl-portal-enabled"
              className="hms-input w-full"
              value={form.enabled}
              onChange={(ev) => set('enabled', ev.target.value)}
            >
              <option value="1">{t('shared.active')}</option>
              <option value="0">{t('shared.disabled')}</option>
            </select>
          </FormField>
        )}
        <FormField label={t('portal_catalog.description')} htmlFor="acl-portal-desc">
          <textarea
            id="acl-portal-desc"
            className="hms-input w-full"
            rows={2}
            value={form.description}
            onChange={(ev) => set('description', ev.target.value)}
          />
        </FormField>
      </div>
    </Modal>
  );
}

const emptyForm = {
  code: '',
  label: '',
  home_url: '',
  icon: 'fa-user-md',
  color: '#714b67',
  description: '',
  sort_order: '50',
  template: 'executive',
  assignRole: true,
  setHome: true,
  enabled: '1'};

export function AclPortalCatalogPanel({ portalCatalog = [], selRole, selRoleTitle }) {
  const { t } = useTranslation(['access', 'superAdmin']);
  const [modal, setModal] = useState(null);

  const openAdd = () => setModal({ mode: 'add', form: { ...emptyForm } });
  const openEdit = (p) => {
    const code = p.code;
    const isBuiltin = p.is_builtin === 1 || p.is_builtin === true;
    setModal({
      mode: 'edit',
      form: {
        code,
        label: p.label || '',
        home_url: p.home_url || `/portal/hub/${code}`,
        icon: p.icon || 'fa-th-large',
        color: p.color || '#714b67',
        description: p.description || '',
        sort_order: String(p.sort_order || 50),
        enabled: p.enabled === 0 ? '0' : '1',
        isBuiltin}});
  };

  const deletePortal = async (p) => {
    const ok = await confirmModal({
      title: t('portal_catalog.delete_title'),
      message: t('portal_catalog.confirm_delete', { label: p.label }),
      confirmLabel: t('shared.delete'),
      tone: 'danger'});
    if (!ok) return;
    aclPost('portal_delete', { portal_code: p.code }).then((j) => {
      if (j.ok) window.location.href = '/hms-admin/access?view=portal-catalog';
      else notifyError(j.error || t('shared.failed'));
    });
  };

  return (
    <>
      <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        {t('portal_catalog.intro')}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-800">{t('portal_catalog.all_portals')}</h2>
        <button type="button" className="hms-btn-primary text-xs" onClick={openAdd}>
          {t('portal_catalog.create_portal')}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">{t('portal_catalog.col_portal')}</th>
              <th className="px-4 py-3 text-left">{t('shared.code')}</th>
              <th className="px-4 py-3 text-left">{t('portal_catalog.col_home_url')}</th>
              <th className="px-4 py-3 text-center">{t('shared.status')}</th>
              <th className="px-4 py-3 text-right">{t('shared.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {portalCatalog.map((p) => {
              const code = p.code;
              const home = p.home_url || `/portal/hub/${code}`;
              const isBuiltin = p.is_builtin === 1 || p.is_builtin === true;
              return (
                <tr key={code} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg"
                        style={{ background: `${p.color || '#714b67'}22`, color: p.color || '#714b67' }}
                      >
                        <i className={`fa ${p.icon || 'fa-th-large'}`} aria-hidden="true" />
                      </span>
                      <div>
                        <div className="font-bold">{p.label}</div>
                        {p.description ? <div className="text-xs text-slate-500">{p.description}</div> : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs">{code}</code>
                    {isBuiltin ? (
                      <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold">
                        {t('shared.builtin')}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <a href={home} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-dark hover:underline">
                      {home}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.enabled === 0 ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        {t('shared.disabled')}
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                        {t('shared.active')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={home}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mr-1 hms-btn-secondary inline-block text-xs"
                    >
                      {t('shared.open')}
                    </a>
                    <button type="button" className="mr-1 hms-btn-secondary text-xs" onClick={() => openEdit(p)}>
                      {t('shared.edit')}
                    </button>
                    {!isBuiltin ? (
                      <button type="button" className="text-xs font-semibold text-red-600 hover:underline" onClick={() => deletePortal(p)}>
                        {t('shared.delete')}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {!portalCatalog.length ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  {t('portal_catalog.empty')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <PortalModal
        open={!!modal}
        mode={modal?.mode}
        initial={modal?.form || emptyForm}
        selRole={selRole}
        selRoleTitle={selRoleTitle}
        onClose={() => setModal(null)}
        onSaved={() => window.location.reload()}
      />
    </>
  );
}
