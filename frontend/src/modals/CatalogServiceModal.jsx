import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';
import { CATALOG_CATEGORIES } from '../lib/catalogUi';
import { catalogCategoryWritable } from '../lib/catalogAccessClient';

function fieldLabels(category, t) {
  const isPharm = String(category || '').trim().toLowerCase() === 'pharmacy';
  return {
    name: isPharm ? t('modals.catalogService.medication') : t('modals.catalogService.service_name'),
    dept: isPharm ? t('modals.catalogService.used_for') : t('modals.catalogService.department'),
    deptPlaceholder: isPharm ? t('modals.catalogService.dept_ph_pharm') : t('modals.catalogService.dept_ph')};
}

export function CatalogServiceModal({ open, onClose, mode = 'add', service = null, writeSections = null }) {
  const { t } = useTranslation(['ops', 'clinical']);
  const isEdit = mode === 'edit';
  const [category, setCategory] = useState('');

  useEffect(() => {
    if (!open) return;
    setCategory(isEdit ? String(service?.category || '') : '');
  }, [open, isEdit, service]);

  const labels = useMemo(
    () => fieldLabels(isEdit ? category || service?.category : category, t),
    [isEdit, category, service, t]
  );

  const categoryOptions = useMemo(() => {
    if (!writeSections || !writeSections.length) return CATALOG_CATEGORIES;
    return CATALOG_CATEGORIES.filter((c) => catalogCategoryWritable(writeSections, c.value));
  }, [writeSections]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('modals.catalogService.edit_title') : t('modals.catalogService.add_title')}
      subtitle={t('modals.catalogService.subtitle')}
      size="lg"
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <ModalSubmitButton
            form="hms-catalog-service-form"
            label={isEdit ? t('modals.catalogService.update') : t('clinical:shared.save')}
          />
        </>
      }
    >
      <form
        id="hms-catalog-service-form"
        method="post"
        action={isEdit ? `/catalog/${service?.id}/update` : '/catalog/create'}
        className="grid gap-4"
      >
        <div>
          <label className="hms-label" htmlFor="cat-category">
            {t('modals.catalogService.category')}
          </label>
          {isEdit ? (
            <input
              id="cat-category"
              name="category"
              className="hms-input"
              value={category}
              onChange={(ev) => setCategory(ev.target.value)}
            />
          ) : (
            <select
              id="cat-category"
              name="category"
              className="hms-input"
              value={category}
              onChange={(ev) => setCategory(ev.target.value)}
            >
              {categoryOptions.map((c) => (
                <option key={c.value || 'service'} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="hms-label" htmlFor="cat-name">
            {labels.name} <span className="text-red-500">*</span>
          </label>
          <input
            id="cat-name"
            name="name"
            required
            className="hms-input"
            defaultValue={isEdit ? service?.name || '' : ''}
          />
        </div>
        <div>
          <label className="hms-label" htmlFor="cat-dept">
            {labels.dept}
          </label>
          <input
            id="cat-dept"
            name="department_name"
            className="hms-input"
            placeholder={labels.deptPlaceholder}
            defaultValue={isEdit ? service?.department_name || '' : ''}
          />
        </div>
        <div>
          <label className="hms-label" htmlFor="cat-price">
            {t('modals.catalogService.price')} <span className="text-red-500">*</span>
          </label>
          <input
            id="cat-price"
            name="price"
            type="number"
            min="0"
            step="0.01"
            required
            className="hms-input"
            defaultValue={isEdit ? service?.price ?? 0 : ''}
          />
        </div>
        <div>
          <label className="hms-label" htmlFor="cat-status">
            {t('clinical:shared.status')}
          </label>
          <select
            id="cat-status"
            name="status"
            className="hms-input"
            defaultValue={isEdit ? (Number(service?.status) === 0 ? '0' : '1') : '1'}
          >
            <option value="1">{t('modals.catalogService.active')}</option>
            <option value="0">{t('modals.catalogService.inactive')}</option>
          </select>
        </div>
      </form>
    </Modal>
  );
}
