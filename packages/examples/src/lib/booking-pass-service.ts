import { randomBytes } from "node:crypto";
import type { AvailabilitySlot, DeltaT } from "@open-deltat/client";
import type { BookableRecord, BookableRegistry } from "./public-bookables";
import type { RateLimiter } from "./rate-limit";
import type { Notifier, OwnerNotice } from "./notify";
import { describeSpan } from "./meeting-request-service";
import { hashManageKey, verifyManageKey } from "./manage-key";
import { requireDisplayText } from "./display-text";
import { HOLD_TTL_MS, HORIZON_DAYS, MAX_QUERY_WINDOW_MS, type Outcome } from "./bookable-service";
import { commitAndConfirm } from "./commit-outcome";
import { passStatus, usesLeft, type BookingPass, type BookingPassStore, type PassAction, type PassStatus } from "./booking-passes";

// Direct booking on someone's calendar, but only with a pass its owner handed out (booking-passes.ts).
// The owner mints one for a window, lengths and a number of bookings; whoever holds it may find a
// free time in that window, hold it and book it. Every refusal about the pass itself reads the same,
// whatever the reason, so a guessed or stale pass teaches the guesser nothing.
//
// Booking spends the pass in the same decision: the pass moves to `spending` before the kernel
// commit and nothing else can start a booking on it until that commit has answered. What the commit
// did is settled by commit-outcome.ts, which meeting approval uses too: only a definite refusal puts
// the pass back to active with its uses intact, a lost reply is settled by releasing the hold and
// then reading the bookings, and when nothing can tell, the pass stays `spending` and stops working
// (INV-01's direction: a lost pass, never an extra booking) until its owner revokes it. The kernel's
// refusal of an overlapping hold stays the real double-booking guard.
//
// A pass works on a calendar that otherwise takes only meeting requests: the owner handing it out IS
// the approval, given in advance.

export interface PassDeps {
  dt: DeltaT;
  registry: BookableRegistry;
  store: BookingPassStore;
  /** Bounds how often one caller may present a pass, valid or not. */
  lookups: RateLimiter;
  /** Tells the owner when a pass books. Best effort: it never fails or undoes the booking. */
  notify: Notifier;
  now?: () => number;
}

/**
 * The one answer for a pass that is wrong, expired, spent, revoked or someone else's: which one is
 * not said. Not "any more": a wrong string never worked, and the wording must not tell it apart.
 */
export const PASS_NOT_VALID =
  "That pass is not valid. Ask the person who sent it for a new one. If you already booked with it, that booking stands.";
export const PASS_PREFIX = "dtp_";
/** 256 bits; base64url of 32 bytes is 43 characters, so a pass is 47 with its prefix. */
const PASS_BYTES = 32;

export const MAX_PASS_USES = 10;
export const DEFAULT_PASS_MINUTES = 15;
export const MAX_PASS_MINUTES = 7 * 24 * 60;
export const MAX_LIVE_HOLDS_PER_PASS = 2;
/** Passes out at once on one calendar, so one owner cannot fill the store for everyone. */
export const MAX_ACTIVE_PASSES_PER_CALENDAR = 50;
export const MIN_LENGTH_MINUTES = 5;
export const MAX_LENGTH_MINUTES = 480;
export const MAX_LENGTHS_PER_PASS = 6;

const MAX_LABEL_LENGTH = 60;
const MAX_NAME_LENGTH = 60;
const MAX_NOTE_LENGTH = 500;
const MIN = 60_000;
const DAY_MS = 86_400_000;

const BUSY = "Another booking with this pass is going through. Retry once; if the pass is then not valid, the other booking used it.";
const NOT_THIS_PASS = "That hold was not made with this pass, or it is already booked or released.";
const NOT_BOOKED = "Nothing was booked: the hold expired or the booking did not go through. Hold the time again; the pass still works.";
const COULD_NOT_CONFIRM = "We could not confirm the booking. Ask the owner whether it went through.";
const RELEASE_CROSSED_BOOKING = "That hold was being booked at the same moment, so it was not released.";

const fail = <T>(error: string): Outcome<T> => ({ ok: false, error });
const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });

function displayText(raw: string, field: string, maxLength: number): Outcome<string> {
  try {
    return ok(requireDisplayText(raw, { field, maxLength }));
  } catch (err) {
    return fail(err instanceof Error ? err.message : `That ${field} will not work.`);
  }
}

