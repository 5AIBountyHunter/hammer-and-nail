import { calculateReconnectDelay, createInitialWebSocketState, transitionWebSocketState } from "../services/webSocketClient";

describe("calculateReconnectDelay", () => {
  it("returns default base delay for attempt 0", () => {
    const result = calculateReconnectDelay(0);
    expect(result).toBeGreaterThanOrEqual(800);
    expect(result).toBeLessThanOrEqual(2000);
  });

  it("increases exponentially", () => {
    const a1 = calculateReconnectDelay(1);
    const a2 = calculateReconnectDelay(2);
    expect(a2).toBeGreaterThan(a1 * 1.5);
  });

  it("caps at max delay for high attempts", () => {
    for (let i = 5; i < 20; i++) {
      expect(calculateReconnectDelay(i)).toBeLessThanOrEqual(31000);
    }
  });

  it("includes random jitter", () => {
    const results = new Set<number>();
    for (let i = 0; i < 50; i++) {
      results.add(Math.floor(calculateReconnectDelay(0)));
    }
    expect(results.size).toBeGreaterThan(3);
  });
});

describe("createInitialWebSocketState", () => {
  it("returns disconnected state", () => {
    const state = createInitialWebSocketState();
    expect(state.connectionState).toBe("disconnected");
    expect(state.reconnectAttempt).toBe(0);
  });
});

describe("transitionWebSocketState", () => {
  it("transitions to connecting on connect", () => {
    const state = createInitialWebSocketState();
    const next = transitionWebSocketState(state, { type: "connect" });
    expect(next.connectionState).toBe("connecting");
  });

  it("transitions to connected on stable-open", () => {
    const state = createInitialWebSocketState();
    const connecting = transitionWebSocketState(state, { type: "connect" });
    const connected = transitionWebSocketState(connecting, { type: "stable-open" });
    expect(connected.connectionState).toBe("connected");
    expect(connected.reconnectAttempt).toBe(0);
  });
});
