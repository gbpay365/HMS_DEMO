import { useTranslation } from 'react-i18next';
import { FlashMessages } from '../components/FlashMessages';
import { OpdDrugChartView } from '../components/opd/OpdDrugChartView';
import { OpdTreatmentView } from '../components/opd/OpdTreatmentView';

export function OpdMedPageApp(props) {
  const { t } = useTranslation('clinical');
  const { pageKey = 'treatment', flash, error } = props;

  return (
    <div className="page-wrapper hms-surface-module">
      <div className="content min-h-[70vh] px-4 py-6">
        <FlashMessages flash={flash} error={error} />
        {pageKey === 'treatment' ? <OpdTreatmentView {...props} /> : null}
        {pageKey === 'drug-chart' ? <OpdDrugChartView {...props} /> : null}
        {pageKey !== 'treatment' && pageKey !== 'drug-chart' ? (
          <p className="text-slate-500">{t('opd.treatment.unknown_page')}</p>
        ) : null}
      </div>
    </div>
  );
}