function optionalText(raw: string | null | undefined, field: string, maxLength: number): Outcome<string | null> {
  if (raw === null || raw === undefined || raw.trim() === "") return ok(null);
  return displayText(raw, field, maxLength);
}

export interface PassCalendar {
  readonly id: string;
  readonly name: string;
  readonly timezone: string;
}

/** What the owner sees. Never the pass itself: that exists only in the create result. */
export interface PassView {
  readonly id: string;
  readonly calendar: PassCalendar;
  readonly label: string | null;
  readonly from: number;
  readonly to: number;
  readonly lengthsMinutes: readonly number[];
  readonly uses: number;
  /** Bookings it can still make: 0 once it is spent, revoked or expired. */
  readonly usesLeft: number;
  /** Bookings it allowed that were never made; for a revoked or expired pass, what it left behind. */
  readonly bookingsUnused: number;
  readonly status: PassStatus;
  readonly createdAt: number;
  readonly expiresAt: number;
  /** The claimer's sign-in name (their sign-in id when they shared none); null until the first hold. */
  readonly claimedBy: string | null;
  readonly bookings: readonly { bookingId: string; start: number; end: number; bookedBy: string; note: string | null }[];
}

/** What the holder sees: what the pass allows, nothing about the owner's other passes or bookings. */
export interface PassScope {
  readonly calendar: PassCalendar;
  readonly from: number;
  readonly to: number;
  readonly lengthsMinutes: readonly number[];
  readonly usesLeft: number;
  readonly expiresAt: number;
}

export interface CreatePassInput {
  owner: string;
  calendarId: string;
  from: number;
  to: number;
  /** Defaults to the calendar's slot length. */
  lengthsMinutes?: readonly number[];
  uses?: number;
  expiresInMinutes?: number;
  label?: string | null;
}

export interface BookingPassService {
  /** The pass is in this result and nowhere else, ever. */
  create(input: CreatePassInput): Outcome<{ token: string; pass: PassView }>;
  /** Passes on one calendar the owner owns, or on all of them; newest first. */
  list(input: { owner: string; calendarId?: string }): Outcome<PassView[]>;
  revoke(input: { owner: string; passId: string }): Promise<Outcome<PassView>>;
  /**
   * Revoke every live pass on a calendar the owner owns, for deleting it; the count revoked. Refused,
   * revoking none, while a booking with one of them is going through in this process.
   */
  revokeAllOn(owner: string, calendarId: string): Promise<Outcome<number>>;
  findTimes(input: { token: string; caller: string; from?: number; to?: number }): Promise<Outcome<{ scope: PassScope; free: AvailabilitySlot[] }>>;
  /**
   * The first hold on a pass claims it for the caller; `name` is their sign-in name, asked only then,
   * for the owner's list.
   */
  hold(input: { token: string; caller: string; start: number; lengthMinutes?: number; name?: () => Promise<string | null> }): Promise<Outcome<{ scope: PassScope; holdId: string; start: number; end: number; expiresAt: number }>>;
  book(input: { token: string; caller: string; holdId: string; bookedBy: string; note?: string | null }): Promise<Outcome<{ scope: PassScope; bookingId: string; start: number; end: number; usesLeft: number }>>;
  release(input: { token: string; caller: string; holdId: string }): Promise<Outcome<{ scope: PassScope; holdId: string }>>;
}

const calendarOf = (calendarId: string, record: BookableRecord | undefined): PassCalendar => ({
  id: calendarId,
  name: record?.name ?? "",
  timezone: record?.timezone ?? "UTC",
});

const liveHolds = (pass: BookingPass, at: number) => pass.holds.filter((h) => h.outcome.status === "live" && h.expiresAt > at);

const covers = (slots: readonly AvailabilitySlot[], start: number, end: number) =>
  slots.some((slot) => slot.start <= start && slot.end >= end);

