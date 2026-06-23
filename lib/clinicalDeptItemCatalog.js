'use strict';

/** Static procurement item catalogs by department and line type (merged with inventory at runtime). */
const CATALOG = {
  laboratory: {
    reagent: [
      'CBC / hematology reagent kit',
      'Differential stain reagent (Wright-Giemsa)',
      'ESR pipette reagent',
      'Reticulocyte stain',
      'Blood grouping anti-A serum',
      'Blood grouping anti-B serum',
      'Blood grouping anti-D (Rh) serum',
      'Cross-match Coombs reagent',
      'Glucose (GOD-PAP) reagent',
      'Urea / BUN reagent',
      'Creatinine reagent',
      'Liver function ALT reagent',
      'Liver function AST reagent',
      'Bilirubin total reagent',
      'Bilirubin direct reagent',
      'Albumin reagent',
      'Total protein reagent',
      'Lipid profile cholesterol reagent',
      'Lipid profile HDL reagent',
      'Lipid profile LDL reagent',
      'Triglycerides reagent',
      'HbA1c reagent',
      'Electrolyte Na/K/Cl reagent',
      'Calcium reagent',
      'Magnesium reagent',
      'Phosphate reagent',
      'CRP latex reagent',
      'Rheumatoid factor reagent',
      'Troponin rapid reagent',
      'BNP rapid reagent',
      'PT / INR reagent',
      'APTT reagent',
      'D-dimer reagent',
      'Fibrinogen reagent',
      'Malaria RDT (Pf/Pv)',
      'HIV 1/2 rapid test',
      'HBsAg rapid test',
      'HCV rapid test',
      'Syphilis VDRL reagent',
      'Pregnancy hCG rapid test',
      'Urine dipstick 10-parameter',
      'Urine microalbumin reagent',
      'Stool occult blood reagent',
      'Gram stain crystal violet',
      'Gram stain iodine',
      'Gram stain safranin',
      'Ziehl-Neelsen stain',
      'Culture media — blood agar',
      'Culture media — MacConkey agar',
      'Culture media — Sabouraud dextrose agar',
      'Mueller-Hinton agar',
      'Antibiotic sensitivity discs',
      'Quality control serum — chemistry',
      'Quality control serum — hematology',
      'Calibrator — glucose',
      'Calibrator — lipid panel',
      'Wash buffer concentrate',
      'Distilled / deionized water (lab grade)',
    ],
    consumable: [
      'Vacutainer EDTA (lavender) 4ml',
      'Vacutainer serum (red/gold) 5ml',
      'Vacutainer citrate (blue) 2.7ml',
      'Vacutainer fluoride/oxalate (grey)',
      'Pediatric microtainer tubes',
      'Blood collection needles 21G',
      'Blood collection needles 23G',
      'Tourniquet — disposable',
      'Alcohol swabs 70%',
      'Gauze pads sterile',
      'Adhesive bandages',
      'Lancets — safety',
      'Urine specimen container 60ml',
      'Stool specimen container',
      'Sputum collection container',
      'Microscope slides — frosted',
      'Cover slips 22×22mm',
      'Pasteur pipettes',
      'Serological pipettes 10ml',
      'Micropipette tips 200µl',
      'Micropipette tips 1000µl',
      'PCR tubes 0.2ml',
      'PCR plate 96-well',
      'Parafilm sealing film',
      'Laboratory gloves — nitrile M',
      'Laboratory gloves — nitrile L',
      'Face masks — surgical',
      'Biohazard waste bags',
      'Sharps container 5L',
      'Specimen transport bag',
      'Cuvettes — semi-micro',
      'Filter paper — sample collection',
    ],
    equipment: [
      'Centrifuge — benchtop',
      'Microhematocrit centrifuge',
      'Microscope — binocular',
      'Hot plate / dry bath',
      'Water bath 37°C',
      'Incubator 37°C',
      'Refrigerator 2–8°C — lab',
      'Freezer −20°C',
      'Autoclave — tabletop',
      'Micropipette set (P20/P200/P1000)',
      'Pipette controller',
      'Vortex mixer',
      'Hematology analyzer reagent pack holder',
      'Chemistry analyzer electrode kit',
      'Glucose meter — hospital grade',
      'ELISA washer',
      'ELISA reader / photometer',
      'Timer / stopwatch',
      'Digital scale — analytical',
      'pH meter — lab',
    ],
    spare_part: [
      'Centrifuge rotor',
      'Centrifuge lid latch',
      'Microscope bulb / LED module',
      'Microscope objective 40×',
      'Analyzer pump tubing set',
      'Analyzer probe / needle',
      'Printer paper — lab report',
      'Barcode label roll',
      'Refrigerator door gasket',
      'Incubator shelf',
    ],
    other: [
      'Laboratory request forms',
      'Barcode specimen labels',
      'Safety data sheet binder',
      'QC logbook',
      'External quality assessment kit',
    ],
  },
  radiology: {
    reagent: [
      'IV iodinated contrast 300 mg I/ml — 50ml',
      'IV iodinated contrast 300 mg I/ml — 100ml',
      'IV iodinated contrast 350 mg I/ml — 100ml',
      'Low-osmolar contrast (LOCM) 100ml',
      'Gadolinium contrast — 10ml vial',
      'Gadolinium contrast — 15ml vial',
      'Barium sulfate suspension — oral',
      'Barium sulfate enema kit',
      'Ultrasound coupling gel — 5L',
      'Ultrasound gel — sterile packet',
      'Definity / microbubble contrast (US)',
      'Saline flush bags 100ml (contrast line)',
      'Heparinized saline flush',
      'Local anesthetic lidocaine 1%',
      'Skin antiseptic chlorhexidine',
    ],
    consumable: [
      'X-ray film 35×43cm',
      'CR imaging plate cover',
      'DR detector protective cover',
      'Lead apron — adult',
      'Lead apron — pediatric',
      'Thyroid collar — lead',
      'Gonadal shield',
      'Radiation badge holder',
      'Syringe 50ml — contrast',
      'Pressure tubing — power injector',
      'CT contrast power injector syringe kit',
      'Needle-free connector',
      'Sterile drapes — procedure',
      'Gloves — sterile pairs',
      'Gauze sponges',
      'Adhesive tape — surgical',
      'Marker pen — skin',
      'Patient positioning sponges',
      'Immobilization straps',
      'CD/DVD — patient image export',
      'Thermal paper — US printer',
    ],
    equipment: [
      'Ultrasound transducer — convex',
      'Ultrasound transducer — linear',
      'Ultrasound transducer — cardiac',
      'CT contrast power injector',
      'Mobile X-ray unit battery',
      'X-ray tube collimator',
      'CR reader / digitizer',
      'PACS workstation monitor',
      'Doppler ultrasound probe',
      'Portable ultrasound machine',
      'Lead screen — mobile',
      'Film illuminator / view box',
    ],
    spare_part: [
      'Ultrasound transducer cable',
      'CT injector motor assembly',
      'X-ray collimator lamp',
      'Printer fuser unit — radiology',
      'CR plate — replacement',
      'Power injector piston seal kit',
      'Monitor power supply',
    ],
    other: [
      'Radiology request forms',
      'Contrast reaction emergency kit refill',
      'Radiation safety signage',
      'Patient consent forms — contrast',
      'PACS CD mailer envelopes',
    ],
  },
};

