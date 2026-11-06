"use client";

import { ChevronDown, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
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
 * The single success surface for every demo, and the peak of each one: the tick draws itself, the
 * booking is said in plain words, and the verbatim Δt record sits one tap below for anyone who
 * wants to see exactly what was stored.
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
  const count = result?.bookings.length ?? 0;

  return (
    <Dialog open={result != null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="gap-0 overflow-hidden rounded-[28px] border-dt-line bg-dt-surface p-0 text-dt-ink shadow-dt-float sm:max-w-md">
        <div className="flex flex-col items-center px-7 pb-6 pt-9 text-center">
          <svg viewBox="0 0 56 56" className="h-14 w-14 text-dt-accent" aria-hidden>
            <circle className="dt-draw-ring" cx="28" cy="28" r="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" transform="rotate(-90 28 28)" />
            <path className="dt-draw-tick" d="M18.5 28.5l6.5 6.5 12.5-13" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <DialogTitle className="mt-5 text-balance text-xl font-semibold tracking-tight">{result?.title}</DialogTitle>
          <DialogDescription className="mt-1.5 text-[14px] tabular-nums text-dt-ink-2">
            {result?.subtitle ?? "Booked."}
          </DialogDescription>
          <p className="mt-4 text-[12.5px] text-dt-ink-3">
            {count > 1 ? `${count} bookings written in one step: all of them or none.` : "Written once. Nobody else can hold this time now."}
          </p>
        </div>

        <details className="group border-t border-dt-line">
          <summary className="flex h-12 cursor-pointer list-none items-center justify-between px-7 text-[13px] font-medium text-dt-ink-2 hover:text-dt-ink [&::-webkit-details-marker]:hidden">
            What Δt stored
            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="max-h-60 space-y-2 overflow-auto px-5 pb-5">
            {result?.bookings.map((booking) => {
              const resource = resourceById.get(booking.resourceId);
              const cfg = [
                resource && resource.capacity > 1 ? `capacity ${resource.capacity}` : null,
                resource && resource.bufferMinutes > 0 ? `buffer ${resource.bufferMinutes}m` : null,
              ].filter(Boolean).join(" · ");
              return (
                <div key={booking.id} className="rounded-2xl bg-dt-sunken p-3.5 font-mono text-[11px] leading-relaxed">
                  <Field label="id" value={booking.id} copyable />
                  <Field label="resource" value={booking.resourceId} note={resource?.name ?? undefined} />
                  <Field label="span (ms)" value={`[${booking.start}, ${booking.end})`} />
                  <Field label="span" value={`[${formatTime(booking.start)}, ${formatTime(booking.end)})`} />
                  {booking.label && <Field label="label" value={booking.label} />}
                  {cfg && <Field label="settings" value={cfg} />}
                </div>
              );
            })}
          </div>
        </details>

        <div className="border-t border-dt-line p-4">
          <Button onClick={() => (onBookAnother ?? onClose)()} className={`h-11 w-full text-[14px] font-semibold ${ACCENT_CTA}`}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, note, copyable }: { label: string; value: string; note?: string; copyable?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-20 shrink-0 text-dt-ink-3">{label}</span>
      <span className="break-all text-dt-ink">{value}</span>
      {note && <span className="shrink-0 text-dt-ink-3">{`// ${note}`}</span>}
      {copyable && (
        <button
          type="button"
          className="relative ml-auto shrink-0 text-dt-ink-3 transition-colors after:absolute after:-inset-2.5 hover:text-dt-ink"
          onClick={() => navigator.clipboard?.writeText(value)}
          aria-label="Copy id"
        >
          <Copy className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
