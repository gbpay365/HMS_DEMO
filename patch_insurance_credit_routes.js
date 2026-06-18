// patch_insurance_credit_routes.js
const fs = require('fs');
let src = fs.readFileSync('app.js', 'utf8');

// ── CAMEROON GEO DATA ─────────────────────────────────────────────────────────
const CAMEROON_GEO = {
  regions: ['Adamaoua','Centre','Est','Extrême-Nord','Littoral','Nord','Nord-Ouest','Ouest','Sud','Sud-Ouest'],
  departments: {
    'Adamaoua':['Djérem','Faro-et-Déo','Mayo-Banyo','Mbéré','Vina'],
    'Centre':['Haute-Sanaga','Lékié','Mbam-et-Inoubou','Mbam-et-Kim','Méfou-et-Afamba','Méfou-et-Akono','Mfoundi','Nyong-et-Kéllé','Nyong-et-Mfoumou','Nyong-et-So\'o'],
    'Est':['Boumba-et-Ngoko','Haut-Nyong','Kadey','Lom-et-Djerem'],
    'Extrême-Nord':['Diamaré','Logone-et-Chari','Mayo-Danay','Mayo-Kani','Mayo-Sava','Mayo-Tsanaga'],
    'Littoral':['Moungo','Nkam','Sanaga-Maritime','Wouri'],
    'Nord':['Bénoué','Faro','Mayo-Louti','Mayo-Rey'],
    'Nord-Ouest':['Bui','Donga-Mantung','Menchum','Mezam','Momo','Ngoketunjia','Nwa'],
    'Ouest':['Bamboutos','Haut-Nkam','Hauts-Plateaux','Koung-Khi','Menoua','Mifi','Ndian','Noun'],
    'Sud':['Dja-et-Lobo','Mvila','Océan','Vallée-du-Ntem'],
    'Sud-Ouest':['Fako','Koupé-Manengouba','Lebialem','Manyu','Meme','Ndian']
  },
  communes: {
    'Adamaoua':{'Djérem':['Tibati','Tignère','Autre commune…'],'Faro-et-Déo':['Poli','Guider','Autre commune…'],'Mayo-Banyo':['Banyo','Bankim','Autre commune…'],'Mbéré':['Meiganga','Ngaoui','Autre commune…'],'Vina':['Ngaoundéré','Martap','Autre commune…']},
    'Centre':{'Haute-Sanaga':['Nanga-Eboko','Mbalmayo','Autre commune…'],'Lékié':['Monatélé','Obala',"Sa'a",'Autre commune…'],'Mbam-et-Inoubou':['Bafia','Ndikinimeki','Autre commune…'],'Mbam-et-Kim':['Ntui','Ngambé-Tikar','Autre commune…'],'Méfou-et-Afamba':['Mfou','Soa','Autre commune…'],'Méfou-et-Akono':['Ngoumou','Akono','Autre commune…'],'Mfoundi':['Yaoundé','Ngousso','Essos','Autre commune…'],'Nyong-et-Kéllé':['Éséka','Botourwa','Autre commune…'],'Nyong-et-Mfoumou':['Akonolinga','Endom','Autre commune…'],"Nyong-et-So'o":['Mbalmayo','Ngomedzap','Autre commune…']},
    'Est':{'Boumba-et-Ngoko':['Yokadouma','Gari-Gombo','Autre commune…'],'Haut-Nyong':['Abong-Mbang','Dimako','Autre commune…'],'Kadey':['Batouri','Kentzouo','Autre commune…'],'Lom-et-Djerem':['Bertoua','Bélabo','Autre commune…']},
    'Extrême-Nord':{'Diamaré':['Maroua','Douggoï','Autre commune…'],'Logone-et-Chari':['Kousséri','Logone-Birni','Autre commune…'],'Mayo-Danay':['Yagoua','Kaélé','Autre commune…'],'Mayo-Kani':['Kaélé','Guidiguis','Autre commune…'],'Mayo-Sava':['Mora','Tokombéré','Autre commune…'],'Mayo-Tsanaga':['Mokolo','Koza','Autre commune…']},
    'Littoral':{'Moungo':['Nkongsamba','Penja','Loum','Autre commune…'],'Nkam':['Yabassi','Nkondjock','Autre commune…'],'Sanaga-Maritime':['Édéa','Dibamba','Massock','Autre commune…'],'Wouri':['Douala','Bonabéri','Manoka','Autre commune…']},
    'Nord':{'Bénoué':['Garoua','Demsa','Pitoa','Autre commune…'],'Faro':['Poli','Guider','Autre commune…'],'Mayo-Louti':['Guider','Figuil','Autre commune…'],'Mayo-Rey':['Tcholliré','Rey-Bouba','Autre commune…']},
    'Nord-Ouest':{'Bui':['Kumbo','Jakiri','Oku','Autre commune…'],'Donga-Mantung':['Ako','Nkambé','Autre commune…'],'Menchum':['Wum','Furu-Awa','Autre commune…'],'Mezam':['Bamenda','Bafut','Santa','Autre commune…'],'Momo':['Mbengwi','Njikwa','Autre commune…'],'Ngoketunjia':['Ndop','Babessi','Autre commune…'],'Nwa':['Djahanyi','Nwa','Autre commune…']},
    'Ouest':{'Bamboutos':['Mbouda','Galim','Batcham','Autre commune…'],'Haut-Nkam':['Kekem','Banka','Autre commune…'],'Hauts-Plateaux':['Baham','Bangou','Autre commune…'],'Koung-Khi':['Bandjoun','Bayangam','Autre commune…'],'Menoua':['Dschang','Fokoué','Autre commune…'],'Mifi':['Bafoussam','Badou','Autre commune…'],'Ndian':['Mundemba','Kumba','Autre commune…'],'Noun':['Foumban','Kouoptamo','Autre commune…']},
    'Sud':{'Dja-et-Lobo':['Sangmélima','Meyomessala','Autre commune…'],'Mvila':['Ebolowa','Mvangan','Autre commune…'],'Océan':['Kribi','Lolodorf','Akom II','Autre commune…'],'Vallée-du-Ntem':['Ambam',"Ma'an",'Autre commune…']},
    'Sud-Ouest':{'Fako':['Limbe','Buea','Tiko','Idenau','Autre commune…'],'Koupé-Manengouba':['Bangem','Nguti','Autre commune…'],'Lebialem':['Menji','Fontem','Autre commune…'],'Manyu':['Mamfe','Eyumojock','Autre commune…'],'Meme':['Kumba','Mbonge','Autre commune…'],'Ndian':['Mundemba','Isangele','Autre commune…']}
  },
  villageDefaults: ['Centre-ville / chef-lieu','Quartier résidentiel','Zone périphérique / village','Autre (préciser dans le complément)']
};

