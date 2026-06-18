import { useTranslation } from 'react-i18next';
import { translateFlashText } from '../lib/flashI18nClient';

export function FlashMessages({ flash, error }) {
  const { t } = useTranslation(['errors', 'common']);
  const displayFlash = translateFlashText(flash, t);
  const displayError = translateFlashText(error, t);

  return (
    <>
      {displayFlash ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {displayFlash}
        </div>
      ) : null}
      {displayError ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {displayError}
        </div>
      ) : null}
    </>
  );
}
