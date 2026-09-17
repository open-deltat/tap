"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarCheck, Clock, Loader2 } from "lucide-react";
import { Calendar } from "@open-deltat/examples/components/ui/calendar";
import { Button } from "@open-deltat/examples/components/ui/button";
import { Input } from "@open-deltat/examples/components/ui/input";
import {
  commitPublicHold,
  getPublicSlots,
  holdPublicSlot,
  releasePublicHold,
} from "@open-deltat/examples/actions/public-booking";
import {
  beaconReleaseHold,
  forgetHold,
  rememberHold,
  takeAbandonedHold,
} from "@open-deltat/examples/lib/hold-release";
import type { BookableRecord } from "@open-deltat/examples/lib/public-bookables";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// The prime public booking UI: a month calendar and the selected day's time slots, then hold →
// confirm. Bound to the real calendar's availability (deltat), theme-aware, with the owner's slot
// length and price. This is what anyone — or an AI agent — sees at /b/<id>.

const DAY_MS = 86_400_000;
interface Slot {
  start: number;
  end: number;
}
interface Held extends Slot {
  holdId: string;
  expiresAt: number;
}

function sliceIntoSlots(spans: Slot[], slotMs: number, notBefore: number): Slot[] {
  return spans.flatMap((span) => {
    const out: Slot[] = [];
    for (let s = span.start; s + slotMs <= span.end; s += slotMs) {
      if (s >= notBefore) out.push({ start: s, end: s + slotMs });
    }
    return out;
  });
}

