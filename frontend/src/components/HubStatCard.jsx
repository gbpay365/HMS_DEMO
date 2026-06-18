function hexToRgb(hex) {
  const raw = String(hex || '').replace('#', '');
  if (raw.length !== 6) return null;
  const n = parseInt(raw, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function normalizeIcon(icon) {
  const cls = String(icon || 'fa-bar-chart').trim();
  return cls.startsWith('fa-') ? cls : `fa-${cls}`;
}

export function HubStatCard({ label, value, icon = 'fa-bar-chart', color = '#475569' }) {
  const rgb = hexToRgb(color);
  const iconCls = normalizeIcon(icon);
  const bgGradient = rgb
    ? `linear-gradient(135deg, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.16) 0%, rgba(255,255,255,0.95) 55%, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.06) 100%)`
    : 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)';
  const borderColor = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.28)` : '#e2e8f0';

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border p-4 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      style={{ background: bgGradient, borderColor }}
    >
      <div
        className="pointer-events-none absolute -right-3 -top-3 h-20 w-20 rounded-full opacity-[0.12]"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <div className="relative flex items-center gap-4">
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl text-white shadow-md"
          style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
        >
          <i className={`fa ${iconCls}`} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
          <div className="mt-1 text-3xl font-extrabold leading-none tabular-nums" style={{ color }}>
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}
