#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projects = ['C:/HMS_JS', 'C:/HMS_DEMO'];

for (const proj of projects) {
  const file = path.join(proj, 'frontend/src/pages/ConsultationNewPageApp.jsx');
  let src = fs.readFileSync(file, 'utf8');

  src = src.replace(
    /import \{ useEffect, useMemo, useState \} from 'react';/,
    "import { useMemo, useState } from 'react';"
  );
  src = src.replace(
    /import \{ CatalogSearchSelect \} from '\.\.\/components\/CatalogSearchSelect';\nimport \{ OrderSectionShell \} from '\.\.\/components\/OrderSectionShell';\nimport \{ todayIsoDate \} from '\.\.\/lib\/prescriptionDate';/,
    "import { formatMoney, priceUnitLabel } from '../lib/hmsLocale';"
  );
  src = src.replace(
    /import \{ calcMedQuantity, formatMedQuantityFormula \} from '\.\.\/lib\/calcMedQuantity';/,
    `import {
  ConsultationPrescriptionSection,
  initialMedRows,
  validateMedicationRows} from '../components/consultation/ConsultationPrescriptionSection';`
  );

  if (!src.includes("freq_only_once")) {
    src = src.replace(
      'const MED_FREQUENCY_VALUES = [',
      "const MED_FREQUENCY_VALUES = [\n  { value: 'Only Once', key: 'freq_only_once' },"
    );
  }

  src = src.replace(
    `function SectionCard({ icon, title, action, children }) {
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hms-surface-card">`,
    `function SectionCard({ icon, title, action, children, overflowVisible = false, className = '' }) {
  return (
    <div
      className={\`mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm hms-surface-card \${
        overflowVisible ? 'overflow-visible' : 'overflow-hidden'
      } \${className}\`}>`
  );

  src = src.replace(/\nconst medRxInputBase =[\s\S]*?\n\}\n\n\nexport function ConsultationNewPageApp/, '\n\nexport function ConsultationNewPageApp');

  src = src.replace(
    /const \[medRows, setMedRows\] = useState\(\(\) =>\s*existingMeds\.length[\s\S]*?\);\s*\n  const \[medError/,
    `const [medRows, setMedRows] = useState(() => initialMedRows(existingMeds, pharmacyCatalog));
  const [medError`
  );

  src = src.replace(
    /\n  const addMedRow = \(\) =>[\s\S]*?removeMedRow[\s\S]*?\);\n\n  const handleSubmit/,
    '\n\n  const handleSubmit'
  );

  src = src.replace(
    `<div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-8">`,
    `<div className="grid gap-4 lg:grid-cols-12 lg:items-start">
            <div className="flex flex-col gap-4 lg:col-span-8">`
  );

  src = src.replace(
    /<SectionCard icon=\{<i className="fa fa-medkit text-brand" aria-hidden \/>\} title=\{t\('consultation\.medications'\)\}>[\s\S]*?<\/SectionCard>\s*\n            <\/div>\s*\n\s*<div className="lg:col-span-4">/,
    `<SectionCard
                icon={<i className="fa fa-medkit text-brand" aria-hidden />}
                title={t('consultation.medications')}
                overflowVisible
                className="mb-0"
              >
                <ConsultationPrescriptionSection
                  medRows={medRows}
                  setMedRows={setMedRows}
                  pharmacyCatalog={pharmacyCatalog}
                  medOptions={medOptions}
                  patientAge={patientAge}
                  patientGender={patientGender}
                  medError={medError}
                  visitId={visitId}
                />
                <p className="mt-2 text-xs text-slate-500">{t('consultation.meds_custom_hint')}</p>
              </SectionCard>
            </div>

            <div className="flex flex-col gap-4 lg:col-span-4">`
  );

  fs.writeFileSync(file, src);
  console.log('Patched', file);
}
