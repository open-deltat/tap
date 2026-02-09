"use server";

import { dt } from "@/lib/deltat";
import { AddRuleInput, RecurringRuleInput } from "@/lib/schemas";
import type { Rule } from "@open-tap/client";

export async function addRule(input: {
  resourceId: string;
  start: number;
  end: number;
  blocking: boolean;
}): Promise<Rule> {
  const parsed = AddRuleInput.parse(input);
  return dt.addRule({
    resourceId: parsed.resourceId,
    start: parsed.start,
    end: parsed.end,
    blocking: parsed.blocking,
  });
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
  const from = new Date(parsed.fromDate);
  const to = new Date(parsed.toDate);
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) {
    throw new Error("Invalid date range");
  }

  const [startH, startM] = parsed.startTime.split(":").map(Number);
  const [endH, endM] = parsed.endTime.split(":").map(Number);
  const rules: Rule[] = [];

  const d = new Date(from);
  while (d <= to) {
    if (parsed.daysOfWeek.includes(d.getDay())) {
      const dayStart = new Date(d);
      dayStart.setHours(startH, startM, 0, 0);
      const dayEnd = new Date(d);
      dayEnd.setHours(endH, endM, 0, 0);

      const startMs = dayStart.getTime();
      const endMs = dayEnd.getTime();
      if (endMs > startMs) {
        const rule = await dt.addRule({
          resourceId: parsed.resourceId,
          start: startMs,
          end: endMs,
          blocking: parsed.blocking,
        });
        rules.push(rule);
      }
    }
    d.setDate(d.getDate() + 1);
  }

  return rules;
}

export async function editRule(
  id: string,
  data: { start: number; end: number; blocking: boolean }
): Promise<void> {
  await dt.updateRule(id, data);
}

export async function deleteRule(id: string): Promise<void> {
  await dt.deleteRule(id);
}

export async function getRulesForResource(
  resourceId: string
): Promise<Rule[]> {
  return dt.getRules(resourceId);
}
