"use server";

import { dt } from "@/lib/deltat";
import { expandRecurrence } from "@open-tap/client";
import { AddRuleInput, RecurringRuleInput } from "@/lib/schemas";
import type { Rule } from "@open-tap/client";

export async function addRule(input: {
  resourceId: string;
  start: number;
  end: number;
  blocking: boolean;
}): Promise<Rule> {
  const parsed = AddRuleInput.parse(input);
  const [rule] = await dt.rules.create([{
    resourceId: parsed.resourceId,
    start: parsed.start,
    end: parsed.end,
    blocking: parsed.blocking,
  }]);
  return rule;
}

export async function addRecurringRules(input: {
  resourceId: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  fromDate: string;
  toDate: string;
  blocking: boolean;
}): Promise<Rule[]> {
  const parsed = RecurringRuleInput.parse(input);

  const segments = expandRecurrence({
    daysOfWeek: parsed.daysOfWeek,
    startTime: parsed.startTime,
    endTime: parsed.endTime,
    fromDate: parsed.fromDate,
    toDate: parsed.toDate,
    blocking: parsed.blocking,
  });

  if (segments.length === 0) return [];

  return dt.rules.create(
    segments.map((s) => ({
      resourceId: parsed.resourceId,
      start: s.start,
      end: s.end,
      blocking: s.blocking,
    }))
  );
}

// Replace a resource's whole weekly availability: drop every non-blocking (open-hours) rule, then
// expand the per-day ranges into fresh concrete rules. Blocking rules and bookings are left alone.
// This is the cal.com-style "save my weekly hours" operation, mapped onto deltat primitives.
export async function setWeeklyAvailability(input: {
  resourceId: string;
  ranges: { dow: number; startTime: string; endTime: string }[];
  fromDate: string;
  toDate: string;
}): Promise<number> {
  // Snapshot the open-hours rules we are about to replace.
  const stale = (await dt.rules.get(input.resourceId)).filter((x) => !x.blocking).map((x) => x.id);

  // Add the new open hours FIRST. If this fails partway, the resource keeps its old hours; the
  // worst case is duplicate open rules, which merge in availability and get cleaned on the next save.
  // (Deleting first would risk leaving the schedule empty on a mid-run failure.)
  const segments = input.ranges.flatMap((rg) =>
    expandRecurrence({
      daysOfWeek: [rg.dow],
      startTime: rg.startTime,
      endTime: rg.endTime,
      fromDate: input.fromDate,
      toDate: input.toDate,
      blocking: false,
    })
  );
  const created = segments.length
    ? await dt.rules.create(
        segments.map((s) => ({ resourceId: input.resourceId, start: s.start, end: s.end, blocking: s.blocking }))
      )
    : [];

  // Then remove exactly the rules we snapshotted — never the ones we just created.
  for (const id of stale) await dt.rules.delete(id);

  return created.length;
}

export async function editRule(
  id: string,
  data: { start: number; end: number; blocking: boolean }
): Promise<void> {
  await dt.rules.update(id, data);
}

export async function deleteRule(id: string): Promise<void> {
  await dt.rules.delete(id);
}

export async function getRulesForResource(
  resourceId: string
): Promise<Rule[]> {
  return dt.rules.get(resourceId);
}
