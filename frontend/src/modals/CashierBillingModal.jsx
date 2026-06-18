import { useTranslation } from 'react-i18next';
import { WorkspaceWindow } from '../components/WorkspaceWindow';
import { CashierBillingTab } from '../components/cashier/CashierBillingTab';

export function CashierBillingModal({
  open,
  onClose,
  initialInvoices = [],
  initialSummary = {},
  initialTotal = 0,
  serviceCatalog = [],
  pharmacyCatalog = [],
  consultCatalog = [],
  labCatalog = [],
  imagingCatalog = [],
  maternityCatalog = [],
  surgeryCatalog = [],
  svcCatalog = []}) {
  const { t } = useTranslation('clinical');

  return (
    <WorkspaceWindow
      open={open}
      onClose={onClose}
      title={t('cashier.tab_billing')}
      subtitle={t('cashier.invoices_subtitle')}
    >
      <CashierBillingTab
        embedded
        initialInvoices={initialInvoices}
        initialSummary={initialSummary}
        initialTotal={initialTotal}
        serviceCatalog={serviceCatalog}
        pharmacyCatalog={pharmacyCatalog}
        consultCatalog={consultCatalog}
        labCatalog={labCatalog}
        imagingCatalog={imagingCatalog}
        maternityCatalog={maternityCatalog}
        surgeryCatalog={surgeryCatalog}
        svcCatalog={svcCatalog}
      />
    </WorkspaceWindow>
  );
}
