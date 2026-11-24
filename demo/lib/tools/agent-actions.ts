"use server";

import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createDeltatMcpServer } from "@open-deltat/mcp";
import { dt } from "@open-deltat/examples/lib/deltat";
import { HALF_HOUR, forgetLater, gate, nextHalfHour, toolCalendar } from "./calendars";
import type { Call, CallKind } from "./trace";
import { isZone } from "./zone";

// An agent booking run, on the real MCP tools. The page's agent and its rival are two MCP clients,
// each talking to the open-source Δt MCP server (@open-deltat/mcp, the one `npx @open-deltat/mcp`
// starts) over an in-memory transport, so every reply below is the exact text a model would read.
// What is scripted is the agent's decisions: which slot to take is fixed, so the page needs no LLM.

const Input = z.object({ rival: z.boolean(), timezone: z.string().max(64) });

export type AgentStep = { readonly say: string; readonly call: Call };
export type AgentRun = { ok: true; steps: readonly AgentStep[]; booked: boolean } | { ok: false; message: string };

const KIND: Record<string, CallKind> = { find_slots: "find", hold_slot: "hold", commit_hold: "commit", release_hold: "release" };

async function connect(name: string): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createDeltatMcpServer(dt).connect(serverSide);
  const client = new Client({ name, version: "1.0.0" });
  await client.connect(clientSide);
  return client;
}

/** The text a tool returned, which is what an agent reads. */
function text(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = Array.isArray(result.content) ? result.content : [];
  return content.flatMap((c) => (typeof c === "object" && c !== null && "text" in c && typeof c.text === "string" ? [c.text] : [])).join("\n");
}

function parse(body: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(body);
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function tool(client: Client, who: string, name: string, args: Record<string, unknown>): Promise<{ call: Call; body: Record<string, unknown> }> {
  const t0 = performance.now();
  const result = await client.callTool({ name, arguments: args });
  const ms = Math.round((performance.now() - t0) * 10) / 10;
  const raw = text(result);
  const body = parse(raw);
  const code = typeof body.error === "string" ? body.error : raw.split(":")[0] || "ERROR";
  const outcome = result.isError ? { ok: false as const, code, reply: raw } : { ok: true as const, reply: raw };
  return { call: { who, kind: KIND[name] ?? "read", name, args, outcome, ms }, body };
}

const startOf = (v: unknown): string | null => (typeof v === "object" && v !== null && "start" in v && typeof v.start === "string" ? v.start : null);
const plus30 = (iso: string) => new Date(Date.parse(iso) + HALF_HOUR).toISOString();
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export async function runAgent(input: unknown): Promise<AgentRun> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Bad request." };
  const g = await gate();
  if (!g.ok) return g;
  const timezone = isZone(parsed.data.timezone) ? parsed.data.timezone : "UTC";

  try {
    const calendar = await toolCalendar("agent");
    const [agent, rival] = await Promise.all([connect("page-agent"), connect("rival-agent")]);
    try {
      return await script(calendar, agent, rival, parsed.data.rival, timezone, g.sid);
    } finally {
      await Promise.all([agent.close(), rival.close()]);
    }
  } catch {
    return { ok: false, message: "Could not reach Δt just now. Try again in a moment." };
  }
}

async function script(calendar: string, agent: Client, rival: Client, withRival: boolean, timezone: string, sid: string | null): Promise<AgentRun> {
    const steps: AgentStep[] = [];
    const from = new Date(nextHalfHour(Date.now(), HALF_HOUR)).toISOString();
    const to = new Date(Date.parse(from) + 3 * 60 * 60_000).toISOString();

    const found = await tool(agent, "Agent", "find_slots", { calendar_ids: [calendar], from, to, timezone, min_minutes: 30 });
    steps.push({ say: "First I look at what is actually free in the next three hours.", call: found.call });
    const first = startOf(Array.isArray(found.body.slots) ? found.body.slots[0] : null);
    if (!first) return { ok: false, message: "No free time in the next three hours on the demo calendar. Try again shortly." };

    const rivalHolds: string[] = [];
    if (withRival) {
      const r = await tool(rival, "Another agent", "hold_slot", { calendar_ids: [calendar], start: first, end: plus30(first), timezone });
      rivalHolds.push(...strings(r.body.hold_ids));
      steps.push({ say: "Meanwhile another agent, booking for someone else, holds that same time.", call: r.call });
    }

    const held = await tool(agent, "Agent", "hold_slot", { calendar_ids: [calendar], start: first, end: plus30(first), timezone });
    steps.push({ say: "Before I offer the earliest time to you, I hold it, so the time I say is the time I can book.", call: held.call });

    const fallback = startOf(Array.isArray(held.body.alternatives) ? held.body.alternatives[0] : null);
    const retry =
      !held.call.outcome.ok && fallback
        ? await tool(agent, "Agent", "hold_slot", { calendar_ids: [calendar], start: fallback, end: plus30(fallback), timezone })
        : null;
    if (retry) steps.push({ say: "That one just went. The refusal already lists times that still work, so I hold the next one, with no second search.", call: retry.call });

    const holdIds = strings((retry ?? held).body.hold_ids);
    const committed = holdIds.length > 0 ? await tool(agent, "Agent", "commit_hold", { hold_ids: holdIds, timezone }) : null;
    if (committed) steps.push({ say: "You said yes, so I commit the hold. Only now do I tell you it is booked.", call: committed.call });
    const bookingIds = strings(committed?.body.booking_ids);
    if (bookingIds.length > 0) {
      const slotStart = Date.parse(retry ? (fallback ?? first) : first);
      forgetLater(sid, bookingIds.map((id) => ({ id, resourceId: calendar, start: slotStart, end: slotStart + HALF_HOUR, label: null })));
    } else if (holdIds.length > 0) {
      // A refused commit leaves the agent's hold standing for its full five minutes; give it back.
      const released = await tool(agent, "Agent", "release_hold", { hold_ids: holdIds });
      steps.push({ say: "The booking did not go through, so I let my hold go rather than sit on the time.", call: released.call });
    }

    if (rivalHolds.length > 0) {
      const released = await tool(rival, "Another agent", "release_hold", { hold_ids: rivalHolds });
      steps.push({ say: "The other agent's person said no, so it lets its hold go and the time is free again.", call: released.call });
    }

    return { ok: true, steps, booked: bookingIds.length > 0 };
}
