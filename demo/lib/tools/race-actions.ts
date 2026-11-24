"use server";

import { dt } from "@open-deltat/examples/lib/deltat";
import { HALF_HOUR, gate, nextHalfHour, refusal, toolCalendar } from "./calendars";
import { timed, type Call } from "./trace";

export type Racer = "A" | "B";

export type RaceResult =
  | { readonly ok: true; readonly slot: { start: number; end: number }; readonly winner: Racer | null; readonly firstSent: Racer; readonly calls: readonly Call[] }
  | { readonly ok: false; readonly message: string };

const SEARCH_MS = 6 * 60 * 60_000;
// The winner's hold is released straight after the race; this only bounds it if that release fails.
const HOLD_TTL_MS = 15_000;

/**
 * Two bookers go for one slot. Both read it free, then both hold it, the two holds leaving this
 * server in the same tick on separate connections. Which one Δt orders first wins; the other gets
 * the refusal with alternatives. The order they are sent in is a coin toss, so neither side always
 * wins by being first in the code.
 */
export async function runRace(): Promise<RaceResult> {
  const g = await gate();
  if (!g.ok) return g;
  try {
    const resourceId = await toolCalendar("race");
    const now = Date.now();
    const free = await dt.availability.get({ resourceId, start: now, end: now + SEARCH_MS, minDuration: HALF_HOUR });
    // Every free half hour in the window, then one at random: two visitors racing in the same
    // seconds would otherwise both pick the first one and spoil each other's round.
    const earliest = nextHalfHour(now, HALF_HOUR);
    const candidates = free.flatMap((s) => {
      const first = Math.max(nextHalfHour(s.start), earliest);
      const count = Math.max(0, Math.floor((s.end - first) / HALF_HOUR));
      return Array.from({ length: count }, (_, i) => first + i * HALF_HOUR);
    });
    const start = candidates[Math.floor(Math.random() * candidates.length)];
    if (start === undefined) return { ok: false, message: "Every slot in the next six hours is taken right now. Try again in a moment." };
    const slot = { start, end: start + HALF_HOUR };

    const read = (who: Racer) =>
      timed({ who: `Booker ${who}`, kind: "find", name: "dt.availability.get", args: { resourceId, ...slot } }, () => dt.availability.get({ resourceId, ...slot }), refusal);
    const hold = (who: Racer) =>
      timed(
        { who: `Booker ${who}`, kind: "hold", name: "dt.holds.place", args: { resourceId, ...slot, expiresAt: "now + 15 s" } },
        () => dt.holds.place({ resourceId, ...slot, expiresAt: Date.now() + HOLD_TTL_MS }),
        refusal
      );

    const reads = await Promise.all([read("A"), read("B")]);
    const firstSent: Racer = Math.random() < 0.5 ? "A" : "B";
    const order: [Racer, Racer] = firstSent === "A" ? ["A", "B"] : ["B", "A"];
    const [first, second] = await Promise.all(order.map(hold));
    const holds = firstSent === "A" ? [first, second] : [second, first];

    const winnerIndex = holds.findIndex((h) => h.outcome.ok);
    const winner: Racer | null = winnerIndex === 0 ? "A" : winnerIndex === 1 ? "B" : null;
    const won = winnerIndex >= 0 ? holds[winnerIndex].outcome : null;
    const holdId = won?.ok && typeof won.reply === "object" && won.reply !== null && "id" in won.reply ? String(won.reply.id) : null;

    // Hold the minimum for the shortest time (PRINCIPLES.md 3): the race is decided, so let go.
    const release = holdId
      ? [await timed({ who: `Booker ${winner}`, kind: "release", name: "dt.holds.release", args: { holdId } }, () => dt.holds.release(holdId).then(() => null), refusal)]
      : [];

    return { ok: true, slot, winner, firstSent, calls: [...reads, ...holds, ...release] };
  } catch {
    return { ok: false, message: "Could not reach Δt just now. Try again in a moment." };
  }
}
