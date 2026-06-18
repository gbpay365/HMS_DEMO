'use strict';

const { URL } = require('url');
const signature = require('cookie-signature');
const { buildCallQueueApiPayload } = require('./opdCallQueue');

let WebSocketServer = null;
try {
  WebSocketServer = require('ws').WebSocketServer;
} catch (_) {
  WebSocketServer = null;
}

const WS_PATH = '/portal/call-queue/ws';
const DEBOUNCE_MS = 120;

/** @type {{ pool: *, sessionSecret: string, sessionStore: * }} */
let cfg = { pool: null, sessionSecret: '', sessionStore: null };
/** @type {import('ws').WebSocketServer | null} */
let wss = null;
let flushTimer = null;
let attached = false;

function configure(opts) {
  if (opts.pool) cfg.pool = opts.pool;
  if (opts.sessionSecret) cfg.sessionSecret = String(opts.sessionSecret);
  if (opts.sessionStore !== undefined) cfg.sessionStore = opts.sessionStore;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(val);
    } catch (_) {
      out[key] = val;
    }
  }
  return out;
}

function sessionIdFromCookie(cookieHeader) {
  const cookies = parseCookies(cookieHeader);
  const raw = cookies['connect.sid'];
  if (!raw) return null;
  if (raw.startsWith('s:')) {
    const unsigned = signature.unsign(raw.slice(2), cfg.sessionSecret);
    return unsigned === false ? null : unsigned;
  }
  return raw;
}

function loadSession(sessionId) {
  return new Promise((resolve) => {
    if (!sessionId || !cfg.sessionStore || typeof cfg.sessionStore.get !== 'function') {
      resolve(null);
      return;
    }
    cfg.sessionStore.get(sessionId, (err, sess) => {
      if (err) {
        resolve(null);
        return;
      }
      resolve(sess || null);
    });
  });
}

async function isLobbyDisplaySession(request) {
  const sid = sessionIdFromCookie(request.headers.cookie);
  if (!sid) return false;
  const sess = await loadSession(sid);
  return !!(sess && sess.callQueueDisplay);
}

function parseWsFilters(request) {
  try {
    const host = request.headers.host || 'localhost';
    const url = new URL(request.url || WS_PATH, `http://${host}`);
    return {
      doctorId: parseInt(url.searchParams.get('doctor_id'), 10) || 0,
      roomId: parseInt(url.searchParams.get('room_id'), 10) || 0,
    };
  } catch (_) {
    return { doctorId: 0, roomId: 0 };
  }
}

async function payloadForFilters(filters) {
  if (!cfg.pool) return { ok: false, error: 'no_pool' };
  return buildCallQueueApiPayload(cfg.pool, {
    doctorId: filters.doctorId || 0,
    roomId: filters.roomId || 0,
  });
}

async function flushBroadcast() {
  flushTimer = null;
  if (!wss || !cfg.pool) return;
  const clients = [...wss.clients];
  await Promise.all(
    clients.map(async (ws) => {
      if (ws.readyState !== 1) return;
      try {
        const payload = await payloadForFilters(ws._cqFilters || {});
        ws.send(JSON.stringify({ type: 'queue_update', ...payload }));
      } catch (e) {
        try {
          ws.send(JSON.stringify({ type: 'error', error: e.message || 'broadcast_failed' }));
        } catch (_) {
          /* closed */
        }
      }
    })
  );
}

function notifyOpdQueueChanged() {
  if (!wss || !cfg.pool) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushBroadcast().catch((e) => console.warn('[opdCallQueueLive] broadcast:', e.message));
  }, DEBOUNCE_MS);
}

function clientMatchesCall(ws, event) {
  const f = ws._cqFilters || {};
  const docF = parseInt(f.doctorId, 10) || 0;
  const roomF = parseInt(f.roomId, 10) || 0;
  const evDoc = parseInt(event.doctorId, 10) || 0;
  const evRoom = parseInt(event.roomId, 10) || 0;
  if (docF && evDoc && docF !== evDoc) return false;
  if (roomF && evRoom && roomF !== evRoom) return false;
  return true;
}

/**
 * Immediate patient-called event (chime/TTS on lobby boards). Also refreshes queue shortly after.
 */
function broadcastPatientCalled(event) {
  if (!wss || !event) return;
  const payload = JSON.stringify({ ...event, type: 'patient_called' });
  for (const ws of wss.clients) {
    if (ws.readyState !== 1) continue;
    if (!clientMatchesCall(ws, event)) continue;
    try {
      ws.send(payload);
    } catch (_) {
      /* closed */
    }
  }
  notifyOpdQueueChanged();
}

function attachWebSocket(httpServer) {
  if (!WebSocketServer || !httpServer || attached) return false;
  attached = true;

  wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const path = (request.url || '').split('?')[0];
    if (path !== WS_PATH) {
      socket.destroy();
      return;
    }

    isLobbyDisplaySession(request)
      .then((ok) => {
        if (!ok) {
          socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
          socket.destroy();
          return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      })
      .catch(() => {
        socket.destroy();
      });
  });

  wss.on('connection', async (ws, request) => {
    ws._cqFilters = parseWsFilters(request);
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    try {
      const payload = await payloadForFilters(ws._cqFilters);
      ws.send(JSON.stringify({ type: 'queue_update', ...payload }));
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', error: e.message || 'load_failed' }));
    }
  });

  const heartbeat = setInterval(() => {
    if (!wss) return;
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch (_) {
        /* ignore */
      }
    }
  }, 30000);

  wss.on('close', () => clearInterval(heartbeat));

  console.log('[opdCallQueueLive] WebSocket attached at', WS_PATH);
  return true;
}

function isWebSocketEnabled() {
  return !!WebSocketServer && attached;
}

function getClientCount() {
  return wss ? wss.clients.size : 0;
}

module.exports = {
  WS_PATH,
  configure,
  attachWebSocket,
  notifyOpdQueueChanged,
  broadcastPatientCalled,
  isWebSocketEnabled,
  getClientCount,
};
