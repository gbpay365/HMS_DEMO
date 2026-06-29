import { useTranslation } from 'react-i18next';
import { ClinicalWorkflowBanner } from '../clinical/ClinicalWorkflowBanner';

export function OpdWorkflowBanner() {
  const { t } = useTranslation('clinical');

  const steps = [
    { n: 1, icon: 'sign-in', label: t('opd.wf_patient_arrives'), role: t('opd.wf_role_patient'), color: '#6366f1' },
    { n: 2, icon: 'desktop', label: t('opd.wf_front_checkin'), role: t('opd.wf_role_front_desk'), color: '#0369a1' },
    {
      n: 3,
      icon: 'clipboard',
      label: t('opd.wf_registration'),
      role: t('opd.wf_role_front_desk'),
      color: '#0369a1',
      note: t('opd.wf_registration_note')},
    { n: 4, icon: 'credit-card', label: t('opd.wf_cashier_consult'), role: t('opd.wf_role_cashier'), color: '#059669' },
    { n: 5, icon: 'list-alt', label: t('opd.wf_opd_queue'), role: t('opd.wf_role_front_desk'), color: '#0369a1' },
    { n: 6, icon: 'heartbeat', label: t('opd.wf_nurse_vitals'), role: t('opd.wf_role_nurse'), color: '#d97706', note: t('opd.wf_nurse_note') },
    { n: 7, icon: 'user-md', label: t('opd.wf_doctor_consult'), role: t('opd.wf_role_doctor'), color: '#7c3aed' },
    { n: 8, icon: 'credit-card', label: t('opd.wf_cashier_orders'), role: t('opd.wf_role_cashier'), color: '#059669' },
    { n: 9, icon: 'flask', label: t('opd.wf_lab'), role: t('opd.wf_role_lab_tech'), color: '#0891b2' },
    { n: 10, icon: 'rss', label: t('opd.wf_radiology'), role: t('opd.wf_role_radiologist'), color: '#0891b2' },
    { n: 11, icon: 'medkit', label: t('opd.wf_pharmacy'), role: t('opd.wf_role_pharmacist'), color: '#be185d' },
  ];

  return (
    <ClinicalWorkflowBanner
      title={t('opd.workflow_title')}
      subtitle={t('opd.workflow_subtitle')}
      steps={steps}
      footnote={t('opd.workflow_footnote')}
      stationTitle={(n) => t('opd.workflow_station', { n })}
      listAriaLabel={t('opd.workflow_stations_aria')}
      defaultCollapsed
      showLabel={t('opd.workflow_show')}
      hideLabel={t('opd.workflow_hide')}
    />
  );
}
