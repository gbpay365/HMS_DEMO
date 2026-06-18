/**
 * HMS Radiology Module - Exam Templates (~200)
 * Same pattern as lib/labTestTemplates.js
 */
function buildExtendedCatalogTests(count) {
  const names = [
    'Skull X-Ray (AP/Lat)', 'Facial Bones X-Ray', 'Nasal Bones X-Ray', 'Mandible X-Ray', 'Cervical Spine X-Ray (3 views)',
    'Thoracic Spine X-Ray', 'Lumbosacral Spine X-Ray', 'Pelvis X-Ray', 'Hip X-Ray (2 views)', 'Femur X-Ray',
    'Knee X-Ray (2 views)', 'Tibia/Fibula X-Ray', 'Ankle X-Ray', 'Foot X-Ray', 'Shoulder X-Ray (2 views)',
    'Humerus X-Ray', 'Elbow X-Ray', 'Forearm X-Ray', 'Wrist X-Ray', 'Hand X-Ray',
    'Chest X-Ray (PA)', 'Chest X-Ray (AP portable)', 'Ribs X-Ray', 'Sternum X-Ray', 'Abdomen X-Ray (supine/erect)',
    'KUB X-Ray', 'IVU (Intravenous Urogram)', 'Hysterosalpingogram (HSG)', 'Barium Swallow', 'Barium Meal',
    'Barium Follow-through', 'Barium Enema', 'Defecography', 'Micturating Cystourethrogram (MCU)', 'Sialogram',
    'CT Head (non-contrast)', 'CT Head (with contrast)', 'CT Orbits', 'CT Temporal Bones', 'CT Neck (soft tissue)',
    'CT Chest (HRCT)', 'CT Chest (contrast)', 'CT Abdomen/Pelvis (contrast)', 'CT Abdomen/Pelvis (non-contrast)',
    'CT Liver triphasic', 'CT Pancreas protocol', 'CT Renal stone protocol', 'CT Angiography (aorta)', 'CT Pulmonary angiography (CTPA)',
    'CT Coronary angiography (CTCA)', 'CT Enterography', 'CT Colonography (virtual colonoscopy)', 'CT Spine cervical',
    'CT Spine thoracic', 'CT Spine lumbar', 'CT Pelvis', 'CT Hip', 'CT Knee', 'CT Shoulder',
    'MRI Brain (routine)', 'MRI Brain (epilepsy protocol)', 'MRI Brain (pituitary)', 'MRI Orbits', 'MRI IAC (internal auditory canal)',
    'MRI Neck (soft tissue)', 'MRI Cervical Spine', 'MRI Thoracic Spine', 'MRI Lumbar Spine', 'MRI Whole Spine screening',
    'MRI Shoulder', 'MRI Elbow', 'MRI Wrist', 'MRI Hand', 'MRI Hip',
    'MRI Knee', 'MRI Ankle', 'MRI Foot', 'MRI Breast (bilateral)', 'MRI Prostate (multiparametric)',
    'MRI Liver (MRCP)', 'MRI Pancreas', 'MRI Pelvis (female)', 'MRI Pelvis (male)', 'MRI Cardiac (CMR)',
    'Ultrasound Abdomen', 'Ultrasound Pelvis', 'Ultrasound KUB', 'Ultrasound Liver', 'Ultrasound Gallbladder',
    'Ultrasound Pancreas', 'Ultrasound Spleen', 'Ultrasound Thyroid', 'Ultrasound Neck lymph nodes', 'Ultrasound Breast',
    'Ultrasound Scrotum', 'Ultrasound Obstetric (1st trimester)', 'Ultrasound Obstetric (2nd trimester anomaly)', 'Ultrasound Obstetric (3rd trimester growth)',
    'Ultrasound Doppler carotid', 'Ultrasound Doppler renal arteries', 'Ultrasound Doppler lower limb venous', 'Ultrasound Doppler lower limb arterial',
    'Echocardiography (transthoracic)', 'Echocardiography (stress)', 'Transesophageal echocardiography (TEE)', 'Mammography (screening bilateral)',
    'Mammography (diagnostic)', 'Mammography (tomosynthesis)', 'DEXA bone densitometry', 'PET-CT whole body', 'PET-CT brain',
    'Bone scan (whole body)', 'Thyroid scan', 'Renal scan (DTPA)', 'HIDA scan', 'VQ scan (lung)',
    'Angiography cerebral', 'Angiography peripheral runoff', 'Fluoroscopy-guided biopsy', 'CT-guided biopsy', 'US-guided biopsy',
    'PICC line placement (fluoro)', 'Nephrostomy tube check', 'Joint injection (fluoro/US)', 'Myelogram', 'Discography',
    'OPG (orthopantomogram)', 'Dental periapical', 'Cephalometry', 'Sialendoscopy imaging', 'Cone-beam CT dental',
    'Portable chest (ICU)', 'Portable abdomen', 'Trauma CT pan-scan', 'Stroke CT perfusion', 'MRI diffusion (stroke)',
    'MR angiography head', 'MR angiography neck', 'MR venography brain', 'Enteroclysis MRI', 'MR spectroscopy brain',
    'Shear wave elastography liver', 'Contrast-enhanced ultrasound (CEUS) liver', 'Hysterosonography', 'Follicle tracking ultrasound',
    'Musculoskeletal ultrasound shoulder', 'Musculoskeletal ultrasound knee', 'Soft tissue ultrasound lump', 'Pediatric hip ultrasound (DDH)',
    'Neonatal cranial ultrasound', 'Spine ultrasound infant', 'Salivary gland ultrasound', 'Parathyroid ultrasound', 'Adrenal protocol CT'
  ].slice(0, count);
  return names.map((name, i) => ({
    id: 'CATALOG_' + String(i + 1).padStart(4, '0'),
    name,
    fields: [
      { key: 'clinical_indication', label: 'Clinical indication', type: 'textarea' },
      { key: 'technique', label: 'Technique / Protocol', type: 'text' },
      { key: 'findings', label: 'Findings', type: 'textarea' },
      { key: 'impression', label: 'Impression', type: 'textarea' },
      { key: 'recommendation', label: 'Recommendation', type: 'select', options: ['None', 'Clinical correlation', 'Follow-up imaging', 'Specialist referral', 'Urgent review'] }
    ]
  }));
}

