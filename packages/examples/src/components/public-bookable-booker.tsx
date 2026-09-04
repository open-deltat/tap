"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Loader2, TriangleAlert } from "lucide-react";
import { Stage } from "./stage";
import { ACCENT_CTA, PILL_ACTIVE, PILL_BASE, PILL_IDLE } from "../lib/accent";
import { cn } from "@open-deltat/shared/utils";
import { formatTime } from "@open-deltat/shared/time";
import type { BookableRecord } from "../lib/public-bookables";
import {
  commitPublicHold,
  getPublicSlots,
  holdPublicSlot,
  releasePublicHold,
} from "../actions/public-booking";

const DAY_MS = 86_400_000;

interface Slot {
  start: number;
  end: number;
}

interface Held extends Slot {
  holdId: string;
  expiresAt: number;
}

/** Cut each free span into whole slots of the owner's chosen length, dropping any tail too short to book. */
function sliceIntoSlots(spans: Slot[], slotMs: number, notBefore: number): Slot[] {
  return spans.flatMap((span) => {
    const slots: Slot[] = [];
    for (let start = span.start; start + slotMs <= span.end; start += slotMs) {
      if (start >= notBefore) slots.push({ start, end: start + slotMs });
    }
    return slots;
  });
}

function localMidnight(offsetDays: number): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.getTime();
}

export function PublicBookableBooker({ record }: { record: BookableRecord }) {
  const [dayOffset, setDayOffset] = useState(0);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [held, setHeld] = useState<Held | null>(null);
  const [bookedBy, setBookedBy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ slot: Slot; bookingId: string } | null>(null);
  const [working, startWorking] = useTransition();

  const dayStart = localMidnight(dayOffset);

  const load = useCallback(async () => {
    setLoading(true);
    const spans = await getPublicSlots(record.id, dayStart, dayStart + DAY_MS);
    setSlots(sliceIntoSlots(spans, record.slotMinutes * 60_000, Date.now()));
    setLoading(false);
  }, [record.id, record.slotMinutes, dayStart]);

  useEffect(() => {
    void load();
  }, [load]);

  function pick(slot: Slot) {
    setError(null);
    startWorking(async () => {
      const result = await holdPublicSlot(record.id, slot.start, slot.end);
      if (result.ok) {
        setHeld({ ...slot, ...result.value });
      } else {
        setError(result.error);
        await load();
      }
    });
  }

  function confirm() {
    if (!held) return;
    setError(null);
    startWorking(async () => {
      const result = await commitPublicHold(record.id, held.holdId, bookedBy);
      if (result.ok) {
        setConfirmed({ slot: { start: held.start, end: held.end }, bookingId: result.value.bookingId });
        setHeld(null);
        setBookedBy("");
        await load();
      } else {
        setError(result.error);
      }
    });
  }

  function abandon() {
    if (!held) return;
    const { holdId } = held;
    setHeld(null);
    setError(null);
    startWorking(async () => {
      await releasePublicHold(record.id, holdId);
      await load();
    });
  }

  if (confirmed) {
    return (
      <Stage primitive={{ label: "Hold, then commit", specId: "AVAIL-07" }} title={record.name}>
        <div className="mx-auto max-w-md space-y-4 text-center">
          <p className="text-sm text-zinc-200">
            Booked for {formatTime(confirmed.slot.start)} on{" "}
            {new Date(confirmed.slot.start).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
            .
          </p>
          <code className="block rounded bg-black/30 px-2 py-1.5 text-[11px] text-zinc-400">
            {confirmed.bookingId}
          </code>
          <button
            type="button"
            onClick={() => setConfirmed(null)}
            className={cn(PILL_BASE, PILL_IDLE)}
          >
            Book another
          </button>
        </div>
      </Stage>
    );
  }

  return (
    <Stage
      primitive={{ label: "Hold, then commit", specId: "AVAIL-07" }}
      title={record.name}
      ribbon={
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setDayOffset((d) => Math.max(0, d - 1))}
            disabled={dayOffset === 0}
            aria-label="Previous day"
            className="rounded-full p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-200 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[11rem] text-center text-[12px] text-zinc-300">
            {new Date(dayStart).toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </span>
          <button
            type="button"
            onClick={() => setDayOffset((d) => Math.min(59, d + 1))}
            disabled={dayOffset >= 59}
            aria-label="Next day"
            className="rounded-full p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-200 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      }
      tray={held ? <HoldTray held={held} bookedBy={bookedBy} onName={setBookedBy} onConfirm={confirm} onAbandon={abandon} working={working} /> : undefined}
    >
      <div className="mx-auto max-w-2xl">
        {error && (
          <p className="mb-4 flex items-start gap-2 rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[12px] text-rose-200">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-10 text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : slots.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-zinc-500">
            Nothing free on this day. Try another.
          </p>
        ) : (
          <div className="flex flex-wrap justify-center gap-1.5">
            {slots.map((slot) => {
              const active = held?.start === slot.start;
              return (
                <button
                  key={slot.start}
                  type="button"
                  // While a hold is live the tray is the only way forward: re-clicking the held
                  // slot would ask deltat for a second hold on a span this same person holds, and
                  // get a conflict error for it.
                  disabled={working || held !== null}
                  onClick={() => pick(slot)}
                  className={cn(PILL_BASE, active ? PILL_ACTIVE : PILL_IDLE)}
                >
                  {formatTime(slot.start)}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Stage>
  );
}

function HoldTray({
  held,
  bookedBy,
  onName,
  onConfirm,
  onAbandon,
  working,
}: {
  held: Held;
  bookedBy: string;
  onName: (v: string) => void;
  onConfirm: () => void;
  onAbandon: () => void;
  working: boolean;
}) {
  const [remaining, setRemaining] = useState(() => held.expiresAt - Date.now());

  useEffect(() => {
    const tick = setInterval(() => setRemaining(held.expiresAt - Date.now()), 1000);
    return () => clearInterval(tick);
  }, [held.expiresAt]);

  const seconds = Math.max(0, Math.floor(remaining / 1000));
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span className="text-[12px] text-zinc-400">
        {formatTime(held.start)} held for <span className="tabular-nums text-emerald-300">{clock}</span>
      </span>
      <input
        value={bookedBy}
        onChange={(e) => onName(e.target.value)}
        placeholder="Your name"
        maxLength={80}
        className="w-40 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-400/40"
      />
      <button
        type="button"
        onClick={onConfirm}
        disabled={working || seconds === 0 || bookedBy.trim().length === 0}
        className={cn("rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors", ACCENT_CTA)}
      >
        {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirm"}
      </button>
      <button
        type="button"
        onClick={onAbandon}
        disabled={working}
        className="rounded-full px-3 py-1.5 text-[12px] text-zinc-500 hover:text-zinc-300"
      >
        Cancel
      </button>
    </div>
  );
}
