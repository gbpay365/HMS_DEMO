import { useEffect, useState } from 'react';
import { mountInvoiceModalBridge, openHmsInvoiceModal, registerInvoiceModalOpener } from '../lib/invoiceModalBridge';
import { HmsInvoiceModal } from '../modals/HmsInvoiceModal';

export function HmsInvoiceModalHost() {
  const [open, setOpen] = useState(false);
  const [visitId, setVisitId] = useState(0);

  useEffect(() => {
    registerInvoiceModalOpener((id) => {
      setVisitId(id);
      setOpen(true);
    });
    mountInvoiceModalBridge();
    return () => registerInvoiceModalOpener(null);
  }, []);

  return (
    <HmsInvoiceModal
      open={open}
      visitId={visitId}
      onClose={() => {
        setOpen(false);
        setVisitId(0);
      }}
    />
  );
}

export { openHmsInvoiceModal };
