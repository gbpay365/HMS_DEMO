/**
 * Token-aligned data table for dashboard and list panels.
 */
export function HmsDataTable({ columns = [], rows = [], emptyMessage = 'No rows.', rowKey = 'id' }) {
  return (
    <div className="overflow-x-auto">
      <table className="hms-table-v3 min-w-full text-left text-sm">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.className || ''}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!rows.length ? (
            <tr>
              <td colSpan={columns.length || 1} className="px-4 py-8 text-center text-xs text-slate-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={row[rowKey] ?? i} className="hover:bg-slate-50/80">
                {columns.map((col) => (
                  <td key={col.key} className={col.cellClassName || col.className || ''}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
