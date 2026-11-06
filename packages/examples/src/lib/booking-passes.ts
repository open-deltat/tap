import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// Booking passes: a calendar's owner hands out direct booking, once, for a short while, inside a
// window they chose. Without one, the hosted MCP only lets a stranger ASK (meeting requests); with
// one, the holder's agent can hold and book, because the owner vouched for them by handing it over.
//
// What is stored is a SHA-256 of the pass, never the pass: a leaked file hands over nothing that
// books. The pass itself is shown once, to the owner's agent, and travels however the owner likes.
//
// One file, one process, the same honest limit as the registry and the meeting requests beside it.
// The spend lock below is only a lock because every write happens synchronously in this one process;
// two replicas would each hold their own copy and could spend one pass twice.

/** Ceiling on stored passes, so a caller who outlasts the rate limits still cannot fill the disk. */
export const MAX_BOOKING_PASSES = 20_000;

/** Uses kept per pass, newest last. A pass lives at most a week; this bounds a chatty holder. */
export const MAX_AUDIT_PER_PASS = 50;

/**
 * `spending` is the lock between the check and the kernel commit: a booking moves the pass from
 * active to spending before it commits, so a second booking on the same pass finds it taken and
 * stops. Expiry is not a state: it is derived from `expiresAt` and the clock (passStatus).
 */
export type PassState =
  | { readonly status: "active"; readonly usesLeft: number }
  | { readonly status: "spending"; readonly usesLeft: number }
  | { readonly status: "spent"; readonly spentAt: number }
  | { readonly status: "revoked"; readonly revokedAt: number };

export type PassStatus = PassState["status"] | "expired";

export type HoldOutcome =
  | { readonly status: "live" }
  | { readonly status: "booked"; readonly bookedAt: number; readonly bookingId: string; readonly bookedBy: string; readonly note: string | null }
  | { readonly status: "released"; readonly releasedAt: number };

/** A deltat hold placed under this pass. Only these may be booked or released with it. */
export interface PassHold {
  readonly holdId: string;
  readonly start: number;
  readonly end: number;
  readonly expiresAt: number;
  /** The verified principal whose agent placed it (`iss#sub`). */
  readonly placedBy: string;
  readonly outcome: HoldOutcome;
}

export const PASS_ACTIONS = ["find", "hold", "book", "release", "refused"] as const;
export type PassAction = (typeof PASS_ACTIONS)[number];

export interface PassUse {
  readonly at: number;
  readonly action: PassAction;
  /** The verified caller (`iss#sub`). Never the pass itself. */
  readonly principal: string;
  readonly detail: string | null;
}

export interface BookingPass {
  readonly id: string;
  /** SHA-256 (hex) of the pass. The lookup key; the pass itself is never stored. */
  readonly tokenHash: string;
  readonly calendarId: string;
  /** The owner who minted it. Authorization reads the registry's current owner, not this. */
  readonly createdBy: string;
  readonly label: string | null;
  /** The window a hold must fall inside: [from, to). */
  readonly from: number;
  readonly to: number;
  readonly lengthsMinutes: readonly number[];
  readonly uses: number;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly state: PassState;
  readonly holds: readonly PassHold[];
  readonly audit: readonly PassUse[];
}

export interface NewBookingPass {
  tokenHash: string;
  calendarId: string;
  createdBy: string;
  label: string | null;
  from: number;
  to: number;
  lengthsMinutes: readonly number[];
  uses: number;
  expiresAt: number;
}

export type SpendResult =
  | { readonly booked: true; readonly holdId: string; readonly at: number; readonly bookingId: string; readonly bookedBy: string; readonly note: string | null }
  | { readonly booked: false; readonly holdId: string; readonly at: number };

