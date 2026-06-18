require('dotenv').config();
const mysql = require('mysql2/promise');

const OPENFDA = 'https://api.fda.gov/drug/label.json';

function norm(s) {
  return String(s || '').trim();
}
function normLower(s) {
  return norm(s).toLowerCase();
}

function guessCategoryFromText(text) {
  const t = normLower(text);
  if (!t) return null;

  // Non-drug pharmacy items (consumables/equipment) that still live under Pharmacy in some setups
  if (/\b(gloves|bandage|gauze|syringe|needle|catheter|cannula|dressing|tape|cotton|swab|mask|thermometer|stethoscope|wheelchair|crutches|walker|monitor|oximeter|glucometer|nebulizer|concentrator|ecg|electrodes|bedpan|urinal|iv pole|suction machine|otoscope|ophthalmoscope|gown|sheet|towel|stand cover|mayo|feeding bag|feeding set|ng tube|sharps|biohazard|waste bag|waste container|flowmeter|humidifier bottle|oxygen tubing|cylinder|wrench|cart|cover)\b/.test(t)) {
    return /\b(monitor|thermometer|stethoscope|wheelchair|crutches|walker|oximeter|glucometer|nebulizer|concentrator|suction machine|otoscope|ophthalmoscope|ecg)\b/.test(t)
      ? 'Equipment'
      : 'Supplies';
  }

  if (/\b(ringers|normal saline|dextrose)\b/.test(t)) return 'IV Fluids';

  // High-signal buckets (keep short & practical for HMS)
  const rules = [
    { cat: 'Malaria', re: /\bmalaria\b|\bplasmodium\b|\bartem(ether|isinin)\b|\blumefantrine\b|\bartesunate\b|\bquinine\b|\bprimaquine\b|\bsulfadoxine\b|\bpyrimethamine\b/ },
    { cat: 'Pain / Fever', re: /\bparacetamol\b|\bacetaminophen\b|\bibuprofen\b|\bdiclofenac\b|\befferalgan\b|\btramadol\b|\bmorphine\b|\bpain\b|\bfever\b|\bpyrexia\b|\banalgesic\b|\bantipyretic\b|\bheadache\b|\bmigraine\b/ },
    { cat: 'Antibiotics', re: /\bantibiotic\b|\bbacterial\b|\binfection\b|\bpenicillin\b|\bamoxicillin\b|\bclavulan|\bcef|\bceph|ciprofloxacin|azithromycin|metronidazole|doxycycline|cotrimoxazole|trimethoprim|sulfamethoxazole|meropenem|ceftazidime|vancomycin|clindamycin|gentamicin/ },
    { cat: 'Cough / Cold', re: /\bcough\b|\bbronchitis\b|\bcommon cold\b|\brhinitis\b|\bnasal\b|\bdecongestant\b|\bthroat\b|\blozenge\b/ },
    { cat: 'Allergy', re: /\ballergic\b|\ballergy\b|\burticaria\b|\bhay fever\b|\brash\b|\bpruritus\b/ },
    { cat: 'Hypertension', re: /\bhypertension\b|\bhigh blood pressure\b|\bamlodipine\b|\blosartan\b|\benalapril\b|\blisinopril\b|\bhydrochlorothiazide\b|\bfurosemide\b|\bspironolactone\b/ },
    { cat: 'Diabetes', re: /\bdiabetes\b|\bhyperglycemia\b|\binsulin\b|\bmetformin\b|\bglibenclamide\b/ },
    { cat: 'Worms / Parasites', re: /\bhelminth\b|\bworm\b|\bdeworm\b|\balbendazole\b|\bmebendazole\b|\bpraziquantel\b/ },
    { cat: 'Diarrhea', re: /\bdiarrh(e|a)a\b|\bcholera\b|\brehydration\b|\bors\b/ },
    { cat: 'Vitamins / Supplements', re: /\bvitamin\b|\bsupplement\b|\biron\b|\bferrous\b|\bfolic\b|\bmultivitamin\b|\bzinc\b/ },
    { cat: 'Ulcer / Gastric', re: /\bulcer\b|\bgastric\b|\bgastroesophageal\b|\bgerd\b|\bheartburn\b|\bomeprazole\b|\bpantoprazole\b|\branitidine\b|\blactulose\b/ },
    { cat: 'Asthma / Breathing', re: /\bsalbutamol\b|\bbeclometasone\b|\basthma\b|\bwheez/ },
    { cat: 'Antifungal', re: /\bfungal\b|\btinea\b|\bfluconazole\b|\bnystatin\b|\bmiconazole\b/ },
    { cat: 'Dermatology', re: /\bacne\b|\beczema\b|\bdermatitis\b|\bclotrimazole\b|\bcalamine\b|\bpermethrin\b/ },
    { cat: 'Family Planning', re: /\blevonorgestrel\b|\bcontracept/ },
    { cat: 'Antispasmodic', re: /\bhyoscine\b|\bbutylbromide\b|\bphloroglucinol\b|\bspasfon\b/ },
    { cat: 'Mental Health', re: /\bhaloperidol\b/ },
    { cat: 'Seizures', re: /\bdiazepam\b|\bphenobarbital\b|\bphenytoin\b|\bcarbamazepine\b|\bseizure\b|\bconvulsion\b|\bepilep/ },
    { cat: 'Gout', re: /\ballopurinol\b|\bgout\b/ },
    { cat: 'Burns / Wound care', re: /\bsilver sulfadiazine\b|\bburn\b/ },
    { cat: 'Cholesterol', re: /\batorvastatin\b|\bsimvastatin\b|\bstatin\b/ },
    { cat: 'Steroids / Anti-inflammatory', re: /\bprednisolone\b|\bdexamethasone\b|\bsteroid\b/ },
    { cat: 'Obstetrics', re: /\boxytocin\b|\bmisoprostol\b|\bmagnesium sulfate\b/ },
    { cat: 'Anesthesia', re: /\bketamine\b|\blidocaine\b|\banesth/ },
    { cat: 'Emergency', re: /\bnaloxone\b|\batropine\b|\bcalcium gluconate\b|\bsodium bicarbonate\b/ },
    { cat: 'Heart', re: /\bnitroglycerin\b|\bdigoxin\b|\bheart failure\b|\bangina\b/ },
    { cat: 'Eye', re: /\bophthalmic\b|\bconjunctivitis\b|\beye\b|\bartificial tears\b/ },
  ];

  for (const r of rules) {
    if (r.re.test(t)) return r.cat;
  }
  return null;
}

