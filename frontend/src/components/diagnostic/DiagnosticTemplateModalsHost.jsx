import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { mountDiagTplModalBridge, registerDiagTplModalsHost } from '../../lib/diagTplModalBridge';

function RefsModal({ open, onClose, title, fields, onSave, saving }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!open) return;
    setRows(
      (fields || []).map((f) => ({
        field_key: f.field_key,
        label: f.label,
        unit: f.unit || '',
        ref_range: f.ref_range || '',
        normal_min: f.normal_min != null ? String(f.normal_min) : '',
        normal_max: f.normal_max != null ? String(f.normal_max) : '',
      }))
    );
  }, [open, fields]);

  function patchRow(key, part, value) {
    setRows((prev) =>
      prev.map((r) => (r.field_key === key ? { ...r, [part]: value } : r))
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={title || 'Edit reference ranges'}
      footer={
        <>
          <button type="button" className="hms-btn hms-btn-secondary" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="hms-btn hms-btn-primary"
            disabled={saving}
            onClick={() => onSave?.(rows)}
          >
            <i className="fa fa-save mr-1" aria-hidden="true" />
            {saving ? 'Saving…' : 'Save references'}
          </button>
        </>
      }
    >
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Field</th>
              <th className="px-3 py-2 text-left">Unit</th>
              <th className="px-3 py-2 text-left">Ref display</th>
              <th className="px-3 py-2 text-left">Min</th>
              <th className="px-3 py-2 text-left">Max</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.field_key} className="border-t border-slate-100">
                <td className="px-3 py-2 font-semibold text-slate-800">{f.label}</td>
                <td className="px-3 py-2 text-slate-500">{f.unit}</td>
                <td className="px-3 py-2">
                  <input
                    className="hms-input w-full text-sm"
                    value={f.ref_range}
                    onChange={(e) => patchRow(f.field_key, 'ref_range', e.target.value)}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="any"
                    className="hms-input w-full text-sm"
                    value={f.normal_min}
                    onChange={(e) => patchRow(f.field_key, 'normal_min', e.target.value)}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="any"
                    className="hms-input w-full text-sm"
                    value={f.normal_max}
                    onChange={(e) => patchRow(f.field_key, 'normal_max', e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function PreviewModal({ open, onClose, title, html, onPrint, onSave }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={title || 'Report preview'}
      footer={
        <>
          <button type="button" className="hms-btn hms-btn-secondary" onClick={onClose}>
            Close
          </button>
          {onPrint ? (
            <button type="button" className="hms-btn hms-btn-secondary" onClick={onPrint}>
              <i className="fa fa-print mr-1" aria-hidden="true" />
              Print
            </button>
          ) : null}
          {onSave ? (
            <button type="button" className="hms-btn hms-btn-primary" onClick={onSave}>
              <i className="fa fa-save mr-1" aria-hidden="true" />
              Save to registry
            </button>
          ) : null}
        </>
      }
    >
      <div
        className="min-h-[200px] rounded-xl bg-white p-2"
        dangerouslySetInnerHTML={{ __html: html || '' }}
      />
    </Modal>
  );
}

export function DiagnosticTemplateModalsHost() {
  const [refsOpen, setRefsOpen] = useState(false);
  const [refsCtx, setRefsCtx] = useState({ title: '', fields: [], onSave: null });
  const [refsSaving, setRefsSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewCtx, setPreviewCtx] = useState({
    title: '',
    html: '',
    onPrint: null,
    onSave: null,
  });

  const closeRefs = useCallback(() => {
    setRefsOpen(false);
    setRefsSaving(false);
  }, []);

  const closePreview = useCallback(() => setPreviewOpen(false), []);

  useEffect(() => {
    registerDiagTplModalsHost({
      openRefs: (config) => {
        setRefsCtx({
          title: config.title || 'Edit reference ranges',
          fields: config.fields || [],
          onSave: config.onSave || null,
        });
        setRefsOpen(true);
      },
      openPreview: (config) => {
        setPreviewCtx({
          title: config.title || 'Report preview',
          html: config.html || '',
          onPrint: config.onPrint || null,
          onSave: config.onSave || null,
        });
        setPreviewOpen(true);
      },
      close: (which) => {
        if (which === 'refs') closeRefs();
        else if (which === 'preview') closePreview();
        else {
          closeRefs();
          closePreview();
        }
      },
    });
    mountDiagTplModalBridge();
    return () => registerDiagTplModalsHost(null);
  }, [closeRefs, closePreview]);

  async function handleRefsSave(rows) {
    if (!refsCtx.onSave) return;
    setRefsSaving(true);
    try {
      await refsCtx.onSave(rows);
      closeRefs();
    } finally {
      setRefsSaving(false);
    }
  }

  return (
    <>
      <RefsModal
        open={refsOpen}
        onClose={closeRefs}
        title={refsCtx.title}
        fields={refsCtx.fields}
        onSave={handleRefsSave}
        saving={refsSaving}
      />
      <PreviewModal
        open={previewOpen}
        onClose={closePreview}
        title={previewCtx.title}
        html={previewCtx.html}
        onPrint={previewCtx.onPrint}
        onSave={previewCtx.onSave}
      />
    </>
  );
}