export interface BookingPassStore {
  create(input: NewBookingPass): BookingPass;
  get(id: string): BookingPass | undefined;
  findByTokenHash(tokenHash: string): BookingPass | undefined;
  /** Every pass on a calendar, newest first. */
  listForCalendar(calendarId: string): BookingPass[];
  /** Record a hold placed under an active pass. Undefined when the pass is no longer active. */
  addHold(id: string, hold: Omit<PassHold, "outcome">): BookingPass | undefined;
  /** Mark a live hold released. Undefined when there is no such live hold on the pass. */
  releaseHold(id: string, holdId: string, at: number): BookingPass | undefined;
  /** Compare-and-set active -> spending. Undefined when the pass was not active: someone else is spending it, or it is over. */
  beginSpend(id: string): BookingPass | undefined;
  /** Settle a spend: booked takes one use (spent at zero), not booked puts the pass back to active. */
  finishSpend(id: string, result: SpendResult): BookingPass | undefined;
  /** Revoke an active pass. Undefined when it was not active. */
  revoke(id: string, at: number): BookingPass | undefined;
  recordUse(id: string, use: PassUse): void;
  count(): number;
}

/** Status at `now`: a pass that is not over yet but whose time has passed is expired. */
export function passStatus(pass: BookingPass, now: number): PassStatus {
  const { state } = pass;
  return (state.status === "active" || state.status === "spending") && now >= pass.expiresAt ? "expired" : state.status;
}

export const usesLeft = (pass: BookingPass): number =>
  pass.state.status === "active" || pass.state.status === "spending" ? pass.state.usesLeft : 0;

