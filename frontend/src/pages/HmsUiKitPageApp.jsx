import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormErrorBanner } from '../components/FormErrorBanner';
import { FormField } from '../components/FormField';
import { HmsButton } from '../components/HmsButton';
import { ListPageHeader } from '../components/ListPageHeader';
import { Modal } from '../components/Modal';
import { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';
import { SearchField } from '../components/SearchField';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { SurfaceHero } from '../components/SurfaceHero';

export function HmsUiKitPageApp() {
  const { t } = useTranslation(['ops', 'clinical']);
  const [demoOpen, setDemoOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [fieldError, setFieldError] = useState('');

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content px-4 pb-10 pt-2 sm:px-6">
        <ListPageHeader
          title={t('uiKit.title')}
          subtitle={t('uiKit.subtitle')}
        >
          <HmsButton variant="primary" onClick={() => setDemoOpen(true)}>
            {t('uiKit.open_modal')}
          </HmsButton>
        </ListPageHeader>

        <SurfaceHero icon="paint-brush" title={t('uiKit.hero_title')} subtitle={t('uiKit.hero_subtitle')} />

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <StatCard label={t('uiKit.stat_buttons')} value={6} tone="brand" icon="hand-pointer" />
          <StatCard label={t('uiKit.stat_fields')} value={4} tone="default" icon="edit" />
          <StatCard label={t('uiKit.stat_modals')} value={3} tone="brand" icon="window-maximize" />
        </div>

        <section className="mb-8 rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">{t('uiKit.buttons')}</h2>
          <div className="flex flex-wrap gap-2">
            <HmsButton variant="primary">{t('clinical:shared.save')}</HmsButton>
            <HmsButton variant="secondary">{t('clinical:shared.cancel')}</HmsButton>
            <HmsButton variant="success">{t('uiKit.btn_success')}</HmsButton>
            <HmsButton variant="warning">{t('uiKit.btn_warning')}</HmsButton>
            <HmsButton variant="danger">{t('uiKit.btn_danger')}</HmsButton>
            <HmsButton variant="outline-primary">{t('uiKit.btn_outline')}</HmsButton>
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">{t('uiKit.form_fields')}</h2>
          <FormErrorBanner message={fieldError} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('uiKit.sample_name')} htmlFor="ui-kit-name" required>
              <input id="ui-kit-name" className="hms-input" placeholder={t('uiKit.sample_name_ph')} />
            </FormField>
            <FormField
              label={t('uiKit.sample_email')}
              htmlFor="ui-kit-email"
              error={fieldError}
              hint={t('uiKit.sample_email_hint')}
            >
              <input id="ui-kit-email" type="email" className="hms-input" />
            </FormField>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <HmsButton
              variant="secondary"
              onClick={() => setFieldError(t('uiKit.sample_validation_error'))}
            >
              {t('uiKit.show_error')}
            </HmsButton>
            <HmsButton variant="ghost" onClick={() => setFieldError('')}>
              {t('uiKit.clear_error')}
            </HmsButton>
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">{t('uiKit.search')}</h2>
          <SearchField value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('uiKit.search_ph')} />
        </section>

        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">{t('uiKit.badges')}</h2>
          <div className="flex flex-wrap gap-2">
            <StatusBadge variant="success" label={t('clinical:shared.active')} />
            <StatusBadge variant="warning" label={t('clinical:shared.pending')} />
            <StatusBadge variant="danger" label={t('clinical:shared.cancelled')} />
          </div>
        </section>

        <Modal
          open={demoOpen}
          onClose={() => setDemoOpen(false)}
          title={t('uiKit.modal_title')}
          subtitle={t('uiKit.modal_subtitle')}
          size="md"
          footer={
            <>
              <ModalCancelButton onClick={() => setDemoOpen(false)} />
              <ModalSubmitButton label={t('clinical:shared.save')} onClick={() => setDemoOpen(false)} />
            </>
          }
        >
          <p className="text-sm text-slate-600">{t('uiKit.modal_body')}</p>
        </Modal>
      </div>
    </div>
  );
}