export function createBookingPassService(deps: PassDeps): BookingPassService {
  const now = () => deps.now?.() ?? Date.now();
  // Holds being placed right now, per pass: counted with the live ones so two hold calls at once
  // cannot both pass the cap. In memory, like the store's spend lock, for the same one process.
  const placing = new Map<string, number>();
  const placingFor = (passId: string) => placing.get(passId) ?? 0;
  const adjustPlacing = (passId: string, by: number) => {
    const next = placingFor(passId) + by;
    if (next > 0) placing.set(passId, next);
    else placing.delete(passId);
  };
  // Passes whose commit is awaiting the kernel in this process right now. A pass that is `spending`
  // but not in here is one whose commit nobody could confirm (or a crash left): it is not "going
  // through", it has stopped working, and its owner may revoke it.
  const spendingHere = new Set<string>();

  const viewOf = (pass: BookingPass, record: BookableRecord | undefined, at: number): PassView => {
    const status = passStatus(pass, at);
    const bookings = pass.holds.flatMap((h) =>
      h.outcome.status === "booked"
        ? [{ bookingId: h.outcome.bookingId, start: h.start, end: h.end, bookedBy: h.outcome.bookedBy, note: h.outcome.note }]
        : []
    );
    return {
      id: pass.id,
      calendar: calendarOf(pass.calendarId, record),
      label: pass.label,
      from: pass.from,
      to: pass.to,
      lengthsMinutes: pass.lengthsMinutes,
      uses: pass.uses,
      // What can still be used: nothing once the pass is over, even if its state still counts uses.
      usesLeft: status === "active" || status === "spending" ? usesLeft(pass) : 0,
      bookingsUnused: pass.uses - bookings.length,
      status,
      createdAt: pass.createdAt,
      expiresAt: pass.expiresAt,
      claimedBy: pass.claim ? (pass.claim.name ?? pass.claim.principal) : null,
      bookings,
    };
  };

  const scopeOf = (pass: BookingPass, record: BookableRecord): PassScope => ({
    calendar: calendarOf(pass.calendarId, record),
    from: pass.from,
    to: pass.to,
    lengthsMinutes: pass.lengthsMinutes,
    usesLeft: usesLeft(pass),
    expiresAt: pass.expiresAt,
  });

  const audit = (pass: BookingPass, caller: string, action: PassAction, detail: string | null = null) =>
    deps.store.recordUse(pass.id, { at: now(), action, principal: caller, detail });

  /** Refuse a use of a pass the caller does hold, and log why. */
  const refuse = <T>(pass: BookingPass, caller: string, message: string): Outcome<T> => {
    audit(pass, caller, "refused", message);
    return fail(message);
  };

  /** The active pass behind a presented one, and its calendar. Every way of not finding it reads the same. */
  const open = (token: string, caller: string): Outcome<{ pass: BookingPass; record: BookableRecord }> => {
    const gate = deps.lookups.check(caller);
    if (!gate.allowed) {
      return fail(`Too many booking pass lookups. Try again in ${Math.max(1, Math.ceil(gate.retryAfterMs / MIN))} minutes.`);
    }
    // Found by its digest, then compared to it in constant time: the index is an exact-key map, and
    // this keeps the check honest if the lookup ever becomes anything else.
    const pass = deps.store.findByTokenHash(hashManageKey(token));
    if (!pass || !verifyManageKey(token, pass.tokenHash)) return fail(PASS_NOT_VALID);
    const record = deps.registry.get(pass.calendarId);
    const status = passStatus(pass, now());
    if (!record || (status !== "active" && status !== "spending")) {
      audit(pass, caller, "refused", record ? status : "calendar deleted");
      return fail(PASS_NOT_VALID);
    }
    // Claimed by someone else: to them it is as dead as a spent pass, and must read the same.
    if (pass.claim && pass.claim.principal !== caller) {
      audit(pass, caller, "refused", "claimed by another caller");
      return fail(PASS_NOT_VALID);
    }
    if (status === "spending") {
      if (spendingHere.has(pass.id)) return refuse(pass, caller, BUSY);
      audit(pass, caller, "refused", "booking unconfirmed");
      return fail(PASS_NOT_VALID);
    }
    return ok({ pass, record });
  };

  /**
   * Tell the owner, after the booking is committed and recorded, without waiting on it: a webhook that
   * is slow, down or throws must not delay, fail or undo a booking that already stands. The notice
   * never carries the pass, and neither does this log line.
   */
  const announce = (notice: OwnerNotice) => {
    const warn = () => console.warn("Owner notification for a pass booking failed; the booking stands.");
    try {
      deps.notify(notice).catch(warn);
    } catch {
      warn();
    }
  };

  /** Give back every live hold on a pass that can no longer book (spent or revoked). */
  const releaseLive = async (pass: BookingPass) => {
    const at = now();
    for (const hold of liveHolds(pass, at)) {
      await deps.dt.holds.release(hold.holdId).catch(() => {});
      deps.store.releaseHold(pass.id, hold.holdId, at);
    }
  };

  return {
    create(input) {
      const record = deps.registry.authorizeOwner(input.calendarId, input.owner);
      if (!record) return fail("You do not own this calendar.");
      const at = now();
      const { from, to } = input;
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return fail("That is not a valid window.");
      if (to <= at) return fail("That window is already over. Pick one in the future.");
      if (to > at + HORIZON_DAYS * DAY_MS) return fail(`Keep the window within the next ${HORIZON_DAYS} days.`);

      const uses = input.uses ?? 1;
      if (!Number.isInteger(uses) || uses < 1 || uses > MAX_PASS_USES) return fail(`A pass allows 1 to ${MAX_PASS_USES} bookings.`);
      const minutes = input.expiresInMinutes ?? DEFAULT_PASS_MINUTES;
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_PASS_MINUTES) {
        return fail(`A pass lasts 1 to ${MAX_PASS_MINUTES} minutes (7 days).`);
      }
      const lengths = [...new Set(input.lengthsMinutes ?? [record.slotMinutes])].sort((a, b) => a - b);
      const lengthsOk =
        lengths.length > 0 &&
        lengths.length <= MAX_LENGTHS_PER_PASS &&
        lengths.every((m) => Number.isInteger(m) && m >= MIN_LENGTH_MINUTES && m <= MAX_LENGTH_MINUTES);
      if (!lengthsOk) {
        return fail(`Lengths are whole minutes from ${MIN_LENGTH_MINUTES} to ${MAX_LENGTH_MINUTES}, at most ${MAX_LENGTHS_PER_PASS} of them.`);
      }
      const label = optionalText(input.label, "label", MAX_LABEL_LENGTH);
      if (!label.ok) return label;

      const out = deps.store.listForCalendar(record.id).filter((p) => {
        const status = passStatus(p, at);
        return status === "active" || status === "spending";
      });
      if (out.length >= MAX_ACTIVE_PASSES_PER_CALENDAR) {
        return fail(`This calendar already has ${MAX_ACTIVE_PASSES_PER_CALENDAR} passes out. Revoke some, or let them expire.`);
      }

      const token = `${PASS_PREFIX}${randomBytes(PASS_BYTES).toString("base64url")}`;
      try {
        const pass = deps.store.create({
          tokenHash: hashManageKey(token),
          calendarId: record.id,
          createdBy: input.owner,
          label: label.value,
          from,
          to,
          lengthsMinutes: lengths,
          uses,
          expiresAt: at + minutes * MIN,
        });
        return ok({ token, pass: viewOf(pass, record, at) });
      } catch (err) {
        return fail(err instanceof Error ? err.message : "The pass could not be stored.");
      }
    },

    list({ owner, calendarId }) {
      const at = now();
      if (calendarId !== undefined) {
        const record = deps.registry.authorizeOwner(calendarId, owner);
        if (!record) return fail("You do not own this calendar.");
        return ok(deps.store.listForCalendar(calendarId).map((p) => viewOf(p, record, at)));
      }
      return ok(
        deps.registry
          .listOwned(owner)
          .flatMap((record) => deps.store.listForCalendar(record.id).map((p) => viewOf(p, record, at)))
          .sort((a, b) => b.createdAt - a.createdAt)
      );
    },

    async revoke({ owner, passId }) {
      const pass = deps.store.get(passId);
      const record = pass && deps.registry.authorizeOwner(pass.calendarId, owner);
      if (!pass || !record) return fail("No such pass on a calendar you own.");
      const status = passStatus(pass, now());
      // Wait only for a commit really in flight here; a pass stuck in `spending` is the owner's to stop.
      if (status === "spending" && spendingHere.has(pass.id)) return fail(BUSY);
      if (status !== "active" && status !== "spending") return fail(`That pass is already ${status}.`);
      const revoked = deps.store.revoke(pass.id, now());
      if (!revoked) return fail(`That pass is already ${status}.`);
      await releaseLive(revoked);
      return ok(viewOf(deps.store.get(pass.id) ?? revoked, record, now()));
    },

    async revokeAllOn(owner, calendarId) {
      if (!deps.registry.authorizeOwner(calendarId, owner)) return fail("You do not own this calendar.");
      const onCalendar = deps.store.listForCalendar(calendarId);
      if (onCalendar.some((p) => spendingHere.has(p.id))) return fail(BUSY);
      const live = onCalendar.filter((p) => {
        const status = passStatus(p, now());
        return status === "active" || status === "spending";
      });
      for (const pass of live) {
        const revoked = deps.store.revoke(pass.id, now());
        if (revoked) await releaseLive(revoked);
      }
      return ok(live.length);
    },

    async findTimes({ token, caller, from, to }) {
      const opened = open(token, caller);
      if (!opened.ok) return opened;
      const { pass, record } = opened.value;
      if ((from !== undefined && !Number.isFinite(from)) || (to !== undefined && !Number.isFinite(to))) {
        return refuse(pass, caller, "That is not a valid window.");
      }
      // The pass's window bounds every answer; the caller can only narrow it.
      const start = Math.max(pass.from, from ?? pass.from, now());
      const end = Math.min(pass.to, to ?? pass.to, start + MAX_QUERY_WINDOW_MS);
      const shortest = Math.min(...pass.lengthsMinutes) * MIN;
      const slots = end > start ? await deps.dt.availability.get({ resourceId: pass.calendarId, start, end }).catch(() => null) : [];
      if (!slots) return refuse(pass, caller, "The calendar could not be read just now. Try again.");
      const free = slots
        .map((s) => ({ start: Math.max(s.start, start), end: Math.min(s.end, end) }))
        .filter((s) => s.end - s.start >= shortest);
      audit(pass, caller, "find");
      return ok({ scope: scopeOf(pass, record), free });
    },

    async hold({ token, caller, start, lengthMinutes, name }) {
      const opened = open(token, caller);
      if (!opened.ok) return opened;
      const { pass, record } = opened.value;
      const at = now();
      const allowed = pass.lengthsMinutes;
      const minutes = lengthMinutes ?? (allowed.length === 1 ? allowed[0] : undefined);
      if (minutes === undefined) return refuse(pass, caller, `Say how long: this pass allows ${allowed.join(", ")} minutes.`);
      if (!allowed.includes(minutes)) return refuse(pass, caller, `This pass allows ${allowed.join(", ")} minutes, not ${minutes}.`);
      if (!Number.isFinite(start)) return refuse(pass, caller, "That is not a valid start.");
      const end = start + minutes * MIN;
      if (start <= at) return refuse(pass, caller, "That time has already started. Pick a time in the future.");
      if (start < pass.from || end > pass.to) {
        return refuse(pass, caller, "That time is outside what this pass allows. Pick one from find_times_with_pass.");
      }
      // The first hold claims the pass, before anything is placed, so two agents racing for an
      // unclaimed pass cannot both get a hold: the loser finds it claimed, which reads as not valid.
      const claimerName = pass.claim || !name ? null : await name().catch(() => null);
      const claimedBefore = deps.store.get(pass.id)?.claim ?? null;
      const current = pass.claim ? pass : deps.store.claim(pass.id, { principal: caller, name: claimerName });
      if (!current) return refuse(pass, caller, PASS_NOT_VALID);
      // Only a hold that lands keeps a claim this call took; otherwise one deliberately bad hold by
      // anyone holding the string would lock the intended agent out. Kept while another hold of the
      // claimer's is still on its way: that one may land, and it is theirs.
      const tookClaim = claimedBefore === null;
      const refuseAndGiveBack = (message: string) => {
        if (tookClaim && placingFor(pass.id) === 1) deps.store.unclaim(pass.id, caller);
        return refuse<{ scope: PassScope; holdId: string; start: number; end: number; expiresAt: number }>(pass, caller, message);
      };
      if (liveHolds(current, at).length + placingFor(pass.id) >= MAX_LIVE_HOLDS_PER_PASS) {
        return refuse(pass, caller, `This pass already holds ${MAX_LIVE_HOLDS_PER_PASS} times. Book one or release one first.`);
      }

      adjustPlacing(pass.id, 1);
      try {
        const free = await deps.dt.availability.get({ resourceId: pass.calendarId, start, end }).catch(() => null);
        if (!free || !covers(free, start, end)) return refuseAndGiveBack("That time is not free. Pick another from find_times_with_pass.");
        // Ours to set, and never past the pass: a hold that outlived its pass would squat on a time
        // nobody can book with it any more.
        const expiresAt = Math.min(now() + HOLD_TTL_MS, pass.expiresAt);
        const placed = await deps.dt.holds.place({ resourceId: pass.calendarId, start, end, expiresAt }).catch(() => null);
        if (!placed) return refuseAndGiveBack("Someone else is holding that time right now. Pick another.");
        const added = deps.store.addHold(pass.id, { holdId: placed.id, start, end, expiresAt: placed.expiresAt, placedBy: caller });
        if (!added) {
          // Spent or revoked while the hold was being placed: give the time straight back.
          await deps.dt.holds.release(placed.id).catch(() => {});
          const current = deps.store.get(pass.id);
          return refuse(pass, caller, current?.state.status === "spending" ? BUSY : PASS_NOT_VALID);
        }
        audit(pass, caller, "hold", placed.id);
        return ok({ scope: scopeOf(added, record), holdId: placed.id, start, end, expiresAt: placed.expiresAt });
      } finally {
        adjustPlacing(pass.id, -1);
      }
    },

    async book({ token, caller, holdId, bookedBy, note }) {
      const opened = open(token, caller);
      if (!opened.ok) return opened;
      const { pass, record } = opened.value;
      const hold = pass.holds.find((h) => h.holdId === holdId && h.outcome.status === "live" && h.placedBy === caller);
      if (!hold) return refuse(pass, caller, NOT_THIS_PASS);
      if (hold.expiresAt <= now()) {
        deps.store.releaseHold(pass.id, holdId, now());
        return refuse(pass, caller, "That hold has expired. Hold the time again.");
      }
      const name = displayText(bookedBy, "name", MAX_NAME_LENGTH);
      if (!name.ok) return refuse(pass, caller, name.error);
      const forOwner = optionalText(note, "note", MAX_NOTE_LENGTH);
      if (!forOwner.ok) return refuse(pass, caller, forOwner.error);

      // The compare-and-set: from here until the commit answers, no other booking can start on it.
      if (!deps.store.beginSpend(pass.id)) return refuse(pass, caller, BUSY);
      spendingHere.add(pass.id);
      // commit-outcome.ts decides what the commit did, lost replies included; `unknown` keeps the pass spending.
      const outcome = await commitAndConfirm(deps.dt, { resourceId: pass.calendarId, holdId, start: hold.start, end: hold.end, label: name.value }).finally(() =>
        spendingHere.delete(pass.id)
      );
      if (outcome.kind === "unknown") {
        // The safe direction: the pass stays `spending`, so it books nothing more; the owner can revoke it.
        return refuse(pass, caller, COULD_NOT_CONFIRM);
      }
      if (outcome.kind === "not_booked") {
        // No release here: the kernel refused because the hold is gone, or the unclear path released it.
        deps.store.finishSpend(pass.id, { booked: false, holdId, at: now() });
        return refuse(pass, caller, NOT_BOOKED);
      }
      const finished = deps.store.finishSpend(pass.id, {
        booked: true,
        holdId,
        at: now(),
        bookingId: outcome.bookingId,
        bookedBy: name.value,
        note: forOwner.value,
      });
      // Only this function moves a pass out of `spending`, and revoke waits while it is in flight.
      if (!finished) throw new Error(`Booking pass ${pass.id} left the spending state during its own spend.`);
      if (finished.state.status === "spent") await releaseLive(finished);
      audit(pass, caller, "book", outcome.bookingId);
      // The guest's name and note are quoted (JSON-escaped), so an owner's agent reads them as data.
      const which = pass.label ? `the pass "${pass.label}"` : "a booking pass";
      const aside = forOwner.value ? ` (note: ${JSON.stringify(forOwner.value)})` : "";
      announce({
        kind: "pass_booking",
        calendarId: pass.calendarId,
        passId: pass.id,
        text: `${JSON.stringify(name.value)} booked ${describeSpan(hold.start, hold.end, record.timezone)} on ${record.name} with ${which}${aside}`,
      });
      return ok({ scope: scopeOf(finished, record), bookingId: outcome.bookingId, start: hold.start, end: hold.end, usesLeft: usesLeft(finished) });
    },

    async release({ token, caller, holdId }) {
      const opened = open(token, caller);
      if (!opened.ok) return opened;
      const { pass, record } = opened.value;
      if (!pass.holds.some((h) => h.holdId === holdId && h.outcome.status === "live")) return refuse(pass, caller, NOT_THIS_PASS);
      await deps.dt.holds.release(holdId).catch(() => {});
      // A booking may have started on this hold while the release was out. If it is in flight (or
      // unconfirmed), the hold may have become a booking: marking it released would hide that.
      if (deps.store.get(pass.id)?.state.status === "spending") return refuse(pass, caller, RELEASE_CROSSED_BOOKING);
      const released = deps.store.releaseHold(pass.id, holdId, now());
      // Undefined: the hold stopped being live while the release was out, i.e. it was booked.
      if (!released) return refuse(pass, caller, NOT_THIS_PASS);
      audit(pass, caller, "release", holdId);
      return ok({ scope: scopeOf(released, record), holdId });
    },
  };
}
