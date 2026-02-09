"use server";

import * as db from "@/lib/db";
import * as store from "@/lib/store";
import { AddRuleInput, RecurringRuleInput, type Rule } from "@/lib/schemas";

export async function addRule(input: {
  resourceId: string;
  start: number;
  end: number;
  blocking: boolean;
}): Promise<Rule> {
  const parsed = AddRuleInput.parse(input);
  const id = await db.addRule(
    parsed.resourceId,
    parsed.start,
    parsed.end,
    parsed.blocking
  );
  const rule: Rule = {
    id,
    resourceId: parsed.resourceId,
    start: parsed.start,
    end: parsed.end,
    blocking: parsed.blocking,
  };
  store.setRule(rule);
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
        const id = await db.addRule(
          parsed.resourceId,
          startMs,
          endMs,
          parsed.blocking
        );
        const rule: Rule = {
          id,
          resourceId: parsed.resourceId,
          start: startMs,
          end: endMs,
          blocking: parsed.blocking,
        };
        store.setRule(rule);
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
): Promise<Rule> {
  const existing = store.getRules().find((r) => r.id === id);
  if (!existing) throw new Error("Rule not found");

  await db.deleteRule(id);
  store.removeRule(id);

  const newId = await db.addRule(
    existing.resourceId,
    data.start,
    data.end,
    data.blocking
  );
  const rule: Rule = {
    id: newId,
    resourceId: existing.resourceId,
    start: data.start,
    end: data.end,
    blocking: data.blocking,
  };
  store.setRule(rule);
  return rule;
}

export async function deleteRule(id: string): Promise<void> {
  await db.deleteRule(id);
  store.removeRule(id);
}

export async function getRulesForResource(
  resourceId: string
): Promise<Rule[]> {
  return store.getRulesForResource(resourceId);
}
