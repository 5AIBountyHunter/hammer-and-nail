import { calculateBackoff } from "../services/WebSocketClient";

describe("calculateBackoff", () => {
  it("returns initial backoff for attempt 0", () => {
    const result = calculateBackoff(0);
    expect(result).toBeGreaterThanOrEqual(800);
    expect(result).toBeLessThanOrEqual(1200);
  });

  it("increases exponentially each attempt", () => {
    const a1 = calculateBackoff(1);
    const a2 = calculateBackoff(2);
    expect(a2).toBeGreaterThan(a1 * 1.5);
  });

  it("never exceeds MAX_BACKOFF at high attempts", () => {
    for (let i = 0; i < 20; i++) {
      expect(calculateBackoff(i)).toBeLessThanOrEqual(35000);
    }
  });

  it("includes random jitter", () => {
    const results = new Set<number>();
    for (let i = 0; i < 100; i++) {
      results.add(Math.floor(calculateBackoff(0)));
    }
    expect(results.size).toBeGreaterThan(5);
  });
});
