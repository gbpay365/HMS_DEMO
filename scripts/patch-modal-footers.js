'use strict';
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '../frontend/src/modals');
const skip = new Set(['ModalHost.jsx']);
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.jsx') || skip.has(f)) continue;
  const p = path.join(dir, f);
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('hms-btn-secondary') || s.includes('ModalCancelButton')) continue;
  if (!s.includes('ModalCancelButton')) {
    s = s.replace(
      "import { Modal } from '../components/Modal';",
      "import { Modal } from '../components/Modal';\nimport { ModalCancelButton, ModalSubmitButton } from '../components/ModalActions';"
    );
  }
  const before = s;
  s = s.replace(
    /<button type="button" className="hms-btn-secondary"([^>]*)onClick=\{([^}]+)\}>\s*\{t\('(?:clinical:)?shared\.cancel'\)\}\s*<\/button>/g,
    '<ModalCancelButton onClick={$2} />'
  );
  s = s.replace(
    /<button type="button" className="hms-btn-secondary"([^>]*)onClick=\{([^}]+)\} disabled=\{([^}]+)\}>\s*\{t\('shared\.cancel'\)\}\s*<\/button>/g,
    '<ModalCancelButton onClick={$2} disabled={$3} />'
  );
  if (s !== before) {
    fs.writeFileSync(p, s);
    console.log('patched', f);
  }
}