const TYPE_KEYWORDS = {
  reagent: /\b(reagent|stain|contrast|medium|calibrat|control\s*serum|buffer|antisera|antisérum|kit\s*chem|god-?pap|rdt|dipstick|culture\s*media|gel\b.*\b(us|ultrasound))\b/i,
  consumable: /\b(consumable|vacutainer|tube|syringe|glove|swab|gauze|slide|cover\s*slip|pipette\s*tip|cuvette|film\b|apron|drape|sponge|label|bag|mask|lancet|container)\b/i,
  equipment: /\b(equipment|analyzer|centrifuge|microscope|incubator|refrigerator|freezer|autoclave|injector|transducer|monitor|digitizer|workstation|unit\b)\b/i,
  spare_part: /\b(spare|rotor|probe|tubing|gasket|seal|lamp|fuser|electrode|replacement|assembly)\b/i,
};

function inferItemType(name, category, department) {
  const hay = `${name || ''} ${category || ''}`;
  for (const [type, re] of Object.entries(TYPE_KEYWORDS)) {
    if (re.test(hay)) return type;
  }
  const dept = String(department || '').toLowerCase();
  if (dept === 'radiology' && /\b(contrast|barium|gadolinium|gel)\b/i.test(hay)) return 'reagent';
  if (/\b(reagent|stain|contrast)\b/i.test(hay)) return 'reagent';
  return 'consumable';
}

function catalogFor(department, itemType) {
  const dept = String(department || 'laboratory').toLowerCase();
  const type = String(itemType || 'consumable').toLowerCase();
  const bucket = CATALOG[dept] || CATALOG.laboratory;
  return [...(bucket[type] || bucket.consumable || [])];
}

function buildItemOptions(department, inventoryItems) {
  const dept = String(department || 'laboratory').toLowerCase();
  const byType = {};
  for (const type of ['reagent', 'consumable', 'equipment', 'spare_part', 'other']) {
    byType[type] = [];
  }

  const seen = new Set();
  const add = (type, entry) => {
    const key = `${type}::${entry.source}::${entry.id || entry.name}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    if (!byType[type]) byType[type] = [];
    byType[type].push(entry);
  };

  for (const name of catalogFor(dept, 'reagent')) {
    add('reagent', { id: null, name, source: 'catalog', inventory_item_id: null });
  }
  for (const name of catalogFor(dept, 'consumable')) {
    add('consumable', { id: null, name, source: 'catalog', inventory_item_id: null });
  }
  for (const name of catalogFor(dept, 'equipment')) {
    add('equipment', { id: null, name, source: 'catalog', inventory_item_id: null });
  }
  for (const name of catalogFor(dept, 'spare_part')) {
    add('spare_part', { id: null, name, source: 'catalog', inventory_item_id: null });
  }
  for (const name of catalogFor(dept, 'other')) {
    add('other', { id: null, name, source: 'catalog', inventory_item_id: null });
  }

  for (const inv of inventoryItems || []) {
    const type = inferItemType(inv.name, inv.category, dept);
    add(type, {
      id: `inv-${inv.id}`,
      name: inv.name,
      source: 'inventory',
      inventory_item_id: inv.id,
      sku: inv.sku,
      qty: inv.qty,
      stockLabel: inv.stockLabel,
      label: inv.label || inv.name,
    });
  }

  for (const type of Object.keys(byType)) {
    byType[type].sort((a, b) => {
      if (a.source !== b.source) return a.source === 'inventory' ? -1 : 1;
      return String(a.name).localeCompare(String(b.name));
    });
  }

  return byType;
}

module.exports = {
  CATALOG,
  catalogFor,
  inferItemType,
  buildItemOptions,
};
