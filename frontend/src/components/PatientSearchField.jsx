import { PatientSearchSelect } from './PatientSearchSelect';
import { PatientAsyncSearchSelect } from './PatientAsyncSearchSelect';

/**
 * Unified patient picker — uses preloaded list when provided, otherwise async API search.
 */
export function PatientSearchField({
  patients,
  async: asyncMode,
  ...props
}) {
  const useAsync = asyncMode ?? !(Array.isArray(patients) && patients.length > 0);
  if (useAsync) {
    return <PatientAsyncSearchSelect {...props} />;
  }
  return <PatientSearchSelect patients={patients} {...props} />;
}

export { PatientSearchSelect, PatientAsyncSearchSelect };
