# Canonical source tree

The **repository root** (`C:\HMS_JS\` or your clone root) is the only tree you should edit by hand.

| Path | Purpose |
|------|---------|
| **Root** | Live development source — edit here |
| `dist/hms-deploy/` | Generated deployment package — run `npm run build:deploy` |
| `Update/` | Optional hand-off folder for production robocopy — regenerate from deploy build, do not edit |

## Workflow

1. Change code in the **root** tree.
2. After UI changes: `npm run build:ui` (updates `public/dist/hms-ui.js`).
3. Before shipping: `npm run build:deploy` (refreshes `dist/hms-deploy/`).
4. Copy `dist/hms-deploy/` to production (or sync into `Update/` if your ops process uses that folder).
5. Verify drift: `npm run check:mirror-drift`.

## Do not

- Edit `Update/` or `dist/hms-deploy/` directly — changes will be overwritten and will diverge from root.
- Commit secrets (`.env`, license private keys) into any tree.

## Related

- `docs/INTEGRATION-APIS.md` — REST APIs that complement SSR pages (maternity, vaccination).
- `scripts/check-mirror-drift.mjs` — compares deploy mirror against root using `MANIFEST.txt`.