interface StoreFile {
  readonly version: 1;
  readonly passes: readonly BookingPass[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isNullableString = (v: unknown) => v === null || typeof v === "string";
const isUses = (v: unknown): v is number => isNumber(v) && Number.isInteger(v) && v >= 1;

function isState(value: unknown): value is PassState {
  if (!isRecord(value)) return false;
  switch (value.status) {
    case "active":
    case "spending":
      return isUses(value.usesLeft);
    case "spent":
      return isNumber(value.spentAt);
    case "revoked":
      return isNumber(value.revokedAt);
    default:
      return false;
  }
}

function isOutcome(value: unknown): value is HoldOutcome {
  if (!isRecord(value)) return false;
  switch (value.status) {
    case "live":
      return true;
    case "booked":
      return isNumber(value.bookedAt) && typeof value.bookingId === "string" && typeof value.bookedBy === "string" && isNullableString(value.note);
    case "released":
      return isNumber(value.releasedAt);
    default:
      return false;
  }
}

const isHold = (v: unknown): v is PassHold =>
  isRecord(v) &&
  typeof v.holdId === "string" &&
  isNumber(v.start) &&
  isNumber(v.end) &&
  v.end > v.start &&
  isNumber(v.expiresAt) &&
  typeof v.placedBy === "string" &&
  isOutcome(v.outcome);

const isUse = (v: unknown): v is PassUse =>
  isRecord(v) && isNumber(v.at) && PASS_ACTIONS.some((a) => a === v.action) && typeof v.principal === "string" && isNullableString(v.detail);

const HEX_DIGITS = "0123456789abcdef";
const isSha256Hex = (v: unknown): v is string => typeof v === "string" && v.length === 64 && [...v].every((c) => HEX_DIGITS.includes(c));

function isPass(value: unknown): value is BookingPass {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isSha256Hex(value.tokenHash) &&
    typeof value.calendarId === "string" &&
    typeof value.createdBy === "string" &&
    isNullableString(value.label) &&
    isNumber(value.from) &&
    isNumber(value.to) &&
    value.to > value.from &&
    Array.isArray(value.lengthsMinutes) &&
    value.lengthsMinutes.length > 0 &&
    value.lengthsMinutes.every(isUses) &&
    isUses(value.uses) &&
    isNumber(value.createdAt) &&
    isNumber(value.expiresAt) &&
    isState(value.state) &&
    Array.isArray(value.holds) &&
    value.holds.every(isHold) &&
    Array.isArray(value.audit) &&
    value.audit.every(isUse)
  );
}

function load(path: string): Map<string, BookingPass> {
  try {
    if (!existsSync(path)) return new Map();
    const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
    const passes = isRecord(parsed) ? parsed.passes : undefined;
    if (!Array.isArray(passes)) return new Map();
    // A pass that fails its shape check is dropped rather than trusted, as in the registry. A pass a
    // crash left `spending` stays spending: the commit may have landed, and an extra booking on the
    // owner's calendar is worse than a pass that stops working. It expires on its own.
    return new Map(passes.filter(isPass).map((p) => [p.id, p]));
  } catch {
    return new Map();
  }
}

const newestFirst = (a: BookingPass, b: BookingPass) => b.createdAt - a.createdAt;

export function openBookingPassStore(
  path: string,
  opts?: { maxEntries?: number; now?: () => number; newId?: () => string }
): BookingPassStore {
  const maxEntries = opts?.maxEntries ?? MAX_BOOKING_PASSES;
  const now = opts?.now ?? Date.now;
  const newId = opts?.newId ?? (() => crypto.randomUUID());
  const passes = load(path);
  const byHash = new Map([...passes.values()].map((p) => [p.tokenHash, p.id]));

  // Sibling then rename, so a crash mid-write cannot truncate every pass at once.
  const flush = (): void => {
    const dir = dirname(path);
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmp = `${path}.tmp`;
    const file: StoreFile = { version: 1, passes: [...passes.values()] };
    writeFileSync(tmp, JSON.stringify(file));
    renameSync(tmp, path);
  };

  const save = (pass: BookingPass): BookingPass => {
    passes.set(pass.id, pass);
    flush();
    return pass;
  };

  const settle = (holds: readonly PassHold[], holdId: string, outcome: HoldOutcome) =>
    holds.map((h) => (h.holdId === holdId && h.outcome.status === "live" ? { ...h, outcome } : h));

  return {
    create(input) {
      if (passes.size >= maxEntries) throw new Error("Too many booking passes are stored right now; none can be added.");
      if (byHash.has(input.tokenHash)) throw new Error("That pass already exists.");
      const pass: BookingPass = {
        id: newId(),
        ...input,
        lengthsMinutes: [...input.lengthsMinutes],
        createdAt: now(),
        state: { status: "active", usesLeft: input.uses },
        holds: [],
        audit: [],
      };
      byHash.set(pass.tokenHash, pass.id);
      return save(pass);
    },

    get(id) {
      return passes.get(id);
    },

    findByTokenHash(tokenHash) {
      const id = byHash.get(tokenHash);
      return id === undefined ? undefined : passes.get(id);
    },

    listForCalendar(calendarId) {
      return [...passes.values()].filter((p) => p.calendarId === calendarId).sort(newestFirst);
    },

    addHold(id, hold) {
      const pass = passes.get(id);
      if (!pass || pass.state.status !== "active") return undefined;
      return save({ ...pass, holds: [...pass.holds, { ...hold, outcome: { status: "live" } }] });
    },

    releaseHold(id, holdId, at) {
      const pass = passes.get(id);
      if (!pass?.holds.some((h) => h.holdId === holdId && h.outcome.status === "live")) return undefined;
      return save({ ...pass, holds: settle(pass.holds, holdId, { status: "released", releasedAt: at }) });
    },

    beginSpend(id) {
      const pass = passes.get(id);
      if (!pass || pass.state.status !== "active") return undefined;
      return save({ ...pass, state: { status: "spending", usesLeft: pass.state.usesLeft } });
    },

    finishSpend(id, result) {
      const pass = passes.get(id);
      if (!pass || pass.state.status !== "spending") return undefined;
      if (!result.booked) {
        return save({
          ...pass,
          state: { status: "active", usesLeft: pass.state.usesLeft },
          holds: settle(pass.holds, result.holdId, { status: "released", releasedAt: result.at }),
        });
      }
      const left = pass.state.usesLeft - 1;
      const { holdId, at, bookingId, bookedBy, note } = result;
      return save({
        ...pass,
        state: left > 0 ? { status: "active", usesLeft: left } : { status: "spent", spentAt: at },
        holds: settle(pass.holds, holdId, { status: "booked", bookedAt: at, bookingId, bookedBy, note }),
      });
    },

    revoke(id, at) {
      const pass = passes.get(id);
      if (!pass || pass.state.status !== "active") return undefined;
      return save({ ...pass, state: { status: "revoked", revokedAt: at } });
    },

    recordUse(id, use) {
      const pass = passes.get(id);
      if (!pass) return;
      save({ ...pass, audit: [...pass.audit, use].slice(-MAX_AUDIT_PER_PASS) });
    },

    count() {
      return passes.size;
    },
  };
}
