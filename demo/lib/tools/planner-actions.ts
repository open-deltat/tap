"use server";

import { z } from "zod";
import { planDay, type DayPlan } from "./overlap";

// The planner runs its arithmetic here, on the server, because the SDK's root import also carries
// the Postgres driver, which cannot ship to a browser. No Δt write happens, so there is no gate.

const isZone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

const HHMM = z.string().length(5);
const Input = z.object({
  date: z.iso.date(),
  people: z
    .array(z.object({ zone: z.string().max(64).refine(isZone, "Unknown time zone"), from: HHMM, to: HHMM }))
    .min(1)
    .max(10),
});

export type PlanResult = { ok: true; plan: DayPlan } | { ok: false; message: string };

export async function plan(input: unknown): Promise<PlanResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the times and zones." };
  const { date, people } = parsed.data;
  const organiser = people[0].zone;
  try {
    return { ok: true, plan: planDay(date, organiser, people) };
  } catch (err) {
    // expandRecurrence explains what it refused (a malformed time, equal start and end).
    return { ok: false, message: err instanceof Error ? err.message : "Check the times." };
  }
}
