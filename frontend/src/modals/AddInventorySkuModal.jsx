import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';

async function fetchNextSku(categoryId) {
  const q = encodeURIComponent(categoryId || '0');
  const res = await fetch(`/inventory/next-sku?category_id=${q}`, { credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok || !data.sku) {
    throw new Error(data.error || 'Could not generate SKU.');
  }
  return data.sku;
}

export function AddInventorySkuModal({ open, onClose, categories = [] }) {
  const { t } = useTranslation(['ops', 'clinical']);
  const [categoryId, setCategoryId] = useState('');
  const [sku, setSku] = useState('');
  const [skuLoading, setSkuLoading] = useState(false);
  const [skuError, setSkuError] = useState('');

  useEffect(() => {
    if (!open) {
      setCategoryId('');
      setSku('');
      setSkuError('');
      return undefined;
    }

    let cancelled = false;
    setSkuLoading(true);
    setSkuError('');
    fetchNextSku(categoryId)
      .then((next) => {
        if (!cancelled) setSku(next);
      })
      .catch((e) => {
        if (!cancelled) {
          setSku('');
          setSkuError(e.message || t('modals.addInventorySku.sku_error'));
        }
      })
      .finally(() => {
        if (!cancelled) setSkuLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, categoryId, t]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('modals.addInventorySku.title')}
      subtitle={t('modals.addInventorySku.subtitle')}
      size="lg"
      footer={
        <>
          <ModalCancelButton onClick={onClose} />
          <ModalSubmitButton form="hms-add-sku-form" label={t('modals.addInventorySku.save_sku')} disabled={skuLoading || !sku} />
        </>
      }
    >
      <form id="hms-add-sku-form" method="post" action="/inventory/add-sku" className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="hms-label" htmlFor="inv-cat">
            {t('modals.addInventorySku.category')}
          </label>
          <select
            id="inv-cat"
            name="category_id"
            className="hms-input"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">{t('modals.addInventorySku.general')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="hms-label" htmlFor="inv-sku">
            {t('modals.addInventorySku.sku_code')} <span className="text-red-500">*</span>
          </label>
          <input
            id="inv-sku"
            name="sku"
            required
            readOnly
            value={skuLoading ? '' : sku}
            placeholder={skuLoading ? t('modals.addInventorySku.sku_generating') : t('modals.addInventorySku.sku_ph')}
            className="hms-input bg-slate-50 font-semibold text-brand read-only:cursor-default"
          />
          <p className="mt-1 text-xs text-slate-500">
            {skuError || t('modals.addInventorySku.sku_auto_hint')}
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className="hms-label" htmlFor="inv-name">
            {t('modals.addInventorySku.product_name')} <span className="text-red-500">*</span>
          </label>
          <input id="inv-name" name="name" required className="hms-input" />
        </div>
        <div>
          <label className="hms-label" htmlFor="inv-qty">
            {t('modals.addInventorySku.opening_qty')}
          </label>
          <input id="inv-qty" name="quantity" type="number" min="0" defaultValue={0} className="hms-input" />
        </div>
        <div>
          <label className="hms-label" htmlFor="inv-reorder">
            {t('modals.addInventorySku.reorder_level')}
          </label>
          <input id="inv-reorder" name="reorder_level" type="number" min="0" defaultValue={5} className="hms-input" />
        </div>
        <div>
          <label className="hms-label" htmlFor="inv-price">
            {t('modals.addInventorySku.unit_price')}
          </label>
          <input id="inv-price" name="unit_price" type="number" min="0" step="0.01" defaultValue={0} className="hms-input" />
        </div>
      </form>
    </Modal>
  );
}
