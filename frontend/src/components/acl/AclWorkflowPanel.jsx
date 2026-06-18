import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { aclPost } from '../../lib/aclApi';
import { confirmModal } from '../../lib/modalBridge';
import { notifyError } from '../../lib/notifyBridge';

function WorkflowStep({ step, wfKey, plMap, onDrop, onRemovePortal, onRename, onDelete, t }) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={`relative w-[155px] shrink-0 rounded-lg p-3 text-white transition ${
        dragOver ? 'scale-105 ring-2 ring-white ring-offset-2 ring-offset-brand' : ''
      }`}
      style={{ background: step.step_color || '#714b67', minHeight: 90 }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onDrop(wfKey, step.step_key);
      }}
    >
      <div className="mb-2 flex items-start justify-between gap-1 text-xs font-bold leading-tight">
        <span>{step.step_label}</span>
        <div className="flex shrink-0 gap-0.5">
          <button
            type="button"
            className="rounded bg-white/25 px-1 text-[10px]"
            title={t('shared.rename')}
            onClick={() => onRename(wfKey, step.step_key, step.step_label)}
          >
            <i className="fa fa-pencil" aria-hidden="true" />
          </button>
          {step.is_custom ? (
            <button
              type="button"
              className="rounded bg-red-500/40 px-1 text-[10px]"
              title={t('shared.delete')}
              onClick={() => onDelete(wfKey, step.step_key)}
            >
              <i className="fa fa-trash" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {(step.portals || []).map((pc) => (
          <span
            key={pc}
            className="inline-flex items-center gap-1 rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-semibold"
          >
            {plMap[pc] || pc}
            <button
              type="button"
              className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/40 text-[9px]"
              onClick={() => onRemovePortal(wfKey, step.step_key, pc)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function WorkflowFlow({ wfKey, steps, plMap, onDrop, onRemovePortal, onRename, onDelete, onAddStep, t }) {
  return (
    <div className="overflow-x-auto p-4">
      <div className="flex flex-nowrap items-start">
        {steps.map((step, i) => (
          <div key={step.step_key} className="flex shrink-0 items-center">
            {i > 0 ? (
              <span className="px-1 text-slate-300">
                <i className="fa fa-arrow-right" aria-hidden="true" />
              </span>
            ) : null}
            <WorkflowStep
              step={step}
              wfKey={wfKey}
              plMap={plMap}
              onDrop={onDrop}
              onRemovePortal={onRemovePortal}
              onRename={onRename}
              onDelete={onDelete}
              t={t}
            />
          </div>
        ))}
        <span className="px-1 text-slate-300">
          <i className="fa fa-arrow-right" aria-hidden="true" />
        </span>
        <button
          type="button"
          className="flex h-[80px] w-[100px] shrink-0 flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-xs font-semibold text-slate-400 hover:border-brand hover:text-brand-dark"
          onClick={() => onAddStep(wfKey)}
        >
          <i className="fa fa-plus mb-1" aria-hidden="true" />
          {t('workflow.add_step')}
        </button>
      </div>
    </div>
  );
}

export function AclWorkflowPanel({ portals = [], opdSteps = [], ipdSteps = [], emgSteps = [], plMap = {} }) {
  const { t } = useTranslation('access');
  const [tab, setTab] = useState('opd');
  const [dragging, setDragging] = useState(null);

  const dropOnStep = (wf, stepKey) => {
    if (!dragging) return;
    aclPost('assign_portal', { workflow: wf, step_key: stepKey, portal_code: dragging.code }).then((j) => {
      if (j.ok) window.location.reload();
      else notifyError(j.error || t('shared.failed'));
    });
  };

  const removePortal = (wf, stepKey, code) => {
    aclPost('unassign_portal', { workflow: wf, step_key: stepKey, portal_code: code }).then((j) => {
      if (j.ok) window.location.reload();
    });
  };

  const addStep = (wf) => {
    const label = window.prompt(t('workflow.step_name_ph'));
    if (!label) return;
    aclPost('add_step', { workflow: wf, step_label: label }).then((j) => {
      if (j.ok) window.location.reload();
      else notifyError(j.error || t('shared.failed'));
    });
  };

  const renameStep = (wf, key, cur) => {
    const label = window.prompt(t('workflow.rename_step_ph'), cur);
    if (!label) return;
    aclPost('rename_step', { workflow: wf, step_key: key, step_label: label }).then((j) => {
      if (j.ok) window.location.reload();
    });
  };

  const deleteStep = async (wf, key) => {
    const ok = await confirmModal({
      title: t('workflow.delete_step_title'),
      message: t('workflow.confirm_delete_step'),
      confirmLabel: t('shared.delete'),
      tone: 'danger'});
    if (!ok) return;
    aclPost('delete_step', { workflow: wf, step_key: key }).then((j) => {
      if (j.ok) window.location.reload();
    });
  };

  const flows = { opd: opdSteps, ipd: ipdSteps, emg: emgSteps };

  const wfTabs = [
    { id: 'opd', label: t('workflow.tab_opd'), icon: 'fa-hospital-o' },
    { id: 'ipd', label: t('workflow.tab_ipd'), icon: 'fa-bed' },
    { id: 'emg', label: t('workflow.tab_emg'), icon: 'fa-ambulance' },
  ];

  return (
    <>
      <p className="mb-4 text-sm text-slate-500">{t('workflow.intro')}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{t('workflow.drag_hint')}</span>
        {portals.map((p) => (
          <div
            key={p.code}
            draggable
            onDragStart={() => setDragging({ code: p.code, label: p.label })}
            onDragEnd={() => setDragging(null)}
            className="cursor-grab rounded-full bg-gradient-to-r from-brand to-brand-dark px-3 py-1 text-xs font-semibold text-white shadow"
          >
            <i className="fa fa-th-large mr-1" aria-hidden="true" />
            {p.label}
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex gap-2 border-b border-slate-100 bg-slate-50 p-2">
          {wfTabs.map((tabItem) => (
            <button
              key={tabItem.id}
              type="button"
              onClick={() => setTab(tabItem.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                tab === tabItem.id ? 'bg-brand-dark text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
              }`}
            >
              <i className={`fa ${tabItem.icon} mr-1`} aria-hidden="true" />
              {tabItem.label}
            </button>
          ))}
        </div>
        <WorkflowFlow
          wfKey={tab}
          steps={flows[tab] || []}
          plMap={plMap}
          onDrop={dropOnStep}
          onRemovePortal={removePortal}
          onRename={renameStep}
          onDelete={deleteStep}
          onAddStep={addStep}
          t={t}
        />
      </div>
    </>
  );
}
