"use server";

import { z } from "zod";
import { dt } from "@open-deltat/examples/lib/deltat";
import { HALF_HOUR, forgetCalendar, forgetIfMissing, forgetLater, gate, nextHalfHour, refusal, toolCalendar } from "./calendars";
import { timed, type Call } from "./trace";

// The API console's four calls, each the SDK method a developer would write, run on the console's own
// calendar in the demo tenant. Stateless: the browser carries the slot and the hold id between steps,
// and every id it sends back is checked against this calendar before anything is done with it.

const WINDOW_MS = 4 * 60 * 60_000;
const HOLD_TTL_MS = 60_000;

const Step = z.discriminatedUnion("step", [
  z.object({ step: z.literal("find") }),
  z.object({ step: z.literal("hold"), start: z.number().int(), who: z.enum(["you", "someone-else"]) }),
  z.object({ step: z.literal("commit"), holdId: z.string().min(1).max(64) }),
  z.object({ step: z.literal("release"), holdId: z.string().min(1).max(64) }),
]);

export type ConsoleResult = { ok: true; call: Call } | { ok: false; message: string };

export async function consoleStep(input: unknown): Promise<ConsoleResult> {
  const parsed = Step.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That step is not one the console knows." };
  const g = await gate();
  if (!g.ok) return g;
  try {
    const resourceId = await toolCalendar("console");
    const s = parsed.data;
    const who = (w: "you" | "someone-else") => (w === "you" ? "You" : "Someone else");

    if (s.step === "find") {
      const now = Date.now();
      const args = { resourceId, start: nextHalfHour(now), end: nextHalfHour(now) + WINDOW_MS, minDuration: HALF_HOUR };
      const call = await timed({ who: "You", kind: "find", name: "dt.availability.get", args }, () => dt.availability.get(args), refusal);
      forgetIfMissing("console", call.outcome.ok ? [] : [call.outcome.code]);
      return { ok: true, call };
    }

    if (s.step === "hold") {
      // Only a future half-hour boundary inside the next window: the console books on its own
      // calendar, and an arbitrary or already-started span from the browser has no business there.
      const now = Date.now();
      if (s.start % HALF_HOUR !== 0 || s.start < now || s.start > now + WINDOW_MS + HALF_HOUR) {
        return { ok: false, message: "That time has passed or was not found. Run find again, then hold one of the times it returned." };
      }
      const args = { resourceId, start: s.start, end: s.start + HALF_HOUR, expiresAt: Date.now() + HOLD_TTL_MS };
      const call = await timed({ who: who(s.who), kind: "hold", name: "dt.holds.place", args }, () => dt.holds.place(args), refusal);
      forgetIfMissing("console", call.outcome.ok ? [] : [call.outcome.code]);
      // "Someone else" exists to show the refusal. If it got the slot instead (the visitor's own hold
      // had run out), nobody owns that hold, so give it straight back rather than block the time.
      const reply = call.outcome.reply;
      if (s.who === "someone-else" && call.outcome.ok && typeof reply === "object" && reply !== null && "id" in reply) {
        await dt.holds.release(String(reply.id));
      }
      return { ok: true, call };
    }

    const held = (await dt.holds.get(resourceId)).find((h) => h.id === s.holdId);
    if (!held) {
      return {
        ok: true,
        call: { who: "You", kind: s.step === "commit" ? "commit" : "release", name: s.step === "commit" ? "dt.holds.commit" : "dt.holds.release", args: { holdId: s.holdId }, ms: 0, outcome: { ok: false, code: "EXPIRED", reply: { code: "EXPIRED", message: "This hold is gone: it expired or was already used. Hold again." } } },
      };
    }

    if (s.step === "commit") {
      const call = await timed({ who: "You", kind: "commit", name: "dt.holds.commit", args: { holdId: s.holdId } }, () => dt.holds.commit(s.holdId), refusal);
      if (call.outcome.ok) {
        const reply = call.outcome.reply;
        const bookingId = typeof reply === "object" && reply !== null && "bookingId" in reply ? String(reply.bookingId) : null;
        if (bookingId) forgetLater([{ id: bookingId, resourceId, start: held.start, end: held.end, label: null }]);
      }
      return { ok: true, call };
    }

    return {
      ok: true,
      call: await timed({ who: "You", kind: "release", name: "dt.holds.release", args: { holdId: s.holdId } }, () => dt.holds.release(s.holdId).then(() => null), refusal),
    };
  } catch {
    forgetCalendar("console");
    return { ok: false, message: "Could not reach Δt just now. Try again in a moment." };
  }
}