const F = [
  { key: 'clinical_indication', label: 'Clinical indication', type: 'textarea' },
  { key: 'technique', label: 'Technique / Protocol', type: 'text' },
  { key: 'comparison', label: 'Comparison', type: 'text' },
  { key: 'findings', label: 'Findings', type: 'textarea' },
  { key: 'impression', label: 'Impression / Conclusion', type: 'textarea' },
  { key: 'recommendation', label: 'Recommendation', type: 'select', options: ['None', 'Clinical correlation', 'Follow-up imaging', 'Specialist referral', 'Urgent review'] }
];

function exam(id, name, extra) {
  return { id, name, fields: extra ? F.concat(extra) : F.slice() };
}

const RAD_TEST_TEMPLATES = {
  xray: {
    label: 'X-Ray & Radiography',
    color: '#6366f1',
    icon: '📷',
    tests: [
      exam('CXR_PA', 'Chest X-Ray (PA)', [{ key: 'lung_fields', label: 'Lung fields', type: 'textarea' }, { key: 'heart', label: 'Heart / mediastinum', type: 'text' }]),
      exam('CXR_AP', 'Chest X-Ray (AP portable)'),
      exam('ABD_XR', 'Abdomen X-Ray (supine/erect)'),
      exam('KUB', 'KUB X-Ray'),
      exam('LS_SPINE', 'Lumbosacral Spine X-Ray'),
      exam('C_SPINE', 'Cervical Spine X-Ray'),
      exam('PELVIS_XR', 'Pelvis X-Ray'),
      exam('KNEE_XR', 'Knee X-Ray (2 views)'),
      exam('HAND_XR', 'Hand X-Ray'),
      exam('SKULL_XR', 'Skull X-Ray')
    ]
  },
  ct: {
    label: 'CT Scan',
    color: '#0891b2',
    icon: '🖥',
    tests: [
      exam('CT_HEAD_NC', 'CT Head (non-contrast)'),
      exam('CT_HEAD_C', 'CT Head (with contrast)'),
      exam('CT_CHEST', 'CT Chest'),
      exam('CT_CTPA', 'CT Pulmonary Angiography (CTPA)'),
      exam('CT_ABD_PEL', 'CT Abdomen & Pelvis'),
      exam('CT_RENAL', 'CT Renal stone protocol'),
      exam('CT_ANGIO_AORTA', 'CT Angiography (aorta)'),
      exam('CT_SPINE_L', 'CT Lumbar Spine'),
      exam('CT_ENTER', 'CT Enterography'),
      exam('CT_COLON', 'CT Colonography')
    ]
  },
  mri: {
    label: 'MRI',
    color: '#7c3aed',
    icon: '🧲',
    tests: [
      exam('MRI_BRAIN', 'MRI Brain (routine)'),
      exam('MRI_BRAIN_STROKE', 'MRI Brain (stroke protocol)'),
      exam('MRI_SPINE_C', 'MRI Cervical Spine'),
      exam('MRI_SPINE_L', 'MRI Lumbar Spine'),
      exam('MRI_KNEE', 'MRI Knee'),
      exam('MRI_SHOULDER', 'MRI Shoulder'),
      exam('MRI_HIP', 'MRI Hip'),
      exam('MRI_BREAST', 'MRI Breast'),
      exam('MRI_PROSTATE', 'MRI Prostate (multiparametric)'),
      exam('MRI_CARDIAC', 'MRI Cardiac')
    ]
  },
  ultrasound: {
    label: 'Ultrasound',
    color: '#0d9488',
    icon: '📡',
    tests: [
      exam('US_ABD', 'Ultrasound Abdomen'),
      exam('US_PELVIS', 'Ultrasound Pelvis'),
      exam('US_OB_1', 'Obstetric Ultrasound (1st trimester)'),
      exam('US_OB_2', 'Obstetric Ultrasound (anomaly scan)'),
      exam('US_THYROID', 'Ultrasound Thyroid'),
      exam('US_BREAST', 'Ultrasound Breast'),
      exam('US_DOPPLER_LEV', 'Doppler Ultrasound (lower limb venous)'),
      exam('US_DOPPLER_CAR', 'Doppler Ultrasound (carotid)'),
      exam('US_ECHO', 'Echocardiography (TTE)'),
      exam('US_SOFT', 'Soft tissue / lump ultrasound')
    ]
  },
  mammography: {
    label: 'Mammography',
    color: '#db2777',
    icon: '🎀',
    tests: [
      exam('MAMMO_SCR', 'Mammography (screening bilateral)'),
      exam('MAMMO_DIAG', 'Mammography (diagnostic)'),
      exam('MAMMO_TOMO', 'Digital breast tomosynthesis'),
      exam('US_BREAST_BIL', 'Breast ultrasound (bilateral)'),
      exam('MRI_BREAST_BIL', 'Breast MRI (bilateral)'),
      exam('BIOPSY_STERE', 'Stereotactic biopsy (imaging report)')
    ]
  },
  fluoroscopy: {
    label: 'Fluoroscopy & Contrast',
    color: '#d97706',
    icon: '💡',
    tests: [
      exam('BA_SWALLOW', 'Barium Swallow'),
      exam('BA_MEAL', 'Barium Meal'),
      exam('BA_ENEMA', 'Barium Enema'),
      exam('IVU', 'IVU (Intravenous Urogram)'),
      exam('HSG', 'Hysterosalpingogram (HSG)'),
      exam('MCU', 'Micturating Cystourethrogram (MCU)'),
      exam('FLUORO_BIOPSY', 'Fluoroscopy-guided procedure report')
    ]
  },
  nuclear: {
    label: 'Nuclear Medicine & PET',
    color: '#ca8a04',
    icon: '☢',
    tests: [
      exam('BONE_SCAN', 'Bone scan (whole body)'),
      exam('PET_CT_WB', 'PET-CT whole body'),
      exam('THYROID_SCAN', 'Thyroid scan'),
      exam('RENAL_DTPA', 'Renal scan (DTPA)'),
      exam('VQ_SCAN', 'VQ scan (lung)'),
      exam('HIDA', 'HIDA scan')
    ]
  },
  interventional: {
    label: 'Interventional Radiology',
    color: '#b45309',
    icon: '🩺',
    tests: [
      exam('ANGIO_CEREB', 'Cerebral angiography report'),
      exam('ANGIO_PERIPH', 'Peripheral angiography report'),
      exam('CT_GUIDED_BX', 'CT-guided biopsy report'),
      exam('US_GUIDED_BX', 'Ultrasound-guided biopsy report'),
      exam('EMBOLIZATION', 'Embolization procedure report'),
      exam('DRAIN_PLACE', 'Image-guided drain placement report')
    ]
  },
  dental: {
    label: 'Dental & Maxillofacial',
    color: '#475569',
    icon: '🦷',
    tests: [
      exam('OPG', 'OPG (orthopantomogram)'),
      exam('CBCT', 'Cone-beam CT (dental)'),
      exam('CEPH', 'Cephalometry'),
      exam('TMJ_IMAGING', 'TMJ imaging'),
      exam('SIALO', 'Sialogram')
    ]
  },
  cardiac: {
    label: 'Cardiac Imaging',
    color: '#dc2626',
    icon: '❤',
    tests: [
      exam('ECHO_TTE', 'Transthoracic echocardiography'),
      exam('ECHO_STRESS', 'Stress echocardiography'),
      exam('ECHO_TEE', 'Transesophageal echocardiography'),
      exam('CTCA', 'CT coronary angiography'),
      exam('CMR', 'Cardiac MRI'),
      exam('MUGA', 'MUGA scan / nuclear ventriculography')
    ]
  },
  neuro: {
    label: 'Neuroradiology',
    color: '#4f46e5',
    icon: '🧠',
    tests: [
      exam('MRI_IAC', 'MRI internal auditory canals'),
      exam('MRA_HEAD', 'MR angiography head'),
      exam('MRV_BRAIN', 'MR venography brain'),
      exam('CT_PERF_STROKE', 'CT perfusion (stroke)'),
      exam('MYELOGRAM', 'Myelogram'),
      exam('DISCOGRAPHY', 'Discography')
    ]
  },
  extended_catalog: {
    label: 'Extended Exam Catalog',
    color: '#64748b',
    icon: '📋',
    tests: buildExtendedCatalogTests(130)
  }
};

