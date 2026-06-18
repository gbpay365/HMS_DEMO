import { PageNavActions } from './PageNavActions';

export function ListPageHeader({ title, subtitle, children, nav = null }) {
  return (
    <div className="mb-6">
      {nav ? <PageNavActions {...nav} className="mb-4" /> : null}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-ink-muted">{subtitle}</p> : null}
        </div>
        {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
      </div>
    </div>
  );
}