const newRoutes = `

// ══════════════════════════════════════════════════════════════
// CAMEROON GEO DATA API
// ══════════════════════════════════════════════════════════════
app.get('/api/cameroon-geo', (req, res) => {
  res.json(${JSON.stringify(CAMEROON_GEO)});
});

// ══════════════════════════════════════════════════════════════
// OPEN CREDIT LINE — existing patient
// ══════════════════════════════════════════════════════════════
app.post('/patients/:id/open-credit', requireAuth, async (req, res) => {
  const pid = parseInt(req.params.id) || 0;
  const { emergency_pending } = req.body;
  const uid = req.session.userId || req.session.user?.id || 1;
  try {
    const [[pt]] = await pool.query('SELECT id, first_name, last_name FROM tbl_patient WHERE id = ? LIMIT 1', [pid]);
    if (!pt) return res.redirect('/patients?err=Patient+not+found.');
    const [[existing]] = await pool.query("SELECT id FROM tbl_credit_account WHERE patient_id = ? AND status = 'active' LIMIT 1", [pid]);
    if (existing) return res.redirect('/credit-account/' + existing.id + '?msg=Account+already+open.');
    const [r] = await pool.query(
      "INSERT INTO tbl_credit_account (patient_id, status, outstanding_balance, created_by, created_at) VALUES (?, 'active', 0, ?, NOW())",
      [pid, uid]
    );
    const newId = r.insertId;
    if (emergency_pending && newId) {
      await pool.query("UPDATE tbl_credit_account SET notes = 'Emergency — payment pending' WHERE id = ?", [newId]);
    }
    res.redirect('/credit-account/' + newId + '?msg=Credit+account+opened+for+' + encodeURIComponent(pt.first_name + ' ' + pt.last_name));
  } catch(err) {
    console.error('OPEN CREDIT ERROR:', err.message);
    res.redirect('/patients?err=Could+not+open+credit:+' + encodeURIComponent(err.message));
  }
});

// ══════════════════════════════════════════════════════════════
// PATIENT INSURANCE MANAGEMENT
// ══════════════════════════════════════════════════════════════

// GET: Patient insurance page
app.get('/patients/:id/insurance', requireAuth, async (req, res) => {
  const pid = parseInt(req.params.id) || 0;
  try {
    const [[patient]] = await pool.query('SELECT id, first_name, last_name, phone FROM tbl_patient WHERE id = ? LIMIT 1', [pid]);
    if (!patient) return res.redirect('/patients?err=Patient+not+found.');
    const [policies] = await pool.query(\`
      SELECT pi.*, ic.name AS carrier_name, ic.code AS carrier_code, ic.api_endpoint
      FROM tbl_patient_insurance pi
      LEFT JOIN tbl_insurance_carrier ic ON ic.id = pi.carrier_id
      WHERE pi.patient_id = ?
      ORDER BY pi.is_primary DESC, pi.id DESC
    \`, [pid]).catch(() => [[]]);
    const [carriers] = await pool.query('SELECT id, name, code, api_endpoint FROM tbl_insurance_carrier WHERE status = 1 ORDER BY name').catch(() => [[]]);
    res.render('patient-insurance', {
      title: 'Insurance — ' + patient.first_name + ' ' + patient.last_name,
      patient, policies: policies || [], carriers: carriers || [],
      flash: req.query.msg || null, error: req.query.err || null
    });
  } catch(err) {
    console.error('PATIENT INSURANCE GET:', err.message);
    res.status(500).render('error', { title: 'Error', message: 'Could not load insurance.', status: 500 });
  }
});

// POST: Add insurance policy (manual)
app.post('/patients/:id/insurance/add', requireAuth, async (req, res) => {
  const pid = parseInt(req.params.id) || 0;
  const { carrier_id, policy_number, insurer_covered_percent, is_primary, effective_from, effective_to, notes } = req.body;
  const uid = req.session.userId || req.session.user?.id || 1;
  const pct = Math.min(100, Math.max(0, parseInt(insurer_covered_percent) || 0));
  const primary = is_primary ? 1 : 0;
  try {
    // If setting as primary, demote existing primary
    if (primary) {
      await pool.query("UPDATE tbl_patient_insurance SET is_primary = 0 WHERE patient_id = ? AND is_primary = 1", [pid]);
    }
    await pool.query(
      \`INSERT INTO tbl_patient_insurance
        (patient_id, carrier_id, policy_number, insurer_covered_percent, is_primary,
         effective_from, effective_to, notes, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,NOW())\`,
      [pid, parseInt(carrier_id)||null, policy_number||null, pct, primary,
       effective_from||null, effective_to||null, notes||null, uid]
    );
    res.redirect('/patients/' + pid + '/insurance?msg=Policy+added+successfully.');
  } catch(err) {
    console.error('ADD POLICY ERROR:', err.message);
    res.redirect('/patients/' + pid + '/insurance?err=Could+not+add+policy:+' + encodeURIComponent(err.message));
  }
});

// POST: Auto-lookup via carrier API stub
app.post('/patients/:id/insurance/lookup', requireAuth, async (req, res) => {
  const pid = parseInt(req.params.id) || 0;
  const { carrier_id, insurance_id_external } = req.body;
  const uid = req.session.userId || req.session.user?.id || 1;
  const cid = parseInt(carrier_id) || 0;
  if (!insurance_id_external || !cid) {
    return res.json({ ok: false, error: 'Carrier and Insurance Card ID are required.' });
  }
  try {
    const [[carrier]] = await pool.query('SELECT id, name, code, api_endpoint FROM tbl_insurance_carrier WHERE id = ? LIMIT 1', [cid]);
    if (!carrier) return res.json({ ok: false, error: 'Carrier not found.' });
    let result = null;
    if (carrier.api_endpoint) {
      // Real API call
      try {
        const https = require('https');
        const http = require('http');
        const url = new URL(carrier.api_endpoint.replace('{INSURANCE_ID}', encodeURIComponent(insurance_id_external)));
        const proto = url.protocol === 'https:' ? https : http;
        result = await new Promise((resolve, reject) => {
          const rq = proto.get(url.toString(), { timeout: 5000 }, (resp) => {
            let data = '';
            resp.on('data', c => data += c);
            resp.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(new Error('Invalid JSON from API')); } });
          });
          rq.on('error', reject);
          rq.on('timeout', () => { rq.destroy(); reject(new Error('API timeout')); });
        });
      } catch(apiErr) {
        return res.json({ ok: false, error: 'API error: ' + apiErr.message, stub: true });
      }
    } else {
      // Stub response — no real API configured
      result = {
        stub: true,
        insurance_id: insurance_id_external,
        carrier_name: carrier.name,
        carrier_code: carrier.code,
        insurer_covered_percent: 80,
        policy_number: 'AUTO-' + insurance_id_external.toUpperCase(),
        patient_name: null,
        effective_from: new Date().toISOString().split('T')[0],
        effective_to: null,
        message: 'Stub response — configure api_endpoint on this carrier for live data.'
      };
    }
    // Return to client for review before saving
    res.json({ ok: true, result, carrier });
  } catch(err) {
    console.error('INSURANCE LOOKUP ERROR:', err.message);
    res.json({ ok: false, error: err.message });
  }
});

// POST: Save auto-lookup result
app.post('/patients/:id/insurance/save-lookup', requireAuth, async (req, res) => {
  const pid = parseInt(req.params.id) || 0;
  const { carrier_id, insurance_id_external, policy_number, insurer_covered_percent, is_primary, effective_from, effective_to, api_source } = req.body;
  const uid = req.session.userId || req.session.user?.id || 1;
  const pct = Math.min(100, Math.max(0, parseInt(insurer_covered_percent) || 0));
  const primary = is_primary ? 1 : 0;
  try {
    if (primary) {
      await pool.query("UPDATE tbl_patient_insurance SET is_primary = 0 WHERE patient_id = ? AND is_primary = 1", [pid]);
    }
    await pool.query(
      \`INSERT INTO tbl_patient_insurance
        (patient_id, carrier_id, insurance_id_external, policy_number, insurer_covered_percent,
         is_primary, effective_from, effective_to, api_source, api_last_fetched, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,NOW(),?,NOW())\`,
      [pid, parseInt(carrier_id)||null, insurance_id_external||null, policy_number||null,
       pct, primary, effective_from||null, effective_to||null, api_source||'stub', uid]
    );
    res.redirect('/patients/' + pid + '/insurance?msg=Insurance+policy+saved+from+lookup.');
  } catch(err) {
    console.error('SAVE LOOKUP ERROR:', err.message);
    res.redirect('/patients/' + pid + '/insurance?err=Could+not+save:+' + encodeURIComponent(err.message));
  }
});

// POST: Remove policy
app.post('/patients/:id/insurance/:polid/remove', requireAuth, async (req, res) => {
  const pid = parseInt(req.params.id) || 0;
  const polid = parseInt(req.params.polid) || 0;
  try {
    await pool.query('DELETE FROM tbl_patient_insurance WHERE id = ? AND patient_id = ?', [polid, pid]);
    res.redirect('/patients/' + pid + '/insurance?msg=Policy+removed.');
  } catch(err) {
    res.redirect('/patients/' + pid + '/insurance?err=Remove+failed.');
  }
});

`;

// Insert before the 404 handler or near the end
const marker = '// (404 and 500 handlers are registered at the very bottom of the file)';
const idx = src.indexOf(marker);
if (idx >= 0) {
  src = src.slice(0, idx) + newRoutes + '\n' + src.slice(idx);
} else {
  const fb = src.lastIndexOf('app.use(');
  src = src.slice(0, fb) + newRoutes + '\n' + src.slice(fb);
}

fs.writeFileSync('app.js', src, 'utf8');
try {
  require('child_process').execSync('node --check app.js', { cwd: __dirname });
  console.log('Insurance + Credit routes added — Syntax OK');
} catch(e) {
  console.error('Syntax ERROR:', e.stderr ? e.stderr.toString().split('\n').slice(0,3).join('\n') : e.message);
  process.exit(1);
}
