/**
 * HMS Lab Module - Test Templates
 * 200+ Pre-defined laboratory test templates
 * Each template contains: id, name, category, fields, referenceRanges, and conclusion options
 */

/**
 * Additional catalog entries to reach 200+ distinct templates (unique ids).
 */
function buildExtendedCatalogTests(count) {
  const names = [
    'Alpha-1 Antitrypsin', 'Alpha-2 Macroglobulin', 'Prealbumin (Transthyretin)', 'Ceruloplasmin', 'Haptoglobin',
    'Transferrin', 'Ferritin Index (sTfR/log ferritin)', 'Soluble Transferrin Receptor', 'Zinc Protoporphyrin',
    'Glycated Albumin', 'Fructosamine', 'C-Peptide (fasting)', 'C-Peptide (stimulated)', 'Insulin (fasting)',
    'Proinsulin', 'GAD65 Antibodies', 'IA-2 Antibodies', 'Zinc Transporter 8 Antibody', 'Islet Cell Antibodies',
    'Anti-TPO', 'Anti-Thyroglobulin', 'TRAb (TSH receptor Ab)', 'Calcitonin', 'PTH-related peptide',
    '1,25-Dihydroxyvitamin D', '24h Urine Calcium', '24h Urine Phosphate', '24h Urine Uric Acid',
    'Fractionated Urine Metanephrines', 'Plasma Metanephrines', 'VMA (24h urine)', '5-HIAA (24h urine)',
    'Plasma Renin Activity', 'Aldosterone/Renin Ratio', '17-OH Progesterone', 'DHEA-Sulfate', 'Androstenedione',
    'Testosterone (free)', 'Testosterone (bioavailable)', 'SHBG', 'Estradiol (sensitive)', 'Progesterone (serum)',
    'LH', 'FSH', 'Prolactin (macroprolactin screen)', 'IGF-1', 'IGFBP-3', 'Growth Hormone (suppression)',
    'ACTH (plasma)', 'Midnight Salivary Cortisol', '24h Urine Free Cortisol', 'Dexamethasone Suppression Test',
    'Plasma Osmolality', 'Urine Osmolality', 'Serum Osmolal Gap', 'Anion Gap (calculated)', 'Serum Chloride',
    'Serum Bicarbonate (CO2)', 'Serum Phosphorus', 'Serum Magnesium', 'Serum Zinc', 'Serum Copper',
    'Serum Selenium', 'Whole Blood Lead', 'Arsenic (blood)', 'Mercury (blood)', 'Mercury (urine 24h)',
    'Urine Microalbumin/Creatinine Ratio', 'Urine Protein/Creatinine Ratio', 'Urine Electrolytes (Na/K/Cl)',
    'Fractional Excretion of Sodium', 'Urine Citrate', 'Urine Oxalate', 'Urine Urea Nitrogen', 'Urine Creatinine Clearance',
    'Cystatin C (eGFR adjunct)', 'Beta-2 Microglobulin (serum)', 'Beta-2 Microglobulin (urine)', 'Free Light Chains (kappa)',
    'Free Light Chains (lambda)', 'Kappa/Lambda FLC Ratio', 'Serum Protein Electrophoresis', 'Urine Protein Electrophoresis',
    'Immunofixation (serum)', 'Immunofixation (urine)', 'Cryoglobulins', 'Cold Agglutinin Titer', 'Direct Antiglobulin (DAT)',
    'Indirect Antiglobulin (IAT)', 'Antibody Screen (extended)', 'Kleihauer-Betke', 'Fetal Fibronectin', 'D-dimer (high sensitivity)',
    'Fibrinogen', 'Factor II (prothrombin)', 'Factor V', 'Factor VII', 'Factor VIII Activity', 'Factor VIII Inhibitor',
    'Factor IX', 'Factor X', 'Factor XI', 'Factor XII', 'von Willebrand Antigen', 'von Willebrand Ristocetin Cofactor',
    'Protein C Activity', 'Protein S (free)', 'Protein S (total)', 'Antithrombin III', 'Lupus Anticoagulant Screen',
    'Anti-cardiolipin IgG', 'Anti-cardiolipin IgM', 'Anti-beta-2 glycoprotein I', 'Homocysteine', 'Lipoprotein(a)',
    'Apolipoprotein A1', 'Apolipoprotein B', 'LDL Particle Number', 'Small Dense LDL', 'HDL Subfractions',
    'HSV-1 IgG', 'HSV-2 IgG', 'HSV PCR', 'VZV IgG', 'VZV IgM', 'EBV VCA IgG', 'EBV VCA IgM', 'EBV EA IgG',
    'CMV IgG', 'CMV IgM', 'CMV PCR (quantitative)', 'Parvovirus B19 IgM', 'Measles IgG', 'Mumps IgG', 'Rubella IgG',
    'Toxoplasma IgG', 'Toxoplasma IgM', 'Leishmania serology', 'Brucella agglutination', 'Widal (Salmonella)',
    'ASO Titer', 'Anti-DNase B', 'Helicobacter pylori stool Ag', 'H. pylori urea breath', 'Clostridioides difficile toxin A/B',
    'C. difficile PCR', 'Rotavirus Ag', 'Norovirus PCR', 'Adenovirus PCR', 'RSV Ag', 'Influenza A/B PCR',
    'COVID-19 PCR', 'COVID-19 Ag (rapid)', 'Legionella urinary Ag', 'Streptococcus pneumoniae urinary Ag',
    'Cryptococcal Ag (CSF/serum)', 'Galactomannan (Aspergillus)', 'Beta-D-glucan', 'Blood culture (aerobic)',
    'Blood culture (anaerobic)', 'Fungal blood culture', 'AFB smear', 'AFB culture', 'GeneXpert MTB/RIF',
    'Xpert CT/NG', 'Chlamydia trachomatis PCR', 'Neisseria gonorrhoeae PCR', 'Trichomonas vaginalis NAAT',
    'Bacterial vaginosis panel', 'Group B Streptococcus PCR', 'MRSA nasal PCR', 'VRE screen', 'ESBL screen',
    'Carbapenemase gene PCR', 'Urine culture', 'Stool culture', 'Stool O&P', 'Giardia/Cryptosporidium Ag',
    'Strongyloides serology', 'Schistosoma serology', 'Filariasis serology', 'Blood film for microfilaria',
    'Bone marrow aspirate comment', 'Flow cytometry (lymphocyte subset)', 'CD4 count', 'CD8 count', 'CD4/CD8 ratio',
    'Immunoglobulin IgG subclasses', 'IgE (total)', 'Specific IgE panel (inhalant)', 'Specific IgE panel (food)',
    'Complement C1q', 'Complement C1 inhibitor', 'CH50 (total complement)', 'ANA by IFA', 'ANA reflex titer',
    'Anti-dsDNA', 'Anti-Sm', 'Anti-RNP', 'Anti-Ro/SSA', 'Anti-La/SSB', 'Anti-Scl-70', 'Anti-centromere',
    'Anti-Jo-1', 'Anti-Mi-2', 'Anti-CCP', 'Rheumatoid Factor (nephelometry)', 'ANCA (PR3)', 'ANCA (MPO)',
    'Anti-GBM', 'Anti-mitochondrial M2', 'Anti-LKM-1', 'Anti-smooth muscle', 'Anti-parietal cell', 'Intrinsic Factor Ab',
    'Tissue Transglutaminase IgA', 'Endomysial IgA', 'Gliadin Deamidated IgG', 'Gliadin Deamidated IgA',
    'Calprotectin (stool)', 'Lactoferrin (stool)', 'Elastase-1 (stool)', 'Fecal Occult Blood (FIT)', 'Stool pH',
    'Reducing substances (stool)', 'Sweat Chloride Test', 'Phenylalanine (PKU screen)', 'Galactosemia screen',
    'Biotinidase deficiency screen', 'Tandem MS newborn screen', 'Hemoglobin electrophoresis', 'HbA2 quantitation',
    'HbF quantitation', 'Sickle cell solubility', 'G6PD quantitative', 'Pyruvate kinase', 'Heinz body prep',
    'Osmotic fragility', 'Eosinophil count (absolute)', 'Basophil count (absolute)', 'Reticulocyte index',
    'Nucleated RBC count', 'Blast screen (manual)', 'CD55/CD59 (PNH)', 'FLAER (PNH)', 'JAK2 V617F mutation',
    'CALR mutation', 'MPL mutation', 'BCR-ABL1 qualitative', 'BCR-ABL1 quantitative (IS)', 'FLT3-ITD', 'NPM1 mutation',
    'PML-RARA by PCR', 'BRAF V600E', 'EGFR mutation', 'ALK rearrangement FISH', 'ROS1 IHC', 'PD-L1 IHC',
    'HER2/neu IHC', 'Ki-67 IHC', 'Microsatellite instability', 'Mismatch repair proteins IHC', 'HPV genotyping',
    'Chlamydia trachomatis culture', 'Neisseria culture', 'Fungal KOH prep', 'Scabies prep', 'Patch test panel',
    'Allergy prick test summary', 'Drug level – Vancomycin (trough)', 'Drug level – Vancomycin (peak)',
    'Drug level – Gentamicin (trough)', 'Drug level – Gentamicin (peak)', 'Drug level – Amikacin',
    'Drug level – Digoxin', 'Drug level – Phenytoin (total)', 'Drug level – Phenytoin (free)', 'Drug level – Valproate',
    'Drug level – Carbamazepine', 'Drug level – Lithium', 'Drug level – Theophylline', 'Drug level – Cyclosporine',
    'Drug level – Tacrolimus', 'Drug level – Sirolimus', 'Drug level – Methotrexate', 'Salicylate level',
    'Ethanol (quantitative)', 'Carboxyhemoglobin', 'Methemoglobin', 'Volatile screen (qualitative)'
  ].slice(0, count);

  return names.map((name, i) => ({
    id: `CATALOG_${String(i + 1).padStart(4, '0')}`,
    name,
    fields: [
      { key: 'result', label: 'Result / Value', type: 'text' },
      { key: 'unit_ref', label: 'Unit / Reference', type: 'text' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' }
    ]
  }));
}

const LAB_TEST_TEMPLATES = {

  // ─────────────────────────────────────────────
  // HEMATOLOGY
  // ─────────────────────────────────────────────
  hematology: {
    label: "Hematology",
    color: "#e74c3c",
    icon: "🩸",
    tests: [
      {
        id: "CBC",
        name: "Complete Blood Count (CBC)",
        fields: [
          { key: "wbc",       label: "WBC",        unit: "x10³/µL", type: "number", refRange: "4.5 – 11.0",  normalMin: 4.5,  normalMax: 11.0 },
          { key: "rbc",       label: "RBC",        unit: "x10⁶/µL", type: "number", refRange: "4.5 – 5.5 (M) / 4.0 – 5.0 (F)", normalMin: 4.0, normalMax: 5.5 },
          { key: "hgb",       label: "Hemoglobin", unit: "g/dL",    type: "number", refRange: "13.5 – 17.5 (M) / 12.0 – 15.5 (F)", normalMin: 12.0, normalMax: 17.5 },
          { key: "hct",       label: "Hematocrit", unit: "%",       type: "number", refRange: "41 – 53 (M) / 36 – 46 (F)", normalMin: 36, normalMax: 53 },
          { key: "mcv",       label: "MCV",        unit: "fL",      type: "number", refRange: "80 – 100",    normalMin: 80,   normalMax: 100 },
          { key: "mch",       label: "MCH",        unit: "pg",      type: "number", refRange: "27 – 33",     normalMin: 27,   normalMax: 33 },
          { key: "mchc",      label: "MCHC",       unit: "g/dL",    type: "number", refRange: "32 – 36",     normalMin: 32,   normalMax: 36 },
          { key: "rdw",       label: "RDW",        unit: "%",       type: "number", refRange: "11.5 – 14.5", normalMin: 11.5, normalMax: 14.5 },
          { key: "plt",       label: "Platelets",  unit: "x10³/µL", type: "number", refRange: "150 – 400",   normalMin: 150,  normalMax: 400 },
          { key: "mpv",       label: "MPV",        unit: "fL",      type: "number", refRange: "7.5 – 12.5",  normalMin: 7.5,  normalMax: 12.5 },
          { key: "neutrophils", label: "Neutrophils", unit: "%",    type: "number", refRange: "50 – 70",     normalMin: 50,   normalMax: 70 },
          { key: "lymphocytes", label: "Lymphocytes", unit: "%",    type: "number", refRange: "20 – 40",     normalMin: 20,   normalMax: 40 },
          { key: "monocytes",   label: "Monocytes",   unit: "%",    type: "number", refRange: "2 – 8",       normalMin: 2,    normalMax: 8 },
          { key: "eosinophils", label: "Eosinophils", unit: "%",    type: "number", refRange: "1 – 4",       normalMin: 1,    normalMax: 4 },
          { key: "basophils",   label: "Basophils",   unit: "%",    type: "number", refRange: "0 – 1",       normalMin: 0,    normalMax: 1 },
          { key: "remarks",     label: "Morphology / Remarks", type: "textarea" }
        ]
      },
      {
        id: "ESR",
        name: "Erythrocyte Sedimentation Rate (ESR)",
        fields: [
          { key: "esr",     label: "ESR (1hr)",  unit: "mm/hr", type: "number", refRange: "0–15 (M) / 0–20 (F)", normalMin: 0, normalMax: 20 },
          { key: "method",  label: "Method",     type: "select", options: ["Westergren", "Wintrobe"] },
          { key: "remarks", label: "Remarks",    type: "textarea" }
        ]
      },
      {
        id: "PERIPHERAL_SMEAR",
        name: "Peripheral Blood Smear",
        fields: [
          { key: "rbc_morphology",  label: "RBC Morphology",  type: "select", options: ["Normocytic Normochromic", "Microcytic Hypochromic", "Macrocytic", "Sickle Cells", "Target Cells", "Spherocytes", "Schistocytes"] },
          { key: "wbc_morphology",  label: "WBC Morphology",  type: "select", options: ["Normal", "Toxic Granulation", "Blast Cells", "Atypical Lymphocytes", "Hypersegmented Neutrophils"] },
          { key: "platelet_morph",  label: "Platelet Morphology", type: "select", options: ["Normal", "Thrombocytopenia", "Thrombocytosis", "Giant Platelets", "Platelet Clumps"] },
          { key: "parasites",       label: "Parasites",       type: "select", options: ["Not Seen", "Malaria Parasites Seen", "Trypanosomes Seen"] },
          { key: "impression",      label: "Impression",      type: "textarea" },
          { key: "remarks",         label: "Remarks",         type: "textarea" }
        ]
      },
      {
        id: "MALARIA_RDT",
        name: "Malaria Rapid Diagnostic Test (RDT)",
        fields: [
          { key: "pf",      label: "P. falciparum (HRP2)", type: "select", options: ["Negative", "Positive", "Invalid"] },
          { key: "pv",      label: "P. vivax (pLDH)",      type: "select", options: ["Negative", "Positive", "Invalid"] },
          { key: "pan",     label: "Pan-Malaria",          type: "select", options: ["Negative", "Positive", "Invalid"] },
          { key: "remarks", label: "Remarks",              type: "textarea" }
        ]
      },
      {
        id: "MALARIA_SMEAR",
        name: "Malaria Thick & Thin Blood Smear",
        fields: [
          { key: "thick_film",   label: "Thick Film",      type: "select", options: ["Negative", "Positive – P. falciparum", "Positive – P. vivax", "Positive – P. malariae", "Positive – P. ovale"] },
          { key: "thin_film",    label: "Thin Film",       type: "select", options: ["Negative", "Ring Stage", "Trophozoite", "Schizont", "Gametocyte"] },
          { key: "parasitemia",  label: "Parasitaemia",    unit: "%", type: "number" },
          { key: "remarks",      label: "Remarks",         type: "textarea" }
        ]
      },
      {
        id: "BLOOD_GROUP",
        name: "Blood Group & Rh Typing",
        fields: [
          { key: "blood_group", label: "ABO Group",   type: "select", options: ["A", "B", "AB", "O"] },
          { key: "rh_factor",   label: "Rh Factor",   type: "select", options: ["Positive (+)", "Negative (-)"] },
          { key: "remarks",     label: "Remarks",     type: "textarea" }
        ]
      },
      {
        id: "CLOTTING_TIME",
        name: "Clotting Time (CT) & Bleeding Time (BT)",
        fields: [
          { key: "ct",      label: "Clotting Time",  unit: "min", type: "number", refRange: "3 – 7 min",  normalMin: 3, normalMax: 7 },
          { key: "bt",      label: "Bleeding Time",  unit: "min", type: "number", refRange: "2 – 4 min",  normalMin: 2, normalMax: 4 },
          { key: "method",  label: "Method",         type: "select", options: ["Duke", "Ivy", "Template"] },
          { key: "remarks", label: "Remarks",        type: "textarea" }
        ]
      },
      {
        id: "PT_APTT",
        name: "PT / APTT (Coagulation Profile)",
        fields: [
          { key: "pt_patient",  label: "PT – Patient",   unit: "sec", type: "number", refRange: "11 – 14 sec", normalMin: 11, normalMax: 14 },
          { key: "pt_control",  label: "PT – Control",   unit: "sec", type: "number" },
          { key: "inr",         label: "INR",             type: "number", refRange: "0.8 – 1.2", normalMin: 0.8, normalMax: 1.2 },
          { key: "aptt_patient",label: "APTT – Patient",  unit: "sec", type: "number", refRange: "25 – 35 sec", normalMin: 25, normalMax: 35 },
          { key: "aptt_control",label: "APTT – Control",  unit: "sec", type: "number" },
          { key: "remarks",     label: "Remarks",         type: "textarea" }
        ]
      },
      {
        id: "SICKLING_TEST",
        name: "Sickling Test",
        fields: [
          { key: "result",  label: "Result",   type: "select", options: ["Negative – No sickling", "Positive – Sickling observed"] },
          { key: "remarks", label: "Remarks",  type: "textarea" }
        ]
      }
    ]
  },

  // ─────────────────────────────────────────────
  // CLINICAL CHEMISTRY
  // ─────────────────────────────────────────────
  chemistry: {
    label: "Clinical Chemistry",
    color: "#f39c12",
    icon: "⚗️",
    tests: [
      {
        id: "LFT",
        name: "Liver Function Tests (LFT)",
        fields: [
          { key: "tbil",  label: "Total Bilirubin",   unit: "mg/dL", type: "number", refRange: "0.2 – 1.2",  normalMin: 0.2,  normalMax: 1.2 },
          { key: "dbil",  label: "Direct Bilirubin",  unit: "mg/dL", type: "number", refRange: "0.0 – 0.3",  normalMin: 0,    normalMax: 0.3 },
          { key: "ibil",  label: "Indirect Bilirubin",unit: "mg/dL", type: "number", refRange: "0.2 – 0.9",  normalMin: 0.2,  normalMax: 0.9 },
          { key: "alt",   label: "ALT (SGPT)",        unit: "U/L",   type: "number", refRange: "7 – 56",      normalMin: 7,    normalMax: 56 },
          { key: "ast",   label: "AST (SGOT)",        unit: "U/L",   type: "number", refRange: "10 – 40",     normalMin: 10,   normalMax: 40 },
          { key: "alp",   label: "ALP",               unit: "U/L",   type: "number", refRange: "44 – 147",    normalMin: 44,   normalMax: 147 },
          { key: "ggt",   label: "GGT",               unit: "U/L",   type: "number", refRange: "9 – 48",      normalMin: 9,    normalMax: 48 },
          { key: "tprot", label: "Total Protein",     unit: "g/dL",  type: "number", refRange: "6.0 – 8.3",   normalMin: 6.0,  normalMax: 8.3 },
          { key: "alb",   label: "Albumin",           unit: "g/dL",  type: "number", refRange: "3.5 – 5.0",   normalMin: 3.5,  normalMax: 5.0 },
          { key: "glob",  label: "Globulin",          unit: "g/dL",  type: "number", refRange: "2.0 – 3.5",   normalMin: 2.0,  normalMax: 3.5 },
          { key: "ag",    label: "A/G Ratio",          type: "number", refRange: "1.1 – 2.5",  normalMin: 1.1, normalMax: 2.5 },
          { key: "remarks", label: "Remarks",         type: "textarea" }
        ]
      },
      {
        id: "RFT",
        name: "Renal Function Tests (RFT)",
        fields: [
          { key: "urea",    label: "Blood Urea",       unit: "mg/dL",    type: "number", refRange: "15 – 45",    normalMin: 15,  normalMax: 45 },
          { key: "bun",     label: "BUN",              unit: "mg/dL",    type: "number", refRange: "7 – 20",     normalMin: 7,   normalMax: 20 },
          { key: "creat",   label: "Creatinine",       unit: "mg/dL",    type: "number", refRange: "0.7–1.3 (M) / 0.5–1.1 (F)", normalMin: 0.5, normalMax: 1.3 },
          { key: "egfr",    label: "eGFR",             unit: "mL/min/1.73m²", type: "number", refRange: ">60" },
          { key: "ua",      label: "Uric Acid",        unit: "mg/dL",    type: "number", refRange: "3.5–7.2 (M) / 2.6–6.0 (F)", normalMin: 2.6, normalMax: 7.2 },
          { key: "remarks", label: "Remarks",          type: "textarea" }
        ]
      },
      {
        id: "LIPID_PROFILE",
        name: "Lipid Profile",
        fields: [
          { key: "tchol",   label: "Total Cholesterol",  unit: "mg/dL", type: "number", refRange: "< 200",       normalMin: 0,  normalMax: 200 },
          { key: "trig",    label: "Triglycerides",      unit: "mg/dL", type: "number", refRange: "< 150",       normalMin: 0,  normalMax: 150 },
          { key: "hdl",     label: "HDL Cholesterol",   unit: "mg/dL", type: "number", refRange: "> 40 (M) / > 50 (F)", normalMin: 40, normalMax: 999 },
          { key: "ldl",     label: "LDL Cholesterol",   unit: "mg/dL", type: "number", refRange: "< 100 (optimal)", normalMin: 0, normalMax: 100 },
          { key: "vldl",    label: "VLDL",              unit: "mg/dL", type: "number", refRange: "2 – 30",       normalMin: 2,  normalMax: 30 },
          { key: "chd_risk",label: "CHD Risk Ratio",     type: "number", refRange: "< 5.0", normalMin: 0, normalMax: 5.0 },
          { key: "remarks", label: "Remarks",           type: "textarea" }
        ]
      },
      {
        id: "BLOOD_GLUCOSE",
        name: "Blood Glucose",
        fields: [
          { key: "type",    label: "Sample Type",  type: "select", options: ["Fasting", "Random", "2-Hr Post Prandial", "OGTT - 0 min", "OGTT - 120 min"] },
          { key: "glucose", label: "Glucose",      unit: "mg/dL", type: "number", refRange: "70–100 (Fasting) / < 140 (2hr PP)", normalMin: 70, normalMax: 140 },
          { key: "remarks", label: "Remarks",      type: "textarea" }
        ]
      },
      {
        id: "HBA1C",
        name: "Glycated Hemoglobin (HbA1c)",
        fields: [
          { key: "hba1c",   label: "HbA1c",         unit: "%",     type: "number", refRange: "< 5.7 (Normal) / 5.7–6.4 (Prediabetes) / ≥6.5 (Diabetes)", normalMin: 0, normalMax: 5.7 },
          { key: "eag",     label: "eAG",            unit: "mg/dL", type: "number" },
          { key: "remarks", label: "Remarks",        type: "textarea" }
        ]
      },
      {
        id: "THYROID",
        name: "Thyroid Function Tests (TFT)",
        fields: [
          { key: "tsh",   label: "TSH",      unit: "µIU/mL", type: "number", refRange: "0.4 – 4.0",   normalMin: 0.4, normalMax: 4.0 },
          { key: "t3",    label: "T3 (Total)",unit: "ng/dL",  type: "number", refRange: "80 – 200",    normalMin: 80,  normalMax: 200 },
          { key: "t4",    label: "T4 (Total)",unit: "µg/dL",  type: "number", refRange: "5.0 – 12.0",  normalMin: 5.0, normalMax: 12.0 },
          { key: "ft3",   label: "Free T3",  unit: "pg/mL",  type: "number", refRange: "2.3 – 4.2",   normalMin: 2.3, normalMax: 4.2 },
          { key: "ft4",   label: "Free T4",  unit: "ng/dL",  type: "number", refRange: "0.89 – 1.76", normalMin: 0.89,normalMax: 1.76 },
          { key: "remarks", label: "Remarks", type: "textarea" }
        ]
      },
      {
        id: "ELECTROLYTES",
        name: "Serum Electrolytes",
        fields: [
          { key: "na",      label: "Sodium (Na⁺)",     unit: "mEq/L", type: "number", refRange: "136 – 145", normalMin: 136, normalMax: 145 },
          { key: "k",       label: "Potassium (K⁺)",   unit: "mEq/L", type: "number", refRange: "3.5 – 5.0", normalMin: 3.5, normalMax: 5.0 },
          { key: "cl",      label: "Chloride (Cl⁻)",   unit: "mEq/L", type: "number", refRange: "98 – 106",  normalMin: 98,  normalMax: 106 },
          { key: "hco3",    label: "Bicarbonate (HCO₃⁻)",unit: "mEq/L",type: "number", refRange: "22 – 29",  normalMin: 22,  normalMax: 29 },
          { key: "remarks", label: "Remarks",           type: "textarea" }
        ]
      },
      {
        id: "CALCIUM_PHOS",
        name: "Calcium & Phosphorus",
        fields: [
          { key: "ca",      label: "Total Calcium",     unit: "mg/dL", type: "number", refRange: "8.5 – 10.5", normalMin: 8.5, normalMax: 10.5 },
          { key: "ionized", label: "Ionized Calcium",   unit: "mg/dL", type: "number", refRange: "4.6 – 5.3",  normalMin: 4.6, normalMax: 5.3 },
          { key: "phos",    label: "Phosphorus",        unit: "mg/dL", type: "number", refRange: "2.5 – 4.5",  normalMin: 2.5, normalMax: 4.5 },
          { key: "mg",      label: "Magnesium",         unit: "mg/dL", type: "number", refRange: "1.7 – 2.2",  normalMin: 1.7, normalMax: 2.2 },
          { key: "remarks", label: "Remarks",           type: "textarea" }
        ]
      },
      {
        id: "CARDIAC_MARKERS",
        name: "Cardiac Markers",
        fields: [
          { key: "troponin_i", label: "Troponin I",     unit: "ng/mL", type: "number", refRange: "< 0.04",    normalMin: 0, normalMax: 0.04 },
          { key: "troponin_t", label: "Troponin T",     unit: "ng/mL", type: "number", refRange: "< 0.01",    normalMin: 0, normalMax: 0.01 },
          { key: "ck_mb",      label: "CK-MB",          unit: "U/L",   type: "number", refRange: "< 25",       normalMin: 0, normalMax: 25 },
          { key: "ck_total",   label: "CK (Total)",     unit: "U/L",   type: "number", refRange: "24 – 195",   normalMin: 24, normalMax: 195 },
          { key: "ldh",        label: "LDH",            unit: "U/L",   type: "number", refRange: "140 – 280",  normalMin: 140, normalMax: 280 },
          { key: "myoglobin",  label: "Myoglobin",      unit: "ng/mL", type: "number", refRange: "< 90",       normalMin: 0, normalMax: 90 },
          { key: "bnp",        label: "BNP",            unit: "pg/mL", type: "number", refRange: "< 100",      normalMin: 0, normalMax: 100 },
          { key: "remarks",    label: "Remarks",        type: "textarea" }
        ]
      },
      {
        id: "CRP",
        name: "C-Reactive Protein (CRP)",
        fields: [
          { key: "crp",     label: "CRP",     unit: "mg/L",  type: "number", refRange: "< 5.0",  normalMin: 0, normalMax: 5.0 },
          { key: "hs_crp",  label: "hsCRP",   unit: "mg/L",  type: "number", refRange: "< 3.0",  normalMin: 0, normalMax: 3.0 },
          { key: "remarks", label: "Remarks", type: "textarea" }
        ]
      },
      {
        id: "IRON_STUDIES",
        name: "Iron Studies",
        fields: [
          { key: "serum_iron", label: "Serum Iron",     unit: "µg/dL", type: "number", refRange: "60 – 170",  normalMin: 60,  normalMax: 170 },
          { key: "tibc",       label: "TIBC",           unit: "µg/dL", type: "number", refRange: "240 – 450", normalMin: 240, normalMax: 450 },
          { key: "transferrin",label: "% Transferrin Sat.", unit: "%", type: "number", refRange: "20 – 50",   normalMin: 20,  normalMax: 50 },
          { key: "ferritin",   label: "Ferritin",       unit: "ng/mL", type: "number", refRange: "12–300 (M) / 12–150 (F)", normalMin: 12, normalMax: 300 },
          { key: "remarks",    label: "Remarks",        type: "textarea" }
        ]
      },
      {
        id: "AMYLASE_LIPASE",
        name: "Amylase & Lipase (Pancreatic)",
        fields: [
          { key: "amylase",  label: "Amylase",  unit: "U/L", type: "number", refRange: "28 – 100",  normalMin: 28,  normalMax: 100 },
          { key: "lipase",   label: "Lipase",   unit: "U/L", type: "number", refRange: "10 – 140",  normalMin: 10,  normalMax: 140 },
          { key: "remarks",  label: "Remarks",  type: "textarea" }
        ]
      },
      {
        id: "PSA",
        name: "Prostate Specific Antigen (PSA)",
        fields: [
          { key: "total_psa", label: "Total PSA",  unit: "ng/mL", type: "number", refRange: "< 4.0",  normalMin: 0, normalMax: 4.0 },
          { key: "free_psa",  label: "Free PSA",   unit: "ng/mL", type: "number" },
          { key: "ratio",     label: "Free/Total Ratio", unit: "%", type: "number", refRange: "> 25% (lower cancer risk)" },
          { key: "remarks",   label: "Remarks",    type: "textarea" }
        ]
      }
    ]
  },

  // ─────────────────────────────────────────────
  // MICROBIOLOGY
  // ─────────────────────────────────────────────
  microbiology: {
    label: "Microbiology",
    color: "#27ae60",
    icon: "🦠",
    tests: [
      {
        id: "URINE_CS",
        name: "Urine Culture & Sensitivity",
        fields: [
          { key: "organism",       label: "Organism Isolated",     type: "select", options: ["No Growth", "E. coli", "Klebsiella pneumoniae", "Staphylococcus aureus", "Pseudomonas aeruginosa", "Enterococcus faecalis", "Proteus mirabilis", "Candida albicans", "Others"] },
          { key: "colony_count",   label: "Colony Count",          unit: "CFU/mL", type: "select", options: ["< 10,000 (Insignificant)", "10,000 – 100,000 (Possible)", "> 100,000 (Significant)"] },
          { key: "amoxicillin",    label: "Amoxicillin",           type: "select", options: ["Sensitive", "Intermediate", "Resistant", "Not Tested"] },
          { key: "cotrimoxazole",  label: "Cotrimoxazole",         type: "select", options: ["Sensitive", "Intermediate", "Resistant", "Not Tested"] },
          { key: "ciprofloxacin",  label: "Ciprofloxacin",        type: "select", options: ["Sensitive", "Intermediate", "Resistant", "Not Tested"] },
          { key: "gentamicin",     label: "Gentamicin",           type: "select", options: ["Sensitive", "Intermediate", "Resistant", "Not Tested"] },
          { key: "ceftriaxone",    label: "Ceftriaxone",          type: "select", options: ["Sensitive", "Intermediate", "Resistant", "Not Tested"] },
          { key: "nitrofurantoin", label: "Nitrofurantoin",       type: "select", options: ["Sensitive", "Intermediate", "Resistant", "Not Tested"] },
          { key: "amikacin",       label: "Amikacin",             type: "select", options: ["Sensitive", "Intermediate", "Resistant", "Not Tested"] },
          { key: "remarks",        label: "Remarks / Interpretation", type: "textarea" }
        ]
      },
      {
        id: "BLOOD_CULTURE",
        name: "Blood Culture & Sensitivity",
        fields: [
          { key: "result",        label: "Culture Result",         type: "select", options: ["No Growth after 5 days", "Growth detected"] },
          { key: "organism",      label: "Organism Isolated",      type: "select", options: ["No Growth", "E. coli", "Staphylococcus aureus", "Streptococcus pneumoniae", "Salmonella typhi", "Klebsiella pneumoniae", "Pseudomonas aeruginosa", "Candida albicans", "Neisseria meningitidis", "Others"] },
          { key: "gram_stain",    label: "Gram Stain",             type: "select", options: ["Gram +ve Cocci", "Gram -ve Cocci", "Gram +ve Bacilli", "Gram -ve Bacilli", "Gram +ve Cocci in Clusters", "Gram +ve Cocci in Chains", "No organisms seen"] },
          { key: "amoxiclav",     label: "Amoxicillin-Clavulanate", type: "select", options: ["Sensitive", "Intermediate", "Resistant", "Not Tested"] },
          { key: "ciprofloxacin", label: "Ciprofloxacin",          type: "select", options: ["Sensitive", "Intermediate", "Resistant", "Not Tested"] },
          { key: "ceftriaxone",   label: "Ceftriaxone",            type: "select", options: ["Sensitive", "Intermediate", "Resistant", "Not Tested"] },
          { key: "meropenem",     label: "Meropenem",              type: "select", options: ["Sensitive", "Intermediate", "Resistant", "Not Tested"] },
          { key: "vancomycin",    label: "Vancomycin",             type: "select", options: ["Sensitive", "Intermediate", "Resistant", "Not Tested"] },
          { key: "remarks",       label: "Remarks",                type: "textarea" }
        ]
      },
      {
        id: "SPUTUM_CS",
        name: "Sputum Culture & Sensitivity",
        fields: [
          { key: "quality",       label: "Sample Quality",    type: "select", options: ["Acceptable (< 10 squamous cells/LPF)", "Rejected (> 10 squamous cells/LPF)"] },
          { key: "gram_stain",    label: "Gram Stain",        type: "select", options: ["Many Gram +ve Cocci", "Many Gram -ve Bacilli", "Mixed flora", "No predominant organism"] },
          { key: "organism",      label: "Organism",          type: "select", options: ["No significant growth", "Streptococcus pneumoniae", "Haemophilus influenzae", "Klebsiella pneumoniae", "Pseudomonas aeruginosa", "Staphylococcus aureus", "Moraxella catarrhalis", "Others"] },
          { key: "amoxiclav",     label: "Amoxicillin-Clavulanate", type: "select", options: ["Sensitive", "Intermediate", "Resistant"] },
          { key: "azithromycin",  label: "Azithromycin",     type: "select", options: ["Sensitive", "Intermediate", "Resistant"] },
          { key: "ciprofloxacin", label: "Ciprofloxacin",    type: "select", options: ["Sensitive", "Intermediate", "Resistant"] },
          { key: "ceftriaxone",   label: "Ceftriaxone",      type: "select", options: ["Sensitive", "Intermediate", "Resistant"] },
          { key: "remarks",       label: "Remarks",          type: "textarea" }
        ]
      },
      {
        id: "STOOL_CS",
        name: "Stool Culture & Sensitivity",
        fields: [
          { key: "organism",       label: "Organism",          type: "select", options: ["No pathogen isolated", "Salmonella spp.", "Shigella spp.", "Campylobacter jejuni", "E. coli O157:H7", "Vibrio cholerae", "Yersinia enterocolitica", "Others"] },
          { key: "ciprofloxacin",  label: "Ciprofloxacin",    type: "select", options: ["Sensitive", "Intermediate", "Resistant"] },
          { key: "ampicillin",     label: "Ampicillin",       type: "select", options: ["Sensitive", "Intermediate", "Resistant"] },
          { key: "cotrimoxazole",  label: "Cotrimoxazole",    type: "select", options: ["Sensitive", "Intermediate", "Resistant"] },
          { key: "ceftriaxone",    label: "Ceftriaxone",      type: "select", options: ["Sensitive", "Intermediate", "Resistant"] },
          { key: "remarks",        label: "Remarks",          type: "textarea" }
        ]
      },
      {
        id: "WIDAL",
        name: "Widal Test (Typhoid)",
        fields: [
          { key: "to",        label: "Salmonella typhi O (TO)",    type: "select", options: ["Negative", "1:20", "1:40", "1:80", "1:160", "1:320", "1:640"] },
          { key: "th",        label: "Salmonella typhi H (TH)",    type: "select", options: ["Negative", "1:20", "1:40", "1:80", "1:160", "1:320", "1:640"] },
          { key: "ah",        label: "Salmonella paratyphi AH",    type: "select", options: ["Negative", "1:20", "1:40", "1:80", "1:160", "1:320"] },
          { key: "bh",        label: "Salmonella paratyphi BH",    type: "select", options: ["Negative", "1:20", "1:40", "1:80", "1:160", "1:320"] },
          { key: "interpretation", label: "Interpretation",        type: "select", options: ["Non-significant (< 1:80)", "Significant titre (≥ 1:160 – suggestive of typhoid)", "Borderline – recommend repeat in 5-7 days"] },
          { key: "remarks",   label: "Remarks",                    type: "textarea" }
        ]
      },
      {
        id: "AFB_SMEAR",
        name: "AFB Smear (Sputum for TB)",
        fields: [
          { key: "specimen",  label: "Specimen",           type: "select", options: ["Sputum - Morning sample", "Sputum - Spot sample", "BAL", "Urine", "CSF"] },
          { key: "zn_stain",  label: "ZN Stain Result",   type: "select", options: ["No AFB seen (Negative)", "1-9 AFB/100HPF (Scanty)", "10-99 AFB/100HPF (1+)", "1-10 AFB/HPF (2+)", "> 10 AFB/HPF (3+)"] },
          { key: "grading",   label: "Grading (WHO)",      type: "select", options: ["Negative", "Scanty (1-9/100 HPF)", "1+ (10-99/100 HPF)", "2+ (1-10/HPF)", "3+ (>10/HPF)"] },
          { key: "remarks",   label: "Remarks",            type: "textarea" }
        ]
      },
      {
        id: "HVS_CS",
        name: "High Vaginal Swab (HVS) C&S",
        fields: [
          { key: "macroscopic",    label: "Macroscopic Appearance", type: "select", options: ["Scanty", "Moderate", "Profuse", "Purulent", "Bloody"] },
          { key: "ph",             label: "Vaginal pH",             unit: "", type: "select", options: ["< 4.5 (Normal)", "4.5 – 6.0", "> 6.0 (Abnormal)"] },
          { key: "whiff_test",     label: "Whiff Test (KOH)",       type: "select", options: ["Negative", "Positive"] },
          { key: "gram_stain",     label: "Gram Stain",             type: "select", options: ["Normal flora (Lactobacilli dominant)", "Clue cells seen", "Gram +ve cocci", "Gram -ve diplococci", "Budding yeast cells", "Mixed flora"] },
          { key: "wet_prep",       label: "Wet Preparation",        type: "select", options: ["No pathogen", "Trichomonas vaginalis seen", "Clue cells (BV)", "Candida hyphae seen", "Motile organisms"] },
          { key: "organism",       label: "Culture – Organism",     type: "select", options: ["No pathogen", "Candida albicans", "Gardnerella vaginalis", "Trichomonas vaginalis", "Neisseria gonorrhoeae", "Staphylococcus aureus", "E. coli", "Others"] },
          { key: "fluconazole",    label: "Fluconazole",            type: "select", options: ["Sensitive", "Resistant", "Not applicable"] },
          { key: "metronidazole",  label: "Metronidazole",          type: "select", options: ["Sensitive", "Resistant", "Not applicable"] },
          { key: "remarks",        label: "Remarks",                type: "textarea" }
        ]
      },
      {
        id: "URETHRAL_SWAB",
        name: "Urethral Swab C&S",
        fields: [
          { key: "gram_stain",    label: "Gram Stain",     type: "select", options: ["No organisms", "Gram -ve diplococci (intracellular)", "Gram +ve cocci", "Mixed flora"] },
          { key: "organism",      label: "Organism",       type: "select", options: ["No growth", "Neisseria gonorrhoeae", "Chlamydia trachomatis", "Mycoplasma genitalium", "Others"] },
          { key: "ceftriaxone",   label: "Ceftriaxone",    type: "select", options: ["Sensitive", "Resistant"] },
          { key: "azithromycin",  label: "Azithromycin",   type: "select", options: ["Sensitive", "Resistant"] },
          { key: "ciprofloxacin", label: "Ciprofloxacin",  type: "select", options: ["Sensitive", "Resistant"] },
          { key: "remarks",       label: "Remarks",        type: "textarea" }
        ]
      }
    ]
  },

  // ─────────────────────────────────────────────
  // URINE ANALYSIS
  // ─────────────────────────────────────────────
  urinalysis: {
    label: "Urinalysis",
    color: "#f1c40f",
    icon: "🧪",
    tests: [
      {
        id: "URINALYSIS",
        name: "Complete Urinalysis (U/A)",
        fields: [
          // Physical
          { key: "color",      label: "Color",       type: "select", options: ["Pale Yellow", "Yellow", "Dark Yellow", "Amber", "Brown", "Red", "Colorless"] },
          { key: "appearance", label: "Appearance",  type: "select", options: ["Clear", "Slightly Turbid", "Turbid", "Cloudy"] },
          { key: "volume",     label: "Volume",      unit: "mL",  type: "number" },
          // Chemical
          { key: "ph",         label: "pH",           type: "number", refRange: "4.5 – 8.0", normalMin: 4.5, normalMax: 8.0 },
          { key: "sg",         label: "Specific Gravity", type: "number", refRange: "1.005 – 1.030", normalMin: 1.005, normalMax: 1.030 },
          { key: "protein",    label: "Protein",     type: "select", options: ["Negative", "Trace", "1+ (30 mg/dL)", "2+ (100 mg/dL)", "3+ (300 mg/dL)", "4+ (>2000 mg/dL)"] },
          { key: "glucose",    label: "Glucose",     type: "select", options: ["Negative", "Trace", "1+", "2+", "3+", "4+"] },
          { key: "ketones",    label: "Ketones",     type: "select", options: ["Negative", "Trace", "Small", "Moderate", "Large"] },
          { key: "blood",      label: "Blood",       type: "select", options: ["Negative", "Trace", "1+", "2+", "3+"] },
          { key: "bilirubin",  label: "Bilirubin",   type: "select", options: ["Negative", "1+", "2+", "3+"] },
          { key: "urobilinogen",label:"Urobilinogen", type: "select", options: ["Normal (0.1–1.0)", "Increased", "Absent"] },
          { key: "nitrites",   label: "Nitrites",    type: "select", options: ["Negative", "Positive"] },
          { key: "leukocytes", label: "Leukocyte Esterase", type: "select", options: ["Negative", "Trace", "1+", "2+", "3+"] },
          // Microscopic
          { key: "rbc_hpf",    label: "RBC",         unit: "/HPF",  type: "select", options: ["0-2", "3-5", "6-10", ">10", "TNTC"] },
          { key: "wbc_hpf",    label: "WBC (Pus Cells)", unit: "/HPF", type: "select", options: ["0-5", "6-10", "11-20", ">20", "TNTC"] },
          { key: "epithelial", label: "Epithelial Cells",unit: "/HPF",type: "select", options: ["Few", "Moderate", "Many"] },
          { key: "casts",      label: "Casts",       type: "select", options: ["None", "Hyaline", "Granular", "RBC Casts", "WBC Casts", "Waxy", "Fatty"] },
          { key: "crystals",   label: "Crystals",    type: "select", options: ["None", "Amorphous Urates", "Calcium Oxalate", "Triple Phosphate", "Uric Acid", "Cystine"] },
          { key: "bacteria",   label: "Bacteria",    type: "select", options: ["None", "Few", "Moderate", "Many"] },
          { key: "remarks",    label: "Remarks",     type: "textarea" }
        ]
      },
      {
        id: "URINE_PREG",
        name: "Urine Pregnancy Test (hCG)",
        fields: [
          { key: "result",  label: "Result",  type: "select", options: ["Negative", "Positive", "Invalid"] },
          { key: "method",  label: "Method",  type: "select", options: ["Rapid Immunoassay (Strip)", "ELISA", "Quantitative serum hCG"] },
          { key: "remarks", label: "Remarks", type: "textarea" }
        ]
      },
      {
        id: "URINE_PROTEIN_CREAT",
        name: "Urine Protein:Creatinine Ratio",
        fields: [
          { key: "urine_protein", label: "Urine Protein",    unit: "mg/dL",   type: "number" },
          { key: "urine_creat",   label: "Urine Creatinine", unit: "mg/dL",   type: "number" },
          { key: "ratio",         label: "Protein:Creatinine Ratio", type: "number", refRange: "< 0.2 (Normal)", normalMin: 0, normalMax: 0.2 },
          { key: "remarks",       label: "Remarks",          type: "textarea" }
        ]
      },
      {
        id: "MICROALBUMIN",
        name: "Urine Microalbuminuria",
        fields: [
          { key: "albumin",    label: "Microalbumin",    unit: "mg/L",  type: "number", refRange: "< 30 (Normal)", normalMin: 0, normalMax: 30 },
          { key: "creatinine", label: "Urine Creatinine",unit: "mg/dL", type: "number" },
          { key: "acr",        label: "Albumin:Creatinine Ratio", unit: "mg/g", type: "number", refRange: "< 30 (Normal)", normalMin: 0, normalMax: 30 },
          { key: "remarks",    label: "Remarks",         type: "textarea" }
        ]
      }
    ]
  },

  // ─────────────────────────────────────────────
  // SEROLOGY / IMMUNOLOGY
  // ─────────────────────────────────────────────
  serology: {
    label: "Serology & Immunology",
    color: "#9b59b6",
    icon: "🔬",
    tests: [
      {
        id: "HIV_TEST",
        name: "HIV Rapid Test",
        fields: [
          { key: "screening", label: "Screening (Test 1)",     type: "select", options: ["Non-Reactive", "Reactive"] },
          { key: "confirm",   label: "Confirmatory (Test 2)",  type: "select", options: ["Non-Reactive", "Reactive", "Indeterminate"] },
          { key: "tiebreak",  label: "Tie-breaker (Test 3)",   type: "select", options: ["Not Done", "Non-Reactive", "Reactive"] },
          { key: "final",     label: "Final Result",           type: "select", options: ["HIV Negative", "HIV Positive", "Indeterminate – Retest in 2 weeks"] },
          { key: "remarks",   label: "Remarks",               type: "textarea" }
        ]
      },
      {
        id: "HBS_AG",
        name: "Hepatitis B Surface Antigen (HBsAg)",
        fields: [
          { key: "hbsag",     label: "HBsAg",     type: "select", options: ["Non-Reactive (Negative)", "Reactive (Positive)", "Invalid"] },
          { key: "anti_hbs",  label: "Anti-HBs",  type: "select", options: ["Not done", "Non-Reactive", "Reactive (Immune)"] },
          { key: "anti_hbc",  label: "Anti-HBc (Total)", type: "select", options: ["Not done", "Non-Reactive", "Reactive"] },
          { key: "hbe_ag",    label: "HBeAg",     type: "select", options: ["Not done", "Non-Reactive", "Reactive"] },
          { key: "remarks",   label: "Remarks",   type: "textarea" }
        ]
      },
      {
        id: "HEPATITIS_C",
        name: "Hepatitis C Antibody (Anti-HCV)",
        fields: [
          { key: "anti_hcv", label: "Anti-HCV",  type: "select", options: ["Non-Reactive (Negative)", "Reactive (Positive)", "Invalid"] },
          { key: "remarks",  label: "Remarks",   type: "textarea" }
        ]
      },
      {
        id: "VDRL_RPR",
        name: "VDRL / RPR (Syphilis Screening)",
        fields: [
          { key: "vdrl",     label: "VDRL",      type: "select", options: ["Non-Reactive", "Reactive – 1:1", "Reactive – 1:2", "Reactive – 1:4", "Reactive – 1:8", "Reactive – 1:16", "Reactive – 1:32"] },
          { key: "rpr",      label: "RPR",       type: "select", options: ["Non-Reactive", "Reactive"] },
          { key: "tpha",     label: "TPHA (confirmatory)", type: "select", options: ["Not done", "Non-Reactive", "Reactive 1+", "Reactive 2+", "Reactive 3+", "Reactive 4+"] },
          { key: "remarks",  label: "Remarks",   type: "textarea" }
        ]
      },
      {
        id: "RHEUMATOID_FACTOR",
        name: "Rheumatoid Factor (RF)",
        fields: [
          { key: "rf",       label: "RF",        unit: "IU/mL",  type: "number", refRange: "< 20 IU/mL", normalMin: 0, normalMax: 20 },
          { key: "result",   label: "Result",    type: "select", options: ["Non-Reactive (Negative)", "Reactive (Positive)"] },
          { key: "remarks",  label: "Remarks",   type: "textarea" }
        ]
      },
      {
        id: "ASO",
        name: "Anti-Streptolysin O (ASO) Titre",
        fields: [
          { key: "aso",      label: "ASO Titre",  unit: "IU/mL", type: "number", refRange: "< 200 IU/mL (Adults)", normalMin: 0, normalMax: 200 },
          { key: "result",   label: "Result",     type: "select", options: ["Non-Reactive", "Reactive"] },
          { key: "remarks",  label: "Remarks",    type: "textarea" }
        ]
      },
      {
        id: "ANA",
        name: "Anti-Nuclear Antibody (ANA)",
        fields: [
          { key: "result",   label: "Result",           type: "select", options: ["Negative", "Positive"] },
          { key: "titre",    label: "Titre",            type: "select", options: ["Not applicable", "1:40", "1:80", "1:160", "1:320", "1:640", "1:1280"] },
          { key: "pattern",  label: "Pattern",          type: "select", options: ["Not applicable", "Homogeneous", "Speckled", "Nucleolar", "Centromere", "Peripheral"] },
          { key: "remarks",  label: "Remarks",          type: "textarea" }
        ]
      },
      {
        id: "DENGUE",
        name: "Dengue NS1/IgM/IgG",
        fields: [
          { key: "ns1",     label: "NS1 Antigen",     type: "select", options: ["Negative", "Positive", "Invalid"] },
          { key: "igm",     label: "Anti-Dengue IgM", type: "select", options: ["Negative", "Positive", "Equivocal"] },
          { key: "igg",     label: "Anti-Dengue IgG", type: "select", options: ["Negative", "Positive", "Equivocal"] },
          { key: "interpretation", label: "Interpretation", type: "select", options: ["Not suggestive of dengue", "Primary dengue infection (NS1+/IgM+)", "Secondary dengue (IgG+ with NS1 or IgM)", "Past infection (IgG+ only)"] },
          { key: "remarks", label: "Remarks",         type: "textarea" }
        ]
      },
      {
        id: "COVID_AG",
        name: "COVID-19 Antigen Rapid Test",
        fields: [
          { key: "result",   label: "Result",   type: "select", options: ["Negative", "Positive", "Invalid"] },
          { key: "kit_brand",label: "Kit Brand / LOT No.", type: "text" },
          { key: "remarks",  label: "Remarks",  type: "textarea" }
        ]
      },
      {
        id: "BRUCELLA",
        name: "Brucella Agglutination Test",
        fields: [
          { key: "result",   label: "Result",  type: "select", options: ["Non-Reactive", "Reactive 1:40", "Reactive 1:80", "Reactive 1:160", "Reactive 1:320", "Reactive 1:640"] },
          { key: "remarks",  label: "Remarks", type: "textarea" }
        ]
      },
      {
        id: "TOXO_IGM_IGG",
        name: "Toxoplasma IgM / IgG",
        fields: [
          { key: "igm",     label: "Toxoplasma IgM", type: "select", options: ["Negative", "Equivocal", "Positive"] },
          { key: "igg",     label: "Toxoplasma IgG", type: "select", options: ["Negative", "Equivocal", "Positive"] },
          { key: "igg_titre",label:"IgG Titre",       unit: "IU/mL", type: "number" },
          { key: "remarks", label: "Remarks",         type: "textarea" }
        ]
      },
      {
        id: "RUBELLA",
        name: "Rubella IgM / IgG",
        fields: [
          { key: "igm",    label: "Rubella IgM", type: "select", options: ["Negative", "Equivocal", "Positive"] },
          { key: "igg",    label: "Rubella IgG", type: "select", options: ["Negative", "Equivocal", "Positive"] },
          { key: "remarks",label: "Remarks",     type: "textarea" }
        ]
      },
      {
        id: "CMV",
        name: "CMV IgM / IgG",
        fields: [
          { key: "igm",    label: "CMV IgM", type: "select", options: ["Negative", "Equivocal", "Positive"] },
          { key: "igg",    label: "CMV IgG", type: "select", options: ["Negative", "Equivocal", "Positive"] },
          { key: "remarks",label: "Remarks", type: "textarea" }
        ]
      },
      {
        id: "H_PYLORI",
        name: "H. pylori Antigen / Antibody",
        fields: [
          { key: "stool_ag", label: "Stool Antigen",      type: "select", options: ["Negative", "Positive", "Invalid"] },
          { key: "serum_ab", label: "Serum IgG Antibody", type: "select", options: ["Negative", "Positive"] },
          { key: "remarks",  label: "Remarks",            type: "textarea" }
        ]
      }
    ]
  },

  // ─────────────────────────────────────────────
  // STOOL ANALYSIS
  // ─────────────────────────────────────────────
  stool: {
    label: "Stool Analysis",
    color: "#795548",
    icon: "🧫",
    tests: [
      {
        id: "STOOL_ROUTINE",
        name: "Stool Routine Examination (Ova & Parasites)",
        fields: [
          { key: "color",       label: "Color",          type: "select", options: ["Brown", "Yellow", "Green", "Black (Tarry)", "Red (Bloody)", "Pale/Clay"] },
          { key: "consistency", label: "Consistency",    type: "select", options: ["Formed", "Semi-formed", "Soft", "Watery", "Mucoid", "Bloody-mucoid"] },
          { key: "mucus",       label: "Mucus",          type: "select", options: ["Absent", "Present"] },
          { key: "blood",       label: "Blood",          type: "select", options: ["Absent", "Present (Occult)", "Present (Frank)"] },
          { key: "rbc_hpf",     label: "RBC",            unit: "/HPF", type: "select", options: ["Nil", "1-5", "6-10", ">10", "TNTC"] },
          { key: "wbc_hpf",     label: "Pus Cells",      unit: "/HPF", type: "select", options: ["Nil", "1-5", "6-10", ">10", "TNTC"] },
          { key: "epithelial",  label: "Epithelial Cells",type: "select", options: ["Absent", "Few", "Many"] },
          { key: "fat_globules", label: "Fat Globules",  type: "select", options: ["Absent", "Few", "Many"] },
          { key: "yeast",       label: "Yeast Cells",    type: "select", options: ["Absent", "Present"] },
          { key: "ova",         label: "Ova / Parasites",type: "select", options: ["Not seen", "Ascaris lumbricoides", "Trichuris trichiura", "Hookworm", "Enterobius vermicularis", "Strongyloides stercoralis", "Taenia spp.", "Entamoeba histolytica", "Giardia lamblia", "Cryptosporidium spp."] },
          { key: "occult_blood",label: "Occult Blood Test (FOB)", type: "select", options: ["Negative", "Positive"] },
          { key: "remarks",     label: "Remarks",        type: "textarea" }
        ]
      },
      {
        id: "ROTAVIRUS_AG",
        name: "Rotavirus / Adenovirus Antigen",
        fields: [
          { key: "rotavirus",  label: "Rotavirus Ag",  type: "select", options: ["Negative", "Positive"] },
          { key: "adenovirus", label: "Adenovirus Ag", type: "select", options: ["Negative", "Positive"] },
          { key: "remarks",    label: "Remarks",       type: "textarea" }
        ]
      }
    ]
  },

  // ─────────────────────────────────────────────
  // HORMONES & ENDOCRINOLOGY
  // ─────────────────────────────────────────────
  hormones: {
    label: "Hormones & Endocrinology",
    color: "#16a085",
    icon: "🧬",
    tests: [
      {
        id: "REPRODUCTIVE_HORMONES",
        name: "Reproductive Hormones (FSH/LH/Estradiol/Progesterone)",
        fields: [
          { key: "fsh",   label: "FSH",        unit: "mIU/mL", type: "number", refRange: "1.5–12.4 (F, follicular)" },
          { key: "lh",    label: "LH",         unit: "mIU/mL", type: "number", refRange: "1.7–15.0 (F, follicular)" },
          { key: "e2",    label: "Estradiol (E2)", unit: "pg/mL", type: "number", refRange: "12–166 (F, follicular)" },
          { key: "prog",  label: "Progesterone", unit: "ng/mL", type: "number", refRange: "0.1–0.9 (follicular) / 1.8–23.9 (luteal)" },
          { key: "prol",  label: "Prolactin",  unit: "ng/mL",  type: "number", refRange: "2–29 (F) / 2–18 (M)" },
          { key: "remarks", label: "Remarks",  type: "textarea" }
        ]
      },
      {
        id: "TESTOSTERONE",
        name: "Testosterone (Total & Free)",
        fields: [
          { key: "total_t", label: "Total Testosterone", unit: "ng/dL", type: "number", refRange: "300–1000 (M) / 15–70 (F)", normalMin: 300, normalMax: 1000 },
          { key: "free_t",  label: "Free Testosterone",  unit: "pg/mL", type: "number", refRange: "9–30 (M)" },
          { key: "shbg",    label: "SHBG",               unit: "nmol/L", type: "number", refRange: "10–57 (M) / 18–144 (F)" },
          { key: "remarks", label: "Remarks",            type: "textarea" }
        ]
      },
      {
        id: "CORTISOL",
        name: "Cortisol (AM / PM)",
        fields: [
          { key: "time",    label: "Time of Collection", type: "select", options: ["AM (8–10 am)", "PM (4–6 pm)", "Random"] },
          { key: "cortisol",label: "Cortisol",    unit: "µg/dL", type: "number", refRange: "6–23 (AM) / 3–16 (PM)", normalMin: 6, normalMax: 23 },
          { key: "remarks", label: "Remarks",     type: "textarea" }
        ]
      },
      {
        id: "INSULIN",
        name: "Serum Insulin / HOMA-IR",
        fields: [
          { key: "insulin",  label: "Fasting Insulin",  unit: "µIU/mL", type: "number", refRange: "2.6 – 24.9", normalMin: 2.6, normalMax: 24.9 },
          { key: "glucose",  label: "Fasting Glucose",  unit: "mg/dL",  type: "number", refRange: "70 – 99",     normalMin: 70,  normalMax: 99 },
          { key: "homa_ir",  label: "HOMA-IR",           type: "number", refRange: "< 2.5 (Normal)", normalMin: 0, normalMax: 2.5 },
          { key: "remarks",  label: "Remarks",           type: "textarea" }
        ]
      },
      {
        id: "VITAMIN_D",
        name: "Vitamin D (25-OH)",
        fields: [
          { key: "vit_d",   label: "25-OH Vitamin D",  unit: "ng/mL", type: "number", refRange: "30–100 (Sufficient) / 20–29 (Insufficient) / <20 (Deficient)", normalMin: 30, normalMax: 100 },
          { key: "status",  label: "Status",           type: "select", options: ["Sufficient (≥30)", "Insufficient (20–29)", "Deficient (<20)", "Toxicity (>100)"] },
          { key: "remarks", label: "Remarks",          type: "textarea" }
        ]
      },
      {
        id: "VITAMIN_B12",
        name: "Vitamin B12 & Folate",
        fields: [
          { key: "b12",     label: "Vitamin B12",   unit: "pg/mL", type: "number", refRange: "200 – 900",   normalMin: 200, normalMax: 900 },
          { key: "folate",  label: "Folate (Serum)", unit: "ng/mL", type: "number", refRange: "2.7 – 17.0", normalMin: 2.7, normalMax: 17.0 },
          { key: "remarks", label: "Remarks",        type: "textarea" }
        ]
      }
    ]
  },

  // ─────────────────────────────────────────────
  // TUMOUR MARKERS
  // ─────────────────────────────────────────────
  tumourMarkers: {
    label: "Tumour Markers",
    color: "#c0392b",
    icon: "🎗️",
    tests: [
      {
        id: "CEA",
        name: "Carcinoembryonic Antigen (CEA)",
        fields: [
          { key: "cea",     label: "CEA",     unit: "ng/mL", type: "number", refRange: "< 2.5 (Non-smoker) / < 5.0 (Smoker)", normalMin: 0, normalMax: 2.5 },
          { key: "remarks", label: "Remarks", type: "textarea" }
        ]
      },
      {
        id: "AFP",
        name: "Alpha-Fetoprotein (AFP)",
        fields: [
          { key: "afp",     label: "AFP",     unit: "ng/mL", type: "number", refRange: "< 8.1",  normalMin: 0, normalMax: 8.1 },
          { key: "remarks", label: "Remarks", type: "textarea" }
        ]
      },
      {
        id: "CA_125",
        name: "CA-125 (Ovarian)",
        fields: [
          { key: "ca125",   label: "CA-125",  unit: "U/mL",  type: "number", refRange: "< 35",   normalMin: 0, normalMax: 35 },
          { key: "remarks", label: "Remarks", type: "textarea" }
        ]
      },
      {
        id: "CA_19_9",
        name: "CA 19-9 (Pancreatic)",
        fields: [
          { key: "ca19_9",  label: "CA 19-9", unit: "U/mL",  type: "number", refRange: "< 37",   normalMin: 0, normalMax: 37 },
          { key: "remarks", label: "Remarks", type: "textarea" }
        ]
      },
      {
        id: "CA_15_3",
        name: "CA 15-3 (Breast)",
        fields: [
          { key: "ca15_3",  label: "CA 15-3", unit: "U/mL",  type: "number", refRange: "< 25",   normalMin: 0, normalMax: 25 },
          { key: "remarks", label: "Remarks", type: "textarea" }
        ]
      },
      {
        id: "BHCG",
        name: "Beta-hCG (Tumor Marker)",
        fields: [
          { key: "bhcg",    label: "β-hCG",   unit: "mIU/mL", type: "number", refRange: "< 5 (Non-pregnant)", normalMin: 0, normalMax: 5 },
          { key: "remarks", label: "Remarks", type: "textarea" }
        ]
      }
    ]
  },

  // ─────────────────────────────────────────────
  // CEREBROSPINAL FLUID (CSF)
  // ─────────────────────────────────────────────
  csf: {
    label: "CSF Analysis",
    color: "#2980b9",
    icon: "🧠",
    tests: [
      {
        id: "CSF_ANALYSIS",
        name: "Cerebrospinal Fluid Analysis",
        fields: [
          { key: "appearance",  label: "Appearance",          type: "select", options: ["Clear & Colourless", "Xanthochromic", "Turbid", "Bloody", "Purulent"] },
          { key: "opening_p",   label: "Opening Pressure",    unit: "mmH₂O", type: "number", refRange: "70 – 180" },
          { key: "colour",      label: "Colour",              type: "select", options: ["Colourless", "Yellow (Xanthochromia)", "Pink/Red", "Turbid/White"] },
          { key: "rbc",         label: "RBC",                 unit: "/mm³",  type: "number", refRange: "0" },
          { key: "wbc",         label: "WBC",                 unit: "/mm³",  type: "number", refRange: "0 – 5", normalMin: 0, normalMax: 5 },
          { key: "neutrophils", label: "Neutrophils",          unit: "%",     type: "number" },
          { key: "lymphocytes", label: "Lymphocytes",          unit: "%",     type: "number" },
          { key: "protein",     label: "Protein",             unit: "mg/dL", type: "number", refRange: "15 – 45",   normalMin: 15,   normalMax: 45 },
          { key: "glucose",     label: "Glucose",             unit: "mg/dL", type: "number", refRange: "45 – 80 (or 60–70% of blood glucose)", normalMin: 45, normalMax: 80 },
          { key: "chloride",    label: "Chloride",            unit: "mEq/L", type: "number", refRange: "120 – 130", normalMin: 120, normalMax: 130 },
          { key: "gram_stain",  label: "Gram Stain",          type: "select", options: ["No organisms seen", "Gram +ve cocci", "Gram -ve diplococci", "Gram +ve bacilli", "Gram -ve bacilli"] },
          { key: "culture",     label: "Culture",             type: "select", options: ["No growth", "Growth – specify organism"] },
          { key: "india_ink",   label: "India Ink (Cryptococcus)", type: "select", options: ["Negative", "Positive – encapsulated yeast seen"] },
          { key: "remarks",     label: "Impression / Remarks",type: "textarea" }
        ]
      }
    ]
  },

  // ─────────────────────────────────────────────
  // SEMEN ANALYSIS
  // ─────────────────────────────────────────────
  semen: {
    label: "Semen Analysis",
    color: "#1abc9c",
    icon: "🔭",
    tests: [
      {
        id: "SEMEN_ANALYSIS",
        name: "Semen Analysis (Spermiogram)",
        fields: [
          { key: "abstinence",    label: "Days of Abstinence",   unit: "days",  type: "number", refRange: "2 – 7" },
          { key: "volume",        label: "Volume",               unit: "mL",    type: "number", refRange: "≥ 1.5 mL",    normalMin: 1.5, normalMax: 99 },
          { key: "ph",            label: "pH",                    type: "number", refRange: "7.2 – 8.0", normalMin: 7.2, normalMax: 8.0 },
          { key: "liquefaction",  label: "Liquefaction Time",    unit: "min",   type: "number", refRange: "≤ 60 min", normalMin: 0, normalMax: 60 },
          { key: "appearance",    label: "Appearance",           type: "select", options: ["Normal (grey-white, opalescent)", "Yellowish", "Brownish", "Clear (hypospermia)"] },
          { key: "viscosity",     label: "Viscosity",            type: "select", options: ["Normal", "Increased"] },
          { key: "count",         label: "Sperm Concentration", unit: "x10⁶/mL", type: "number", refRange: "≥ 16 x10⁶/mL", normalMin: 16, normalMax: 9999 },
          { key: "total_count",   label: "Total Sperm Count",   unit: "x10⁶",  type: "number", refRange: "≥ 39 x10⁶", normalMin: 39, normalMax: 9999 },
          { key: "progressive",   label: "Progressive Motility (PR)", unit: "%", type: "number", refRange: "≥ 30%", normalMin: 30, normalMax: 100 },
          { key: "total_motile",  label: "Total Motility (PR+NP)",    unit: "%", type: "number", refRange: "≥ 42%", normalMin: 42, normalMax: 100 },
          { key: "vitality",      label: "Vitality (Live)",           unit: "%", type: "number", refRange: "≥ 54%", normalMin: 54, normalMax: 100 },
          { key: "morphology",    label: "Normal Morphology (WHO-5)", unit: "%", type: "number", refRange: "≥ 4%",  normalMin: 4,  normalMax: 100 },
          { key: "head_defects",  label: "Head Defects",          unit: "%", type: "number" },
          { key: "tail_defects",  label: "Tail / Midpiece Defects",unit: "%", type: "number" },
          { key: "wbc_count",     label: "WBC (Round Cells)",  unit: "x10⁶/mL", type: "number", refRange: "< 1.0", normalMin: 0, normalMax: 1 },
          { key: "impression",    label: "Impression",         type: "select", options: ["Normozoospermia", "Oligozoospermia", "Asthenozoospermia", "Teratozoospermia", "Oligoasthenoteratozoospermia (OAT)", "Azoospermia", "Cryptozoospermia", "Aspermia"] },
          { key: "remarks",       label: "Remarks",            type: "textarea" }
        ]
      }
    ]
  },

  // ─────────────────────────────────────────────
  // DRUG LEVELS & TOXICOLOGY
  // ─────────────────────────────────────────────
  toxicology: {
    label: "Toxicology & Drug Levels",
    color: "#e67e22",
    icon: "💊",
    tests: [
      {
        id: "URINE_DRUGS",
        name: "Urine Drug Screen (Rapid)",
        fields: [
          { key: "cannabinoids",  label: "Cannabinoids (THC)", type: "select", options: ["Negative", "Positive"] },
          { key: "cocaine",       label: "Cocaine (COC)",      type: "select", options: ["Negative", "Positive"] },
          { key: "opiates",       label: "Opiates (OPI)",      type: "select", options: ["Negative", "Positive"] },
          { key: "amphetamines",  label: "Amphetamines (AMP)", type: "select", options: ["Negative", "Positive"] },
          { key: "benzodiazepines",label:"Benzodiazepines",    type: "select", options: ["Negative", "Positive"] },
          { key: "methamphetamine",label:"Methamphetamine",    type: "select", options: ["Negative", "Positive"] },
          { key: "pcp",           label: "Phencyclidine (PCP)", type: "select", options: ["Negative", "Positive"] },
          { key: "validity",      label: "Specimen Validity",  type: "select", options: ["Valid", "Dilute", "Substituted", "Adulterated"] },
          { key: "remarks",       label: "Remarks",            type: "textarea" }
        ]
      },
      {
        id: "BLOOD_ALCOHOL",
        name: "Blood Alcohol Level (BAL)",
        fields: [
          { key: "bal",     label: "Blood Alcohol", unit: "mg/dL", type: "number", refRange: "0 (Legal limit varies by jurisdiction)" },
          { key: "remarks", label: "Remarks",       type: "textarea" }
        ]
      },
      {
        id: "PARACETAMOL_LEVEL",
        name: "Paracetamol Level",
        fields: [
          { key: "time_ingestion", label: "Time since ingestion",  unit: "hours", type: "number" },
          { key: "level",          label: "Paracetamol Level",     unit: "µg/mL", type: "number" },
          { key: "risk",           label: "Risk Assessment (Rumack-Matthew nomogram)", type: "select", options: ["Below treatment line (Low risk)", "Above treatment line (High risk – treat)", "Time unknown"] },
          { key: "remarks",        label: "Remarks",               type: "textarea" }
        ]
      }
    ]
  },

  // ─────────────────────────────────────────────
  // HISTOPATHOLOGY / CYTOLOGY
  // ─────────────────────────────────────────────
  histopathology: {
    label: "Histopathology & Cytology",
    color: "#8e44ad",
    icon: "🔬",
    tests: [
      {
        id: "PAP_SMEAR",
        name: "Pap Smear (Cervical Cytology)",
        fields: [
          { key: "specimen_type",  label: "Specimen Type",      type: "select", options: ["Conventional Smear", "Liquid-Based Cytology (LBC)"] },
          { key: "adequacy",       label: "Specimen Adequacy",  type: "select", options: ["Satisfactory", "Unsatisfactory – obscuring blood", "Unsatisfactory – insufficient cells"] },
          { key: "categorisation", label: "Bethesda Category",  type: "select", options: [
            "Negative for Intraepithelial Lesion or Malignancy (NILM)",
            "Atypical Squamous Cells of Undetermined Significance (ASCUS)",
            "Atypical Squamous Cells – Cannot Exclude HSIL (ASC-H)",
            "Low-Grade Squamous Intraepithelial Lesion (LSIL)",
            "High-Grade Squamous Intraepithelial Lesion (HSIL)",
            "Squamous Cell Carcinoma",
            "Atypical Glandular Cells (AGC)",
            "Adenocarcinoma in situ",
            "Adenocarcinoma"
          ] },
          { key: "organisms",      label: "Organisms",          type: "select", options: ["None", "Trichomonas vaginalis", "Candida spp.", "Bacterial Vaginosis", "Actinomyces spp.", "Herpes virus changes"] },
          { key: "hormonal",       label: "Hormonal Evaluation",type: "select", options: ["Not evaluated", "Compatible with age", "Atrophy", "Estrogenic effect"] },
          { key: "recommendation", label: "Recommendation",     type: "select", options: ["Routine recall", "Repeat in 6 months", "Colposcopy recommended", "Immediate referral"] },
          { key: "remarks",        label: "Remarks",            type: "textarea" }
        ]
      },
      {
        id: "BIOPSY_REPORT",
        name: "Biopsy / Histopathology Report",
        fields: [
          { key: "specimen",      label: "Specimen / Site",      type: "text" },
          { key: "procedure",     label: "Procedure",            type: "select", options: ["Punch Biopsy", "Excision Biopsy", "Core Needle Biopsy", "FNAC", "Endoscopic Biopsy", "Curettage", "Bone Marrow Biopsy"] },
          { key: "macroscopy",    label: "Macroscopic Description", type: "textarea" },
          { key: "microscopy",    label: "Microscopic Description", type: "textarea" },
          { key: "diagnosis",     label: "Histopathological Diagnosis", type: "textarea" },
          { key: "grade",         label: "Tumour Grade (if applicable)", type: "select", options: ["Not applicable", "Well differentiated (Grade 1)", "Moderately differentiated (Grade 2)", "Poorly differentiated (Grade 3)", "Undifferentiated (Grade 4)"] },
          { key: "margins",       label: "Surgical Margins",     type: "select", options: ["Not applicable", "Clear (> 5mm)", "Close (< 5mm)", "Involved"] },
          { key: "remarks",       label: "Remarks",              type: "textarea" }
        ]
      },
      {
        id: "FNAC",
        name: "Fine Needle Aspiration Cytology (FNAC)",
        fields: [
          { key: "site",        label: "Site",                type: "text" },
          { key: "adequacy",    label: "Adequacy",            type: "select", options: ["Adequate", "Inadequate – scant cellularity", "Inadequate – poor preservation"] },
          { key: "cells",       label: "Cytological Findings",type: "textarea" },
          { key: "diagnosis",   label: "Cytological Diagnosis",type: "select", options: [
            "Benign / Reactive",
            "Inflammatory (Acute / Chronic / Granulomatous)",
            "Atypical cells – nature uncertain",
            "Suspicious for malignancy",
            "Malignant – specify type",
            "Unsatisfactory"
          ] },
          { key: "remarks",     label: "Remarks",            type: "textarea" }
        ]
      }
    ]
  },

  extended_catalog: {
    label: "Extended Test Catalog",
    color: "#34495e",
    icon: "📋",
    tests: buildExtendedCatalogTests(130)
  }
};

// ─────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────

/**
 * Get all tests as a flat array with category info
 */
function getAllTests() {
  const all = [];
  for (const [catKey, cat] of Object.entries(LAB_TEST_TEMPLATES)) {
    for (const test of cat.tests) {
      all.push({
        ...test,
        categoryKey: catKey,
        categoryLabel: cat.label,
        categoryColor: cat.color,
        categoryIcon: cat.icon
      });
    }
  }
  return all;
}

/**
 * Best-effort match from consultation / cashier order line name → structured template.
 * @param {string|null|undefined} itemName
 * @returns {{ testId: string, catKey: string, testName: string } | null}
 */
function suggestTemplateForOrderName(itemName) {
  const norm = String(itemName || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!norm) return null;
  let best = null;
  let bestScore = 0;
  for (const t of getAllTests()) {
    const nm = String(t.name || '')
      .trim()
      .toLowerCase();
    let score = 0;
    if (nm === norm) score = 1000;
    else if (nm.includes(norm) || norm.includes(nm)) score = 500 + Math.min(nm.length, norm.length);
    else {
      const ws = (s) =>
        s
          .split(/[^a-z0-9]+/i)
          .map((x) => x.toLowerCase())
          .filter((x) => x.length > 1);
      const A = new Set(ws(nm));
      const B = new Set(ws(norm));
      let inter = 0;
      for (const w of A) if (B.has(w)) inter++;
      if (inter) score = inter * 80;
    }
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (!best || bestScore < 40) return null;
  const catKey = best.categoryKey;
  if (!catKey) return null;
  return { testId: best.id, catKey, testName: best.name };
}

/**
 * Get a single test template by test ID
 */
function getTestById(testId) {
  for (const cat of Object.values(LAB_TEST_TEMPLATES)) {
    const found = cat.tests.find(t => t.id === testId);
    if (found) return { ...found, category: cat.label };
  }
  return null;
}

/**
 * Get all tests for a given category
 */
function getTestsByCategory(categoryKey) {
  return LAB_TEST_TEMPLATES[categoryKey]?.tests || [];
}

/**
 * Get category metadata list
 */
function getCategories() {
  return Object.entries(LAB_TEST_TEMPLATES).map(([key, val]) => ({
    key,
    label: val.label,
    color: val.color,
    icon: val.icon,
    count: val.tests.length
  }));
}

/**
 * Auto-flag abnormal values based on reference range
 * Returns: 'normal' | 'high' | 'low' | 'unknown'
 */
function flagValue(field, value) {
  if (value === null || value === undefined || value === '') return 'unknown';
  if (field.type !== 'number') return 'unknown';
  const num = parseFloat(value);
  if (isNaN(num)) return 'unknown';
  if (field.normalMin !== undefined && num < field.normalMin) return 'low';
  if (field.normalMax !== undefined && num > field.normalMax) return 'high';
  return 'normal';
}

/**
 * Generate a printable report object from filled-in form data
 */
function generateReportObject({ patientInfo, testId, values, conclusion, technicianId }) {
  const template = getTestById(testId);
  if (!template) throw new Error(`Test template not found: ${testId}`);

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
    reportId: `RPT-${Date.now()}`,
    testId: template.id,
    testName: template.name,
    category: template.category,
    patientInfo,
    results,
    conclusion: conclusion || '',
    technicianId: technicianId || '',
    generatedAt: new Date().toISOString()
  };
}

// ─────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────
module.exports = {
  LAB_TEST_TEMPLATES,
  getAllTests,
  getTestById,
  getTestsByCategory,
  getCategories,
  suggestTemplateForOrderName,
  flagValue,
  generateReportObject
};
