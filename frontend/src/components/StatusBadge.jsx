import { badgeClass } from '../lib/listUi';

export function StatusBadge({ variant, label }) {
  return <span className={badgeClass(variant)}>{label}</span>;
}
