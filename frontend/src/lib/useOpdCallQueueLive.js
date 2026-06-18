import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function wsBaseUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const q = window.location.search || '';
  return `${proto}//${window.location.host}/portal/call-queue/ws${q}`;
}

/**
 * Live OPD lobby board updates via WebSocket (falls back to HTTP polling when WS unavailable).
 */
export function useOpdCallQueueLive({ poll, pollMs, onPayload, onPatientCalled, t }) {
  const [transport, setTransport] = useState('connecting');
  const [lastUpdate, setLastUpdate] = useState(null);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const backoffRef = useRef(1000);
  const pollOnlyRef = useRef(false);

  const wsUrl = useMemo(() => wsBaseUrl(), []);

  const applyPayload = useCallback(
    (data) => {
      if (!data || !data.ok) return;
      onPayload(data);
      setLastUpdate(data.updatedAt || new Date().toISOString());
      if (transport !== 'polling') setTransport('live');
    },
    [onPayload, transport]
  );

  const connectWs = useCallback(() => {
    if (pollOnlyRef.current || typeof WebSocket === 'undefined') {
      setTransport('polling');
      return;
    }
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      setTransport('connecting');

      ws.onopen = () => {
        backoffRef.current = 1000;
        setTransport('live');
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type === 'queue_update') {
            applyPayload(data);
          } else if (data.type === 'patient_called' && onPatientCalled) {
            onPatientCalled(data);
            poll();
          } else if (data.type === 'error') {
            setTransport('polling');
          }
        } catch (_) {
          /* ignore malformed */
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (pollOnlyRef.current) return;
        setTransport('polling');
        const delay = Math.min(backoffRef.current, 15000);
        backoffRef.current = Math.min(backoffRef.current * 1.6, 15000);
        clearTimeout(reconnectRef.current);
        reconnectRef.current = setTimeout(connectWs, delay);
      };

      ws.onerror = () => {
        setTransport('polling');
      };
    } catch (_) {
      pollOnlyRef.current = true;
      setTransport('polling');
    }
  }, [applyPayload, wsUrl, onPatientCalled]);

  useEffect(() => {
    connectWs();
    return () => {
      pollOnlyRef.current = true;
      clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (_) {
          /* ignore */
        }
        wsRef.current = null;
      }
    };
  }, [connectWs]);

  useEffect(() => {
    if (transport === 'polling' || transport === 'connecting') {
      poll();
    }
    const id = setInterval(() => {
      if (transport !== 'live') poll();
    }, pollMs);
    const slowId = setInterval(() => {
      if (transport === 'live') poll();
    }, Math.max(pollMs * 4, 60000));
    return () => {
      clearInterval(id);
      clearInterval(slowId);
    };
  }, [poll, pollMs, transport]);

  const refreshHint = useMemo(() => {
    const time = lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : '';
    if (transport === 'live') {
      return time ? t('callQueue.updated_live', { time }) : t('callQueue.live_ws');
    }
    if (transport === 'connecting') {
      return t('callQueue.connecting');
    }
    return time ? t('callQueue.updated', { time }) : t('callQueue.polling');
  }, [transport, lastUpdate, t]);

  return { transport, refreshHint };
}
