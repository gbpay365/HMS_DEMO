import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOpdCallQueueLive } from '../lib/useOpdCallQueueLive';
import { announcePatientCalled, unlockCallQueueAudio } from '../lib/opdCallQueueAudio';

const QUEUE_VISIBLE_SLOTS = 8;

function dashIfEmpty(val) {
  const s = String(val || '').trim();
  return s && s !== '—' ? s : '—';
}

function normalizeStatus(row) {
  return String(row?.queue_status_raw || row?.queue_status || '')
    .trim()
    .replace(/ /g, '_');
}

function waitMinutesSince(row) {
  const iso = row?.wait_start_iso || row?.queue_started_at;
  if (!iso) return null;
  const s = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  if (!/T|:\d{2}/.test(s)) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins > 480) return null;
  return mins;
}

function patientFullName(row) {
  const f = String(row.first_name || '').trim();
  const l = String(row.last_name || '').trim();
  if (f || l) return [f, l].filter(Boolean).join(' ');
  const full = String(row.full_name || '').trim();
  if (full) return full;
  return String(row.display_name || '').trim() || 'Patient';
}

function formatRoomLabel(row, t) {
  const room = dashIfEmpty(row.consultation_room);
  if (room === '—') return t('callQueue.room_unassigned');
  const no = row.room_queue_no;
  if (no) return `${room}`.replace(/\s*#\d+$/, '').trim() || room;
  return room;
}

function doctorDisplayName(row) {
  const seeing = dashIfEmpty(row.seeing_doctor);
  const assigned = dashIfEmpty(row.assigned_doctor);
  if (normalizeStatus(row) === 'in_consultation' && seeing !== '—') return seeing;
  return assigned;
}

function doctorPhotoUrl(row) {
  const path = String(row.assigned_doctor_photo || '').trim();
  if (!path) return null;
  return `/uploads/${path.replace(/^\/+/, '')}`;
}

function doctorInitials(name) {
  const parts = String(name || '')
    .replace(/^Dr\.?\s*/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

function BoardHeader({ title, subtitle, clock, refreshHint, transport }) {
  const dotClass =
    transport === 'live'
      ? 'cq-board__status-dot--live'
      : transport === 'connecting'
        ? 'cq-board__status-dot--connecting'
        : 'cq-board__status-dot--poll';

  return (
    <header className="cq-board__header">
      <div>
        <h1 className="cq-board__title">{title}</h1>
        {subtitle ? <p className="cq-board__subtitle">{subtitle}</p> : null}
      </div>
      <div className="text-right">
        <div className="cq-board__clock">{clock}</div>
        <div className="cq-board__status">
          <span className={`cq-board__status-dot ${dotClass}`} aria-hidden="true" />
          <span>{refreshHint}</span>
        </div>
      </div>
    </header>
  );
}

function QueueTableHeader({ t }) {
  return (
    <div className="cq-table__head" role="row">
      <div className="cq-table__th cq-table__th--patient" role="columnheader">
        <i className="fa fa-user" aria-hidden="true" />
        <span>{t('callQueue.col_patient')}</span>
      </div>
      <div className="cq-table__th cq-table__th--wait" role="columnheader">
        <i className="fa fa-clock-o" aria-hidden="true" />
        <span>{t('callQueue.col_wait_time')}</span>
      </div>
      <div className="cq-table__th cq-table__th--room" role="columnheader">
        <i className="fa fa-home" aria-hidden="true" />
        <span>{t('callQueue.col_room_no')}</span>
      </div>
      <div className="cq-table__th cq-table__th--doctor" role="columnheader">
        <i className="fa fa-user-md" aria-hidden="true" />
        <span>{t('callQueue.col_doctor')}</span>
      </div>
    </div>
  );
}

function QueueTableRow({ row, variant, waitLabel, t }) {
  const doctorName = doctorDisplayName(row);
  const photoUrl = doctorPhotoUrl(row);
  const patientName = patientFullName(row);

  return (
    <div className={`cq-table__row cq-table__row--${variant}`} role="row">
      <div className="cq-table__td cq-table__td--patient" role="cell">
        <div className="cq-table__patient-line">
          <span className="cq-table__queue-no">
            {t('callQueue.queue_no', { n: row.arrival_no || '—' })}
          </span>
          <span className="cq-table__patient-name">{patientName}</span>
        </div>
      </div>
      <div className="cq-table__td cq-table__td--wait" role="cell">
        <span className="cq-table__wait-label">{waitLabel}</span>
      </div>
      <div className="cq-table__td cq-table__td--room" role="cell">
        <span className="cq-table__room-label">{formatRoomLabel(row, t)}</span>
      </div>
      <div className="cq-table__td cq-table__td--doctor" role="cell">
        <span className="cq-table__doctor-wrap">
          <span className="cq-table__doctor-photo" aria-hidden="true">
            {photoUrl ? (
              <img src={photoUrl} alt="" />
            ) : (
              <span className="cq-table__doctor-initials">{doctorInitials(doctorName)}</span>
            )}
          </span>
          <span className="cq-table__doctor-name">{doctorName}</span>
        </span>
      </div>
    </div>
  );
}

function FocusServingCard({ row, label, t, large }) {
  if (!row) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-600/50 bg-slate-900/40 p-8 text-center">
        <i className="fa fa-hourglass-half mb-3 text-5xl text-slate-600" aria-hidden="true" />
        <p className="text-xl font-bold text-slate-500">{t('callQueue.focus_empty')}</p>
      </div>
    );
  }
  const room =
    dashIfEmpty(row.consultation_room) === '—'
      ? t('callQueue.room_unassigned')
      : row.consultation_room;
  return (
    <div className="cq-focus-serving flex flex-1 flex-col items-center justify-center rounded-2xl px-6 py-8 text-center">
      <div className="mb-2 text-sm font-extrabold uppercase tracking-[0.2em] text-emerald-400">{label}</div>
      <div className={`font-black leading-tight text-white ${large ? 'text-5xl md:text-7xl' : 'text-3xl md:text-4xl'}`}>
        {row.display_name}
      </div>
      <div className="mt-3 font-mono text-2xl font-bold text-emerald-400 md:text-3xl">{row.ticket_number}</div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-lg text-slate-300">
        <span>
          <i className="fa fa-user-md mr-1 text-emerald-400" />
          {dashIfEmpty(row.assigned_doctor)}
        </span>
        <span>
          <i className="fa fa-door-open mr-1 text-emerald-400" />
          {room}
        </span>
      </div>
    </div>
  );
}

function resolveRowVariant(row, nextVisitId) {
  const st = normalizeStatus(row);
  if (st === 'in_consultation') return 'now';
  if (nextVisitId && row.visit_id === nextVisitId) return 'next';
  return 'waiting';
}

function resolveWaitLabel(row, variant, t) {
  if (variant === 'now') return t('callQueue.wait_now');
  if (variant === 'next') return t('callQueue.wait_next');
  const mins = waitMinutesSince(row);
  if (mins == null || mins < 1) return t('callQueue.waiting');
  return t('callQueue.wait_minutes', { minutes: mins });
}

export function CallQueueBoardApp({
  boardRows = [],
  highlightIndex = 0,
  title,
  simpleMode = false,
  focusMode = false,
  pollSeconds = 12,
  displayConfig = {}}) {
  const { t, i18n } = useTranslation('clinical');
  const displayTitle =
    title ||
    (focusMode
      ? t('callQueue.focus_title')
      : simpleMode
        ? t('callQueue.waiting_title')
        : t('callQueue.default_title'));
  const [rows, setRows] = useState(boardRows);
  const [clock, setClock] = useState('');
  const [calledFlash, setCalledFlash] = useState(null);
  const [tick, setTick] = useState(0);
  const lastCalledRef = useRef(0);
  const pollMs = Math.max(5, parseInt(pollSeconds, 10) || 12) * 1000;
  const audioOpts = useMemo(
    () => ({
      chimeEnabled: displayConfig.chimeEnabled !== false,
      ttsEnabled: displayConfig.ttsEnabled !== false}),
    [displayConfig.chimeEnabled, displayConfig.ttsEnabled]
  );

  const pollUrl = useMemo(() => {
    const q = new URLSearchParams(window.location.search || '');
    const suffix = q.toString() ? `?${q.toString()}` : '';
    return `/portal/call-queue/data.json${suffix}`;
  }, []);

  const poll = useCallback(() => {
    fetch(pollUrl, { credentials: 'same-origin' })
      .then((r) => {
        if (r.status === 401) {
          window.location.href = '/portal/call-queue/enter' + (window.location.search || '');
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (!data || !data.ok) return;
        setRows(data.visits || []);
      })
      .catch(() => {});
  }, [pollUrl]);

  const onWsPayload = useCallback((data) => {
    setRows(data.visits || []);
  }, []);

  const onPatientCalled = useCallback(
    (event) => {
      const vid = parseInt(event.visitId, 10) || 0;
      if (vid && vid === lastCalledRef.current) return;
      lastCalledRef.current = vid;
      setCalledFlash(event);
      announcePatientCalled(event, audioOpts);
      setTimeout(() => setCalledFlash(null), 12000);
    },
    [audioOpts]
  );

  const { refreshHint, transport } = useOpdCallQueueLive({
    poll,
    pollMs,
    onPayload: onWsPayload,
    onPatientCalled,
    t});

  useEffect(() => {
    const unlock = () => unlockCallQueueAudio();
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  useEffect(() => {
    setRows(boardRows);
  }, [boardRows]);

  useEffect(() => {
    const locale = (i18n.language || 'en').startsWith('fr') ? 'fr-FR' : undefined;
    const tickClock = () =>
      setClock(
        new Date().toLocaleString(locale, {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'})
      );
    tickClock();
    const t1 = setInterval(tickClock, 1000);
    return () => clearInterval(t1);
  }, [i18n.language]);

  useEffect(() => {
    const tWait = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(tWait);
  }, []);

  const visibleRows = rows.slice(0, QUEUE_VISIBLE_SLOTS);
  const overflowCount = Math.max(0, rows.length - QUEUE_VISIBLE_SLOTS);
  const hasPatients = rows.length > 0;

  const nextVisitId = useMemo(() => {
    const next = rows.find((r) => normalizeStatus(r) !== 'in_consultation');
    return next?.visit_id || null;
  }, [rows]);

  const tableRows = useMemo(
    () =>
      visibleRows.map((row) => {
        const variant = resolveRowVariant(row, nextVisitId);
        return {
          row,
          variant,
          waitLabel: resolveWaitLabel(row, variant, t),
          key: row.visit_id || `q-${row.arrival_no}-${row.full_name || row.display_name}`};
      }),
    [visibleRows, nextVisitId, t, tick]
  );

  const servingRow = useMemo(() => {
    const raw = rows.find((r) => normalizeStatus(r) === 'in_consultation');
    if (raw) return raw;
    if (calledFlash) {
      return {
        display_name: calledFlash.displayName,
        ticket_number: calledFlash.ticketNumber,
        assigned_doctor: calledFlash.doctorName,
        consultation_room: calledFlash.roomLabel,
        queue_status: 'in consultation'};
    }
    return rows[highlightIndex] || rows[0] || null;
  }, [rows, highlightIndex, calledFlash]);

  const upNextRows = useMemo(() => {
    const servingId = servingRow?.visit_id;
    return rows
      .filter((r) => {
        const st = normalizeStatus(r);
        return st !== 'in_consultation' && r.visit_id !== servingId;
      })
      .slice(0, 3);
  }, [rows, servingRow]);

  if (focusMode) {
    return (
      <div className="cq-board cq-focus flex h-screen flex-col">
        <BoardHeader
          title={displayTitle}
          subtitle={t('callQueue.focus_subtitle')}
          clock={clock}
          refreshHint={refreshHint}
          transport={transport}
        />
        <main className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
          <FocusServingCard
            row={servingRow}
            label={t('callQueue.now_serving')}
            t={t}
            large
          />
          {upNextRows.length ? (
            <div className="shrink-0">
              <h2 className="mb-2 text-xs font-extrabold uppercase tracking-widest text-slate-500">
                {t('callQueue.up_next')}
              </h2>
              <div className="grid gap-2 md:grid-cols-3">
                {upNextRows.map((r, i) => (
                  <div key={r.visit_id || i} className="cq-focus-up-next">
                    <div className="font-bold text-slate-100">{r.display_name}</div>
                    <div className="text-xs text-slate-400">{r.ticket_number}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </main>
        <footer className="cq-board__footer">
          ZAIZENS · {t('callQueue.footer_in_queue', { count: rows.length })}
        </footer>
      </div>
    );
  }

  return (
    <div className="cq-board cq-board--table flex h-screen flex-col">
      <BoardHeader
        title={displayTitle}
        subtitle={t('callQueue.subtitle')}
        clock={clock}
        refreshHint={refreshHint}
        transport={transport}
      />

      <main className="cq-table flex min-h-0 flex-1 flex-col px-3 py-3 md:px-5 md:py-4">
        <QueueTableHeader t={t} />

        <div className="cq-table__body flex min-h-0 flex-1 flex-col" role="table" aria-label={t('callQueue.waiting_queue')}>
          {!hasPatients ? (
            <div className="cq-table__empty flex flex-1 items-center justify-center p-12 text-center">
              <div>
                <i className="fa fa-check-circle mb-3 text-5xl text-slate-500" aria-hidden="true" />
                <p className="text-2xl font-bold text-white">{t('callQueue.empty_title')}</p>
                <p className="mt-2 text-base text-slate-400">{t('callQueue.empty_hint')}</p>
              </div>
            </div>
          ) : (
            tableRows.map((item) => (
              <QueueTableRow
                key={item.key}
                row={item.row}
                variant={item.variant}
                waitLabel={item.waitLabel}
                t={t}
              />
            ))
          )}
        </div>

        {overflowCount > 0 ? (
          <p className="cq-table__overflow mt-2 shrink-0 text-center text-sm font-semibold text-slate-300">
            <i className="fa fa-users mr-1" aria-hidden="true" />
            {t('callQueue.more_waiting', { count: overflowCount })}
          </p>
        ) : null}
      </main>

      <footer className="cq-board__footer">
        ZAIZENS · {t('callQueue.footer_in_queue', { count: rows.length })}
      </footer>
    </div>
  );
}
