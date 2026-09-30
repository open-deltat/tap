import { parseInstant } from "@open-deltat/client";

// Validation of what a person or a model typed. It all runs before a connection is opened, so a
// typo costs nothing and never reaches the server. Every failure is an InputError, reported as
// INVALID with exit code 2.

export class InputError extends Error {}

export type Args = { values: Readonly<Record<string, string | boolean | undefined>>; positionals: readonly string[] };

export type Window = { start: number; end: number };

const ID_MAX = 64;

/** An option's trimmed text, or null when absent or blank. */
export function text(a: Args, name: string): string | null {
  const v = a.values[name];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export function noPositionals(a: Args): void {
  if (a.positionals.length > 0) throw new InputError(`Unexpected argument: ${a.positionals[0]}`);
}

/** The single id a command takes. Ids are opaque, but whitespace or a huge value is certainly a mistake. */
export function onlyId(a: Args, name: string): string {
  if (a.positionals.length > 1) throw new InputError(`Unexpected argument: ${a.positionals[1]}`);
  const v = a.positionals[0]?.trim() ?? "";
  if (v === "") throw new InputError(`Missing <${name}>.`);
  if (v.length > ID_MAX || /\s/.test(v)) throw new InputError(`<${name}> does not look like an id: ${v}`);
  return v;
}

export function requiredTime(a: Args, name: string): number {
  const raw = text(a, name);
  if (raw === null) throw new InputError(`Missing --${name} <time>, e.g. --${name} 2026-10-01T09:00:00+02:00`);
  const parsed = parseInstant(raw);
  if (!parsed.ok) throw new InputError(`--${name}: ${parsed.message}`);
  return parsed.ms;
}

/** A start and end that must both be given, the end after the start. */
export function requiredSpan(a: Args, startName: string, endName: string): Window {
  const start = requiredTime(a, startName);
  const end = requiredTime(a, endName);
  if (end <= start) throw new InputError(`--${endName} must be after --${startName}.`);
  return { start, end };
}

/** --from and --to together or not at all. Half a window is always a mistake, never "open-ended". */
export function optionalWindow(a: Args): Window | null {
  if (text(a, "from") === null && text(a, "to") === null) return null;
  return requiredSpan(a, "from", "to");
}

export function minutes(a: Args, name: string, bounds: { min: number; max: number }): number | null {
  const raw = text(a, name);
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < bounds.min || n > bounds.max) {
    throw new InputError(`--${name} must be a whole number of minutes from ${bounds.min} to ${bounds.max}.`);
  }
  return n;
}
