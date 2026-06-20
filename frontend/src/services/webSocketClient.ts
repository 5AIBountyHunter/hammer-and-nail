// @ts-nocheck
export type WebSocketConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

export interface WebSocketClientState {
  connectionState: WebSocketConnectionState;
  lastMessage: unknown | null;
  reconnectAttempt: number;
  queueSize: number;
  subscriptions: number;
  totalMessagesSent: number;
  totalMessagesReceived: number;
  errors: number;
  latencyMs: number | null;
}

export interface ReconnectDelayOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  random?: () => number;
}

export type WebSocketStateTransition =
  | { type: "connect" }
  | { type: "stable-open" }
  | { type: "unexpected-close"; nextAttempt: number }
  | { type: "disconnect" }
  | { type: "error" }
  | { type: "reconnect-exhausted" };

const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;
const DEFAULT_JITTER_MS = 1000;

export function calculateReconnectDelay(attempt: number, options: ReconnectDelayOptions = {}): number {
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
  const maxDelayMs = Math.max(0, options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS);
  const jitterMs = Math.max(0, options.jitterMs ?? DEFAULT_JITTER_MS);
  const random = options.random ?? Math.random;
  const exponentialDelay = baseDelayMs * Math.pow(2, Math.max(0, attempt));
  const jitter = random() * jitterMs;
  return Math.min(Math.round(exponentialDelay + jitter), maxDelayMs);
}

export function createInitialWebSocketState(): WebSocketClientState {
  return {
    connectionState: "disconnected",
    lastMessage: null,
    reconnectAttempt: 0,
    queueSize: 0,
    subscriptions: 0,
    totalMessagesSent: 0,
    totalMessagesReceived: 0,
    errors: 0,
    latencyMs: null,
  };
}

export function transitionWebSocketState(
  state: WebSocketClientState,
  transition: WebSocketStateTransition
): WebSocketClientState {
  switch (transition.type) {
    case "connect":
      return { ...state, connectionState: "connecting" };
    case "stable-open":
      return { ...state, connectionState: "connected", reconnectAttempt: 0 };
    case "unexpected-close":
      return { ...state, connectionState: "reconnecting", reconnectAttempt: transition.nextAttempt };
    case "disconnect":
      return { ...state, connectionState: "disconnected", reconnectAttempt: 0 };
    case "error":
      return { ...state, connectionState: "error", errors: state.errors + 1 };
    case "reconnect-exhausted":
      return { ...state, connectionState: "disconnected" };
  }
}

export function createWebSocketClient(url: string, options: ReconnectDelayOptions = {}) {
  let ws: WebSocket | null = null;
  let state = createInitialWebSocketState();
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stableTimer: ReturnType<typeof setTimeout> | null = null;
  let listeners: Array<(msg: any) => void> = [];

  function notifyStateChange() {
    listeners.forEach((fn) => fn({ type: "__state", state: state }));
  }

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    state = transitionWebSocketState(state, { type: "connect" });
    notifyStateChange();
    ws = new WebSocket(url);
    ws.onopen = () => {
      state = transitionWebSocketState(state, { type: "stable-open" });
      notifyStateChange();
      if (stableTimer) clearTimeout(stableTimer);
      stableTimer = setTimeout(() => {
        state = { ...state, reconnectAttempt: 0 };
      }, 30000);
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        state = { ...state, lastMessage: msg, totalMessagesReceived: state.totalMessagesReceived + 1 };
        listeners.forEach((fn) => fn(msg));
      } catch {}
    };
    ws.onclose = () => {
      const nextAttempt = state.reconnectAttempt + 1;
      state = transitionWebSocketState(state, { type: "unexpected-close", nextAttempt });
      notifyStateChange();
      const delay = calculateReconnectDelay(nextAttempt, options);
      reconnectTimer = setTimeout(() => connect(), delay);
    };
    ws.onerror = () => {
      state = transitionWebSocketState(state, { type: "error" });
      notifyStateChange();
      ws?.close();
    };
  }

  function disconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (stableTimer) clearTimeout(stableTimer);
    if (ws) { ws.onclose = null; ws.close(); ws = null; }
    state = transitionWebSocketState(state, { type: "disconnect" });
    notifyStateChange();
  }

  function subscribe(fn: (msg: any) => void) {
    listeners.push(fn);
    return () => { listeners = listeners.filter((l) => l !== fn); };
  }

  function getState() { return state; }

  return { connect, disconnect, subscribe, getState };
}
