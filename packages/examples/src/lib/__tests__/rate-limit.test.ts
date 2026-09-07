import { test, expect } from "bun:test";
import { createRateLimiter } from "../rate-limit";

// Creation is the abuse surface on a public site: it is free to call and each call costs us a
// durable WAL record. The limiter is the only thing bounding that, so it is tested against an
// injected clock rather than real time.

function fixedClock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

test("allows exactly the configured number of calls inside one window", () => {
  const clock = fixedClock();
  const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: clock.now });
  for (let i = 0; i < 3; i++) {
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
  }
  expect(limiter.check("1.2.3.4").allowed).toBe(false);
});

test("reports how long the caller must wait", () => {
  const clock = fixedClock();
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: clock.now });
  limiter.check("1.2.3.4");
  clock.advance(20_000);
  const blocked = limiter.check("1.2.3.4");
  expect(blocked.allowed).toBe(false);
  expect(blocked.retryAfterMs).toBe(40_000);
});

test("the window reopens once it has fully elapsed", () => {
  const clock = fixedClock();
  const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: clock.now });
  expect(limiter.check("1.2.3.4").allowed).toBe(true);
  expect(limiter.check("1.2.3.4").allowed).toBe(true);
  expect(limiter.check("1.2.3.4").allowed).toBe(false);
  clock.advance(60_000);
  expect(limiter.check("1.2.3.4").allowed).toBe(true);
});

test("one caller's budget does not spend another's", () => {
  const clock = fixedClock();
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: clock.now });
  expect(limiter.check("1.2.3.4").allowed).toBe(true);
  expect(limiter.check("1.2.3.4").allowed).toBe(false);
  expect(limiter.check("5.6.7.8").allowed).toBe(true);
});

test("elapsed windows are pruned so a flood of distinct keys cannot grow the map forever", () => {
  // Without pruning, one key per forged address turns the limiter itself into the memory leak it
  // exists to prevent.
  const clock = fixedClock();
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: clock.now });
  for (let i = 0; i < 500; i++) limiter.check(`10.0.0.${i}`);
  expect(limiter.size()).toBe(500);
  clock.advance(60_001);
  limiter.check("10.1.0.1");
  expect(limiter.size()).toBe(1);
});
