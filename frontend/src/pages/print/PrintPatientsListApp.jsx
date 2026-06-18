import { useTranslation } from 'react-i18next';
import { formatDate } from '../../lib/listUi';
import { PrintToolbar } from '../../components/PrintToolbar';

export function PrintPatientsListApp({
  patients = [],
  searchQ = '',
  title,
  facilityName = 'ZAIZENS',
  generatedAt = null}) {
  const { t } = useTranslation('print');
  const when = generatedAt || new Date().toISOString();
  const displayTitle = title || t('patientsList.title');
  const extra =
    t('patientsList.records', { count: patients.length }) +
    (searchQ ? t('patientsList.filter_suffix', { q: searchQ }) : '');

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <PrintToolbar backHref="/patients" backLabel={t('patientsList.back')} extra={extra} />

      <div className="mx-auto max-w-6xl p-4 print:max-w-none print:p-0">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg print:rounded-none print:border-0 print:shadow-none">
          <div className="bg-slate-900 px-6 py-4 text-white">
            <div className="text-xs font-bold uppercase tracking-widest opacity-80">{facilityName}</div>
            <h1 className="text-lg font-extrabold uppercase tracking-wide">{displayTitle}</h1>
            <div className="text-xs opacity-75">{t('patientsList.generated', { date: formatDate(when) })}</div>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">{t('patientsList.col_num')}</th>
                <th className="px-3 py-2">{t('patientsList.col_code')}</th>
                <th className="px-3 py-2">{t('patientsList.col_patient')}</th>
                <th className="px-3 py-2">{t('patientsList.col_phone')}</th>
                <th className="px-3 py-2">{t('patientsList.col_gender')}</th>
                <th className="px-3 py-2">{t('patientsList.col_type')}</th>
                <th className="px-3 py-2">{t('patientsList.col_registered')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {patients.map((p, i) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2 font-mono">{p.patient_code || p.id}</td>
                  <td className="px-3 py-2 font-semibold">
                    {p.first_name} {p.last_name}
                  </td>
                  <td className="px-3 py-2">{p.phone || '—'}</td>
                  <td className="px-3 py-2">{p.gender || '—'}</td>
                  <td className="px-3 py-2">{p.patient_type || '—'}</td>
                  <td className="px-3 py-2">{formatDate(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm 12mm; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}