function looksLikeMedicineName(name) {
  const t = normLower(name);
  if (!t) return false;
  return /\b(mg|mcg|g|ml|iu|tablet|tablets|capsule|capsules|syrup|injection|injectable|vial|ampoule|infusion|inhaler|cream|ointment|drops|suppository|solution|suspension)\b/.test(t);
}

async function openFdaLookupIndication(name) {
  const q = norm(name);
  if (!q) return null;
  if (!looksLikeMedicineName(q)) return null;

  // openFDA queries are picky; try a few variations.
  const tries = [
    // brand name exact
    `openfda.brand_name:"${q.replace(/"/g, '\\"')}"`,
    // generic name exact
    `openfda.generic_name:"${q.replace(/"/g, '\\"')}"`,
    // fallback: text search across indications
    `indications_and_usage:"${q.replace(/"/g, '\\"')}"`,
  ];

  for (const search of tries) {
    const url = `${OPENFDA}?search=${encodeURIComponent(search)}&limit=1`;
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 3500);
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'HMS_JS/1.0 (auto_classify_pharmacy_used_for)' },
        signal: ctrl.signal,
      });
      clearTimeout(to);
      if (!resp.ok) continue;
      const data = await resp.json();
      const row = (data && data.results && data.results[0]) ? data.results[0] : null;
      if (!row) continue;
      const ind = Array.isArray(row.indications_and_usage) ? row.indications_and_usage.join(' ') : '';
      if (ind && ind.length > 10) return ind;
    } catch (_) {}
  }
  return null;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const isDry = !args.has('--apply');
  const overwrite = args.has('--overwrite');
  const limit = (() => {
    const i = process.argv.findIndex(a => a === '--limit');
    if (i >= 0) return Math.max(1, parseInt(process.argv[i + 1], 10) || 0);
    return 0;
  })();

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 2,
    queueLimit: 0,
  });

  const [rows] = await pool.query(
    `SELECT id, name, COALESCE(department_name,'') AS department_name
     FROM tbl_service_catalog
     WHERE status = 1 AND LOWER(TRIM(category)) = 'pharmacy'
     ORDER BY id ASC`
  );

  const targets = [];
  for (const r of rows) {
    const usedFor = norm(r.department_name);
    const isMissing = !usedFor || /^general$/i.test(usedFor) || /^uncategorized$/i.test(usedFor);
    if (overwrite || isMissing) targets.push(r);
  }

  const slice = limit > 0 ? targets.slice(0, limit) : targets;
  console.log(`Pharmacy rows: ${rows.length}. To classify: ${targets.length}. Processing: ${slice.length}. Mode: ${isDry ? 'DRY' : 'APPLY'}. Overwrite: ${overwrite}.`);

  // Fix a known mislabel case: items with "folic acid" matched "acid" previously.
  if (!isDry) {
    try {
      await pool.query(
        `UPDATE tbl_service_catalog
         SET department_name = 'Vitamins / Supplements'
         WHERE LOWER(TRIM(category))='pharmacy'
           AND LOWER(COALESCE(department_name,''))='ulcer / gastric'
           AND (LOWER(name) LIKE '%ferrous%' OR LOWER(name) LIKE '%folic%' OR LOWER(name) LIKE '%vitamin%' OR LOWER(name) LIKE '%zinc%')`
      );
    } catch (_) {}
  }

  let updated = 0;
  let skipped = 0;
  let unresolved = 0;

  for (const r of slice) {
    const name = norm(r.name);
    const current = norm(r.department_name);

    let usedFor = guessCategoryFromText(name);
    let src = usedFor ? 'name' : '';
    if (!usedFor) {
      const ind = await openFdaLookupIndication(name);
      usedFor = guessCategoryFromText(ind || '');
      src = usedFor ? 'openfda' : '';
    }

    if (!usedFor) {
      unresolved++;
      console.log(`- [UNRESOLVED] #${r.id} "${name}" (current="${current || ''}")`);
      continue;
    }

    const same = normLower(current) === normLower(usedFor);
    if (same) {
      skipped++;
      continue;
    }

    if (!isDry) {
      await pool.query('UPDATE tbl_service_catalog SET department_name=? WHERE id=? LIMIT 1', [usedFor, r.id]);
    }
    updated++;
    console.log(`- [${isDry ? 'WOULD UPDATE' : 'UPDATED'}] #${r.id} "${name}" => "${usedFor}" (${src})`);
  }

  console.log(`Done. Updated: ${updated}. Skipped(same): ${skipped}. Unresolved: ${unresolved}.`);
  await pool.end();

  if (isDry) {
    console.log('\nRun with "--apply" to write changes. Example: node scripts/auto_classify_pharmacy_used_for.js --apply');
  }
}

main().catch((e) => {
  console.error('auto_classify_pharmacy_used_for failed:', e && e.message ? e.message : e);
  process.exitCode = 1;
});

