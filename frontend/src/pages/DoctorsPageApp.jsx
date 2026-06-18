import { useState } from 'react';
import { DoctorsDirectory } from './DoctorsDirectory';
import { AddDoctorModal } from '../modals/AddDoctorModal';

export function DoctorsPageApp(props) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="page-wrapper hms-surface-module">
      <DoctorsDirectory
        doctors={props.doctors}
        canAddDoctor={props.canAddDoctor}
        onAddDoctor={() => setAddOpen(true)}
      />
      <AddDoctorModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        roles={props.roles}
        departments={props.departments}
        specialisations={props.specialisations}
        doctorRoleIds={props.doctorRoleIds}
      />
    </div>
  );
}
