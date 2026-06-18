import { useTranslation } from 'react-i18next';
import { confirmFormSubmit } from '../../lib/modalBridge';
import { IpdRxFields } from './IpdRxFields';

export function IpdPrescriptionEditPanel({ rx, canEdit, inventory = [], compact = false, routePrefix = '/ipd' }) {
  const { t } = useTranslation('ipd');
  if (!rx) return null;

  const locked = Number(rx.locked) === 1;
  const given = Number(rx.slots_given) || 0;
  const canDelete = canEdit && !locked && given === 0;
  const editable = canEdit && !locked;

  if (!editable) {
    return (
      <p className="text-xs text-slate-500">
        {locked ? t('treatment.rx_locked_readonly') : t('treatment.rx_readonly')}
      </p>
    );
  }

  return (
    <div className={`space-y-4 ${compact ? '' : 'pt-1'}`}>
      <form method="POST" action={`${routePrefix}/prescription/${rx.id}/revise`} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <input type="hidden" name="revise_action" value="labels" />
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{t('treatment.update_labels')}</div>
        <IpdRxFields defaults={rx} showDrugPicker={false} prefix={`rx${rx.id}-`} />
        <button type="submit" className="mt-3 hms-btn hms-btn-primary text-xs">
          {t('treatment.save_labels')}
        </button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2">
        <form method="POST" action={`${routePrefix}/prescription/${rx.id}/revise`} className="rounded-xl border border-slate-200 bg-white p-3">
          <input type="hidden" name="revise_action" value="extend" />
          <div className="mb-2 text-xs font-bold text-slate-700">{t('treatment.extend_plan')}</div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-bold uppercase text-slate-500">{t('treatment.extend_days')}</label>
              <input name="extra_duration_days" type="number" min="1" max="60" defaultValue="1" className="hms-input w-full text-sm" />
            </div>
            <button type="submit" className="hms-btn hms-btn-secondary shrink-0 text-xs">
              {t('treatment.extend_plan')}
            </button>
          </div>
        </form>

        <form method="POST" action={`${routePrefix}/prescription/${rx.id}/revise`} className="rounded-xl border border-slate-200 bg-white p-3">
          <input type="hidden" name="revise_action" value="shorten" />
          <div className="mb-2 text-xs font-bold text-slate-700">{t('treatment.shorten_plan')}</div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-bold uppercase text-slate-500">{t('treatment.new_duration')}</label>
              <input
                name="new_duration_days"
                type="number"
                min="1"
                max="90"
                defaultValue={rx.duration_days || 1}
                className="hms-input w-full text-sm"
              />
            </div>
            <button type="submit" className="hms-btn hms-btn-secondary shrink-0 text-xs">
              {t('treatment.shorten_plan')}
            </button>
          </div>
        </form>
      </div>

      <form method="POST" action={`${routePrefix}/prescription/${rx.id}/revise`} className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
        <input type="hidden" name="revise_action" value="replace" />
        <div className="mb-1 text-xs font-bold uppercase text-amber-800">{t('treatment.replace_rx')}</div>
        <p className="mb-2 text-xs text-amber-900">{t('treatment.replace_hint')}</p>
        <IpdRxFields defaults={rx} prefix={`repl${rx.id}-`} inventory={inventory} />
        <button type="submit" className="mt-3 hms-btn hms-btn-primary text-xs">
          {t('treatment.replace_submit')}
        </button>
      </form>

      {canDelete ? (
        <form method="POST" action={`${routePrefix}/prescription/${rx.id}/delete`}>
          <button
            type="submit"
            className="hms-btn hms-btn-outline-danger text-xs"
            onClick={(ev) =>
              confirmFormSubmit(ev, {
                title: t('treatment.delete_rx_title'),
                message: t('treatment.delete_rx_confirm'),
                confirmLabel: t('treatment.delete_rx'),
                tone: 'danger'})
            }
          >
            {t('treatment.delete_rx')}
          </button>
        </form>
      ) : null}
    </div>
  );
}
