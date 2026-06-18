import { useEffect, useMemo, useState } from 'react';
import { parsePageData } from '../lib/parsePageData';
import { mountAddChargeBridge, openAddChargeModal, registerAddChargeOpener } from '../lib/addChargeBridge';
import { AddChargeModal } from '../modals/AddChargeModal';

export function AddChargeModalHost() {
  const pageConfig = useMemo(() => parsePageData('hms-add-charge-data'), []);
  const [open, setOpen] = useState(false);
  const [runtime, setRuntime] = useState(null);

  useEffect(() => {
    registerAddChargeOpener((options) => {
      setRuntime(options || {});
      setOpen(true);
    });
    mountAddChargeBridge();
    return () => {
      registerAddChargeOpener(null);
    };
  }, []);

  const merged = useMemo(() => {
    const base = pageConfig || {};
    const rt = runtime || {};
    return {
      formAction: rt.formAction || base.formAction,
      contextName: rt.contextName || base.contextName || 'admission_id',
      contextValue: rt.contextValue != null ? rt.contextValue : base.contextValue ?? '',
      submitLabel: rt.submitLabel || base.submitLabel};
  }, [pageConfig, runtime]);

  if (!merged.formAction) return null;

  return (
    <AddChargeModal
      open={open}
      onClose={() => {
        setOpen(false);
        setRuntime(null);
      }}
      formAction={merged.formAction}
      contextName={merged.contextName}
      contextValue={merged.contextValue}
      submitLabel={merged.submitLabel}
    />
  );
}

// Re-export for React pages that prefer a direct import.
export { openAddChargeModal };
