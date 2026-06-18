import { useTranslation } from 'react-i18next';
import { ClinicalWorkflowBanner } from '../clinical/ClinicalWorkflowBanner';

export function IpdWorkflowBanner() {
  const { t } = useTranslation('ipd');

  const steps = [
    { n: 1, icon: 'clipboard', label: t('workflow.step_admit'), role: t('workflow.role_doctor'), color: '#1e40af' },
    { n: 2, icon: 'credit-card', label: t('workflow.step_deposit'), role: t('workflow.role_cashier'), color: '#059669' },
    { n: 3, icon: 'bed', label: t('workflow.step_bed'), role: t('workflow.role_adt_nurse'), color: '#d97706' },
    { n: 4, icon: 'heartbeat', label: t('workflow.step_vitals'), role: t('workflow.role_nurse'), color: '#7c3aed' },
    { n: 5, icon: 'stethoscope', label: t('workflow.step_rounds'), role: t('workflow.role_doctor'), color: '#6366f1' },
    { n: 6, icon: 'flask', label: t('workflow.step_lab'), role: t('workflow.role_lab'), color: '#0891b2' },
    { n: 7, icon: 'medkit', label: t('workflow.step_pharmacy'), role: t('workflow.role_pharmacist'), color: '#be185d' },
    { n: 8, icon: 'sign-out', label: t('workflow.step_clinical_dc'), role: t('workflow.role_doctor'), color: '#1e40af' },
    { n: 9, icon: 'money', label: t('workflow.step_financial_dc'), role: t('workflow.role_cashier'), color: '#059669' },
    { n: 10, icon: 'check-circle', label: t('workflow.step_released'), role: t('workflow.role_adt'), color: '#64748b' },
  ];

  return (
    <ClinicalWorkflowBanner
      title={t('workflow.title')}
      subtitle={t('workflow.subtitle')}
      steps={steps}
      accent="blue"
      footnote={t('workflow.footnote')}
      stationTitle={(n) => t('workflow.station', { n })}
      listAriaLabel={t('workflow.stations_aria')}
    />
  );
}