function getAllTests() {
  const out = [];
  for (const [catKey, cat] of Object.entries(RAD_TEST_TEMPLATES)) {
    for (const t of cat.tests || []) {
      out.push({ ...t, categoryKey: catKey, categoryLabel: cat.label, categoryColor: cat.color, categoryIcon: cat.icon });
    }
  }
  return out;
}
function getTestById(testId) {
  const id = String(testId || '').trim();
  if (!id) return null;
  for (const t of getAllTests()) if (t.id === id) return t;
  return null;
}
function getTestsByCategory(categoryKey) {
  const cat = RAD_TEST_TEMPLATES[categoryKey];
  if (!cat) return [];
  return (cat.tests || []).map(t => ({ ...t, categoryKey, categoryLabel: cat.label }));
}
function getCategories() {
  return Object.entries(RAD_TEST_TEMPLATES).map(([key, c]) => ({
    key, label: c.label, color: c.color, icon: c.icon, count: (c.tests || []).length
  }));
}
function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function compactTokens(s) {
  return normalize(s)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      if (token === 'abdominal') return 'abdomen';
      if (token === 'brain') return 'head';
      if (token === 'plain') return 'noncontrast';
      if (token === 'non' || token === 'without') return 'noncontrast';
      if (token === 'contrast') return 'contrast';
      return token;
    });
}

