// A fixed-window counter, keyed by caller. Creating a bookable is free to ask for and costs us a
// durable WAL record plus a registry slot, so this is what stands between the public form and a
// script. Deliberately in-process: it resets on redeploy and does not span instances, which is
// honest for a single-container deploy and must be revisited before scaling out.

export interface RateLimitVerdict {
  readonly allowed: boolean;
  /** Milliseconds until the caller's window reopens. Zero when allowed. */
  readonly retryAfterMs: number;
}

export interface RateLimiter {
  check(key: string): RateLimitVerdict;
  /** Live window count. Exists so the pruning behaviour is testable rather than assumed. */
  size(): number;
}

interface Window {
  start: number;
  count: number;
}

export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const { limit, windowMs } = opts;
  const now = opts.now ?? Date.now;
  const windows = new Map<string, Window>();

  // Pruning on every check keeps the map proportional to callers seen in one window rather than to
  // every address ever seen. It is O(live windows) per call, which is the right trade while that
  // number is in the hundreds; a fixed sweep interval is the fix if it ever is not.
  const prune = (at: number): void => {
    for (const [key, window] of windows) {
      if (at - window.start >= windowMs) windows.delete(key);
    }
  };

  return {
    check(key: string): RateLimitVerdict {
      const at = now();
      prune(at);

      const window = windows.get(key);
      if (!window) {
        windows.set(key, { start: at, count: 1 });
        return { allowed: true, retryAfterMs: 0 };
      }
      if (window.count < limit) {
        window.count += 1;
        return { allowed: true, retryAfterMs: 0 };
      }
      return { allowed: false, retryAfterMs: window.start + windowMs - at };
    },

    size(): number {
      return windows.size;
    },
  };
}
