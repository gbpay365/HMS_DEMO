import { formatDate } from '../../lib/listUi';
import { PrintToolbar } from '../../components/PrintToolbar';

export function PrintEmployeesListApp({
  columns = [],
  rows = [],
  searchQ = '',
  title = 'Employees',
  facilityName = 'ZAIZENS',
  generatedAt = null,
  backHref = '/employees',
  backLabel = 'Back to employees',
  recordsLabel = '',
  filterSuffix = '',
  generatedLabel = ''}) {
  const when = generatedAt || new Date().toISOString();
  const extra =
    recordsLabel.replace('{{count}}', String(rows.length)) +
    (searchQ && filterSuffix ? filterSuffix.replace('{{q}}', searchQ) : '');

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <PrintToolbar backHref={backHref} backLabel={backLabel} extra={extra} />

      <div className="mx-auto max-w-6xl p-4 print:max-w-none print:p-0">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg print:rounded-none print:border-0 print:shadow-none">
          <div className="bg-slate-900 px-6 py-4 text-white">
            <div className="text-xs font-bold uppercase tracking-widest opacity-80">{facilityName}</div>
            <h1 className="text-lg font-extrabold uppercase tracking-wide">{title}</h1>
            {generatedLabel ? (
              <div className="text-xs opacity-75">{generatedLabel.replace('{{date}}', formatDate(when))}</div>
            ) : null}
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">#</th>
                {columns.map((col) => (
                  <th key={col.key} className="px-3 py-2">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-3 py-8 text-center text-slate-500">
                    —
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                    {columns.map((col) => (
                      <td key={col.key} className="px-3 py-2">
                        {row[col.key] || '—'}
                      </td>
                    ))}
                  </tr>
                ))
              )}
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