function tokenScore(orderName, templateName) {
  const orderTokens = new Set(compactTokens(orderName));
  const templateTokens = new Set(compactTokens(templateName));
  if (!orderTokens.size || !templateTokens.size) return 0;
  let overlap = 0;
  for (const token of orderTokens) {
    if (templateTokens.has(token)) overlap++;
  }
  const modalityBoost =
    (orderTokens.has('ultrasound') && templateTokens.has('ultrasound')) ||
    (orderTokens.has('ct') && templateTokens.has('ct')) ||
    (orderTokens.has('mri') && templateTokens.has('mri')) ||
    (orderTokens.has('x') && orderTokens.has('ray') && templateTokens.has('x') && templateTokens.has('ray'))
      ? 3
      : 0;
  return overlap * 10 + modalityBoost;
}

function suggestTemplateForOrderName(orderName) {
  const n = normalize(orderName);
  if (!n) return null;

  if (/\bultrasound\b/.test(n) && /\babdominal?\b|\babdomen\b/.test(n)) {
    return { catKey: 'ultrasound', testId: 'US_ABD', testName: 'Ultrasound Abdomen' };
  }
  if (/\b(head|brain)\b/.test(n) && /\b(with|contrast)\b/.test(n) && !/\bplain\b|\bnon\b|\bwithout\b/.test(n)) {
    return { catKey: 'ct', testId: 'CT_HEAD_C', testName: 'CT Head (with contrast)' };
  }
  if (/\b(head|brain)\b/.test(n) && (/\bplain\b|\bnon\b|\bwithout\b/.test(n) || !/\bcontrast\b/.test(n))) {
    return { catKey: 'ct', testId: 'CT_HEAD_NC', testName: 'CT Head (non-contrast)' };
  }

  let best = null;
  let bestScore = 0;
  for (const t of getAllTests()) {
    const tn = normalize(t.name);
    if (n === tn) return { catKey: t.categoryKey, testId: t.id, testName: t.name };
    if (tn.includes(n) || n.includes(tn)) {
      const score = Math.min(tn.length, n.length);
      if (score > bestScore) { bestScore = score; best = t; }
    }
    const score = tokenScore(orderName, t.name);
    if (score > bestScore) { bestScore = score; best = t; }
  }
  if (best && bestScore >= 20) return { catKey: best.categoryKey, testId: best.id, testName: best.name };
  return null;
}
function flagValue() { return 'n/a'; }
function generateReportObject({ patientInfo, testId, values, conclusion, technicianId }) {
  const template = getTestById(testId);
  if (!template) throw new Error('Exam template not found: ' + testId);
  const results = template.fields.map(field => ({
    key: field.key,
    label: field.label,
    type: field.type || '',
    value: values[field.key] ?? '',
    unit: field.unit || '',
    refRange: field.refRange || '',
    normalMin: field.normalMin,
    normalMax: field.normalMax,
    flag: flagValue(field, values[field.key])
  }));
  return {
    reportId: 'RPT-' + Date.now(),
    testId: template.id,
    testName: template.name,
    category: template.categoryLabel || '',
    categoryKey: template.categoryKey || '',
    patientInfo,
    results,
    conclusion: conclusion || '',
    technicianId: technicianId || '',
    generatedAt: new Date().toISOString()
  };
}
module.exports = {
  RAD_TEST_TEMPLATES,
  getAllTests,
  getTestById,
  getTestsByCategory,
  getCategories,
  suggestTemplateForOrderName,
  flagValue,
  generateReportObject
};
