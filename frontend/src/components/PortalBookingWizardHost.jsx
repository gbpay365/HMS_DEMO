import { useEffect, useMemo, useState } from 'react';
import { parsePageData } from '../lib/parsePageData';
import {
  mountPortalBookingBridge,
  openPortalBookingWizard,
  registerPortalBookingOpener} from '../lib/portalBookingBridge';
import { PortalBookingWizardModal } from '../modals/PortalBookingWizardModal';

export function PortalBookingWizardHost() {
  const pageConfig = useMemo(() => parsePageData('hms-portal-booking-data'), []);
  const [open, setOpen] = useState(false);
  const [reschedule, setReschedule] = useState(null);

  useEffect(() => {
    registerPortalBookingOpener((data) => {
      setReschedule(data || pageConfig?.reschedule || null);
      setOpen(true);
    });
    mountPortalBookingBridge();

    const launch = document.getElementById('pp-open-booking');
    const onLaunch = () => openPortalBookingWizard(null);
    launch?.addEventListener('click', onLaunch);

    if (pageConfig?.reschedule) {
      setTimeout(() => openPortalBookingWizard(pageConfig.reschedule), 300);
    } else if (window.__obkReschedule) {
      setTimeout(() => openPortalBookingWizard(window.__obkReschedule), 300);
    } else if (/[?&]open_booking=1/.test(window.location.search)) {
      setTimeout(() => openPortalBookingWizard(null), 400);
    }

    return () => {
      registerPortalBookingOpener(null);
      launch?.removeEventListener('click', onLaunch);
    };
  }, [pageConfig]);

  return (
    <PortalBookingWizardModal
      open={open}
      onClose={() => {
        setOpen(false);
        setReschedule(null);
      }}
      config={{
        departments: pageConfig?.departments || [],
        doctors: pageConfig?.doctors || [],
        specialisations: pageConfig?.specialisations || [],
        reschedule: reschedule || pageConfig?.reschedule || null}}
    />
  );
}

export { openPortalBookingWizard };
