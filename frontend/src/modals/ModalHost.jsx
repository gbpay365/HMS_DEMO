import { useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { closeModal, registerModalListener } from '../lib/modalBridge';

export function ModalHost() {
  const [state, setState] = useState({ open: false });

  useEffect(() => {
    registerModalListener(setState);
    return () => registerModalListener(null);
  }, []);

  if (!state.open) return null;

  return (
    <Modal
      open
      onClose={() => {
        state.onClose?.();
        closeModal();
      }}
      title={state.title}
      subtitle={state.subtitle}
      size={state.size}
      footer={state.footer}
      closeOnBackdrop={state.closeOnBackdrop !== false}
    >
      {state.body}
    </Modal>
  );
}
