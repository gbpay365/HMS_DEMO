export function annualDomainLabel(t, domain) {
  return t(`directorAnnual.domains.${domain.id}`);
}

export function annualPanelLabel(t, panel) {
  return t(`directorAnnual.panels.${panel.id}`);
}

export function hasAnnualPanel(panels, id) {
  return (panels || []).some((p) => p.id === id);
}

export function hasAnnualDomain(domains, id) {
  return (domains || []).some((d) => d.id === id);
}

export function gradeLabel(score) {
  if (score >= 90) return { grade: 'A', label: 'Excellent' };
  if (score >= 80) return { grade: 'B', label: 'Good' };
  if (score >= 70) return { grade: 'C', label: 'Adequate' };
  if (score >= 60) return { grade: 'D', label: 'Needs work' };
  return { grade: 'F', label: 'Critical' };
}
