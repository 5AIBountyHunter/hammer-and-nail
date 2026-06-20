import { useCallback, useEffect, useRef, useState } from "react";

export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

export interface WebSocketMessage {
  type: string;
  data: unknown;
}

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const JITTER_FACTOR = 0.2;

export function calculateBackoff(attempt: number): number {
  const exponential = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
  const jitter = exponential * JITTER_FACTOR * Math.random();
  return Math.min(exponential + jitter, MAX_BACKOFF_MS);
}

export function createWebSocketClient(url: string) {
  let ws: WebSocket | null = null;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stableTimer: ReturnType<typeof setTimeout> | null = null;
  let listeners: Array<(msg: WebSocketMessage) => void> = [];

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    ws = new WebSocket(url);
    ws.onopen = () => {
      reconnectAttempt = 0;
      if (stableTimer) clearTimeout(stableTimer);
      stableTimer = setTimeout(() => { reconnectAttempt = 0; }, 30000);
    };
    ws.onmessage = (event) => {
      try { const msg = JSON.parse(event.data) as WebSocketMessage; listeners.forEach((fn) => fn(msg)); } catch {}
    };
    ws.onclose = () => { scheduleReconnect(); };
    ws.onerror = () => { ws?.close(); };
  }

  function scheduleReconnect() {
    const delay = calculateBackoff(reconnectAttempt);
    reconnectAttempt++;
    reconnectTimer = setTimeout(() => { connect(); }, delay);
  }

  function disconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (stableTimer) clearTimeout(stableTimer);
    if (ws) { ws.onclose = null; ws.close(); ws = null; }
    reconnectAttempt = 0;
  }

  function subscribe(fn: (msg: WebSocketMessage) => void) {
    listeners.push(fn);
    return () => { listeners = listeners.filter((l) => l !== fn); };
  }

  return { connect, disconnect, subscribe };
}

export function useWebSocket(url: string | null) {
  const [state, setState] = useState<ConnectionState>("disconnected");

  useEffect(() => {
    if (!url) return;
    const ws = new WebSocket(url);
    setState("connecting");

    ws.onopen = () => {
      setState("connected");
      ws.onclose = () => setState("reconnecting");
    };
    ws.onerror = () => { ws.close(); };

    const client = createWebSocketClient(url);
    client.connect();
    const unsub = client.subscribe(() => {});

    return () => {
      client.disconnect();
      unsub();
    };
  }, [url]);

  return { state };
}
