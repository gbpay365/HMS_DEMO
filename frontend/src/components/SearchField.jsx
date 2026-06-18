import { useTranslation } from 'react-i18next';

export function SearchField({ value, onChange, placeholder, onSubmit, name = 'q', submitLabel, id, label }) {
  const { t } = useTranslation('common');
  const searchLabel = label ?? t('actions.search');
  const buttonLabel = submitLabel ?? searchLabel;
  const inputId = id || 'hms-search-field';

  const searchIcon = (
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true">
      <i className="fa fa-search" />
    </span>
  );

  if (onSubmit) {
    return (
      <form onSubmit={onSubmit} className="flex gap-2" role="search">
        <div className="relative flex-1">
          <label className="sr-only" htmlFor={inputId}>
            {searchLabel}
          </label>
          {searchIcon}
          <input
            type="search"
            id={inputId}
            name={name}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            className="hms-input pl-9"
            autoComplete="off"
          />
        </div>
        <button type="submit" className="hms-btn-primary shrink-0">
          {buttonLabel}
        </button>
      </form>
    );
  }

  return (
    <div className="relative max-w-xl flex-1" role="search">
      <label className="sr-only" htmlFor={inputId}>
        {searchLabel}
      </label>
      {searchIcon}
      <input
        type="search"
        id={inputId}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="hms-input pl-9"
        autoComplete="off"
      />
    </div>
  );
}
