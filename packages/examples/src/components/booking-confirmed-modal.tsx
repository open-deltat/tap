"use client";

import { Check, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { cn } from "@open-deltat/shared/utils";
import { formatTime } from "@open-deltat/shared/time";
import { ACCENT_CTA } from "../lib/accent";
import type { Booking, Resource } from "../lib/schemas";

export interface BookingResult {
  /** Human headline, e.g. "2 seats · AA-100 JFK → LAX". */
  title: string;
  /** Optional human time range under the title. */
  subtitle?: string;
  /** The rows deltat actually persisted. */
  bookings: Booking[];
  /** Resources referenced by the bookings, for resolving names + capacity/buffer. */
  resources?: Resource[];
}

/**
 * The single success surface for every demo: a human receipt on top, then the verbatim deltat record
 * you can inspect. Flat and ruled like the rest of the instrument, three sections split by hairlines.
 */
export function BookingConfirmedModal({
  result,
  onClose,
  onBookAnother,
}: {
  result: BookingResult | null;
  onClose: () => void;
  onBookAnother?: () => void;
}) {
  const resourceById = new Map((result?.resources ?? []).map((r) => [r.id, r]));
  const isBatch = (result?.bookings.length ?? 0) > 1;

  return (
    <Dialog open={result != null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-[3px] border-line-strong bg-panel p-0 text-ink shadow-none sm:max-w-md">
        <DialogHeader className="gap-1.5 border-b border-line p-5 text-left sm:text-left">
          <p className="flex items-center gap-1.5 font-mono text-xs text-signal">
            <Check aria-hidden className="size-3.5" strokeWidth={3} />
            booked
          </p>
          <DialogTitle className="text-balance pr-6 text-lg leading-snug font-medium tracking-tight">{result?.title}</DialogTitle>
          {result?.subtitle && <DialogDescription className="font-mono text-sm tabular-nums text-ink-2">{result.subtitle}</DialogDescription>}
        </DialogHeader>

        <section aria-label="What Δt saved" className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium text-ink-2">What Δt saved</h3>
            {isBatch && (
              <span className="rounded-[2px] bg-sky-400/15 px-1.5 py-0.5 font-mono text-[11px] text-sky-300">
                {result?.bookings.length ?? 0} rows · all or nothing
              </span>
            )}
          </div>

          <div className={cn("space-y-2", isBatch && "max-h-64 overflow-auto")}>
            {result?.bookings.map((booking) => {
              const resource = resourceById.get(booking.resourceId);
              const cfg = [
                resource && resource.capacity > 1 ? `capacity ${resource.capacity}` : null,
                resource && resource.bufferMinutes > 0 ? `buffer ${resource.bufferMinutes}m` : null,
              ].filter(Boolean).join(" · ");
              return (
                <dl key={booking.id} className="space-y-2.5 rounded-[2px] border border-line bg-canvas p-3.5 font-mono text-xs leading-relaxed">
                  <Field label="id" value={booking.id} copyable />
                  <Field label="resource" value={booking.resourceId} note={resource?.name ?? undefined} />
                  <Field label="time (ms)" value={`[${booking.start}, ${booking.end})`} />
                  <Field label="time" value={`[${formatTime(booking.start)}, ${formatTime(booking.end)})`} />
                  {booking.label && <Field label="label" value={booking.label} />}
                  {cfg && <Field label="settings" value={cfg} />}
                </dl>
              );
            })}
          </div>
        </section>

        <DialogFooter className="flex-col gap-2 border-t border-line p-5 sm:flex-col sm:space-x-0">
          <Button className={cn("h-11 w-full text-sm font-semibold sm:h-10", ACCENT_CTA)} onClick={() => (onBookAnother ?? onClose)()}>
            Book another
          </Button>
          <Button
            variant="ghost"
            className="h-11 w-full rounded-[3px] text-sm text-ink-2 hover:bg-line hover:text-ink sm:h-9"
            onClick={() => result && console.log("deltat bookings:", result.bookings)}
          >
            Log to console
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Label beside value on a roomy screen, above it on a phone, so a 26-character id wraps only when it
// truly cannot fit and the label does not take a third of the width.
function Field({ label, value, note, copyable }: { label: string; value: string; note?: string; copyable?: boolean }) {
  return (
    <div className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
      <dt className="text-ink-2">{label}</dt>
      <dd className="flex min-w-0 items-start gap-2 text-ink">
        <span className="min-w-0 flex-1 break-all">
          {value}
          {note && <span className="ml-2 text-ink-2">{`// ${note}`}</span>}
        </span>
        {copyable && (
          <button
            type="button"
            className="relative -my-0.5 grid size-6 shrink-0 place-items-center text-ink-2 transition-colors after:absolute after:-inset-2.5 hover:text-ink focus-visible:ring-2 focus-visible:ring-signal focus-visible:outline-none"
            onClick={() => navigator.clipboard?.writeText(value)}
            aria-label="Copy id"
          >
            <Copy aria-hidden className="size-3.5" />
          </button>
        )}
      </dd>
    </div>
  );
}