export function AppointmentsBooker({ record }: { record: BookableRecord }) {
  const slotMs = record.slotMinutes * 60_000;
  const [date, setDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [month, setMonth] = useState<Date>(date);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [held, setHeld] = useState<Held | null>(null);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();

  // The hold that still owes a release, in a ref rather than state so the teardown listener and the
  // unmount cleanup read the current value instead of the one captured when they were registered.
  const outstanding = useRef<string | null>(null);

  const tz = record.timezone;
  const time = useCallback(
    (ms: number) => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(ms),
    [tz]
  );
  const priceLabel = useMemo(() => {
    if (record.priceCents === null) return "Free";
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: record.currency }).format(record.priceCents / 100);
    } catch {
      return `${(record.priceCents / 100).toFixed(2)} ${record.currency}`;
    }
  }, [record.priceCents, record.currency]);

  const load = useCallback(async () => {
    setLoading(true);
    const dayStart = date.getTime();
    const spans = await getPublicSlots(record.id, dayStart, dayStart + DAY_MS);
    setSlots(sliceIntoSlots(spans, slotMs, Date.now()));
    setLoading(false);
  }, [date, record.id, slotMs]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Stop tracking a hold without touching it. For an id that is already spent or already gone. */
  const dropHold = useCallback(() => {
    outstanding.current = null;
    forgetHold(record.id);
  }, [record.id]);

  /** Hand the slot back now rather than at the TTL. Safe to call with nothing outstanding. */
  const releaseOutstanding = useCallback(() => {
    const holdId = outstanding.current;
    dropHold();
    if (holdId) void releasePublicHold(record.id, holdId);
  }, [dropHold, record.id]);

  // The in-app path, unchanged in effect: React really does unmount on a client-side navigation, so
  // the action has a live document to run in and the slot comes back in milliseconds.
  useEffect(() => releaseOutstanding, [releaseOutstanding]);

  // A hold this tab placed before a reload or a crash. The teardown beacon below usually got there
  // first and release is idempotent, so this costs a round trip in the common case and is the only
  // thing that works at all when the tab was killed without running any handler. Releasing then
  // reloading, so the visitor sees the slot they just gave back rather than their own ghost.
  //
  // Guarded to one sweep per bookable: `load` is in the deps so the reload is never stale, but that
  // makes the effect re-run whenever the date changes, and a sweep at that point could take the note
  // for a hold placed seconds ago rather than one left by a dead document.
  const swept = useRef<string | null>(null);
  useEffect(() => {
    if (swept.current === record.id) return;
    swept.current = record.id;
    const abandoned = takeAbandonedHold(record.id);
    if (!abandoned) return;
    void releasePublicHold(record.id, abandoned).then(load);
  }, [record.id, load]);

  useEffect(() => {
    // `pagehide` is the last event a document gets before a reload, a close, or a navigation away.
    // `visibilitychange` would also fire on a plain tab switch, which must NOT release: a hold is
    // sized to survive someone leaving to check with a colleague.
    const onPageHide = () => {
      const holdId = outstanding.current;
      // The note in sessionStorage deliberately stays put. sendBeacon reports that the browser
      // accepted the beacon, never that it arrived, so the next mount's sweep is still the backstop.
      if (holdId) beaconReleaseHold(record.id, holdId);
    };
    // Coming back through bfcache restores the live page with its hold state intact, but the hold
    // itself went out with the beacon. Drop it so the UI stops claiming a slot we no longer have.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      dropHold();
      setHeld(null);
      void load();
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [record.id, dropHold, load]);

  const pickSlot = (slot: Slot) => {
    start(async () => {
      const result = await holdPublicSlot(record.id, slot.start, slot.end);
      if (!result.ok) {
        toast.error(result.error);
        void load();
        return;
      }
      const { holdId, expiresAt } = result.value;
      // Recorded before the render, so a teardown one tick later already finds it.
      outstanding.current = holdId;
      rememberHold(record.id, { holdId, expiresAt });
      setHeld({ ...slot, holdId, expiresAt });
    });
  };

  const confirm = () => {
    if (!held) return;
    start(async () => {
      const result = await commitPublicHold(record.id, held.holdId, name.trim());
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Booked! You're confirmed.");
      // Drop, never release: committing spends the hold id, so anything that swept it later would
      // be a round trip that can only fail.
      dropHold();
      setHeld(null);
      setName("");
      void load();
    });
  };

  const cancelHold = () => {
    releaseOutstanding();
    setHeld(null);
    setName("");
  };

  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: tz }).format(date);

  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-[auto_1fr]">
        <div className="sm:border-r sm:pr-6">
          <Calendar
            mode="single"
            required
            selected={date}
            onSelect={(d) => {
              if (!d) return;
              const next = new Date(d);
              next.setHours(0, 0, 0, 0);
              setDate(next);
              // Walking to another day abandons the hold as surely as pressing Back does.
              releaseOutstanding();
              setHeld(null);
            }}
            month={month}
            onMonthChange={setMonth}
            startMonth={new Date()}
            disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
            className="bg-transparent p-0"
          />
        </div>

        <div className="flex min-h-80 flex-col">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm font-medium">{dateLabel}</span>
            <Badge variant="muted" className="gap-1">
              <Clock className="size-3" />
              {record.slotMinutes}m · {priceLabel}
            </Badge>
          </div>

          {held ? (
            <div className="bg-muted/40 flex flex-1 flex-col justify-center gap-4 rounded-lg border p-6">
              <div className="text-center">
                <p className="text-muted-foreground text-sm">Holding your slot</p>
                <p className="text-lg font-semibold">
                  {dateLabel.split(",")[0]} at {time(held.start)}
                </p>
                <p className="text-muted-foreground text-xs">{priceLabel}</p>
              </div>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={60}
                autoFocus
              />
              <div className="flex gap-2">
                <Button onClick={confirm} disabled={pending} className="flex-1">
                  {pending ? <Loader2 className="animate-spin" /> : <CalendarCheck />}
                  Confirm booking
                </Button>
                <Button variant="ghost" onClick={cancelHold} disabled={pending}>
                  Back
                </Button>
              </div>
            </div>
          ) : loading ? (
            <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
              <Loader2 className="mr-2 size-4 animate-spin" /> Loading…
            </div>
          ) : slots.length === 0 ? (
            <div className="text-muted-foreground flex flex-1 items-center justify-center rounded-lg border border-dashed text-center text-sm">
              Nothing open this day. Try another.
            </div>
          ) : (
            <div className="grid max-h-96 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
              {slots.map((s) => (
                <button
                  key={s.start}
                  onClick={() => pickSlot(s)}
                  disabled={pending}
                  className="hover:border-primary/40 hover:bg-accent rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {time(s.start)}
                </button>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
