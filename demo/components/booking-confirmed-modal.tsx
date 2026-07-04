"use client";

import { Check, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/time";
import type { Booking, Resource } from "@open-deltat/examples/lib/schemas";

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
 * The single success surface for every demo (replaces per-demo toasts and the old
 * right-hand calendar): a human receipt plus the verbatim deltat record you can inspect.
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-500">
              <Check className="h-4 w-4" />
            </span>
            <DialogTitle>{result?.title}</DialogTitle>
          </div>
          {result?.subtitle && (
            <p className="text-sm text-muted-foreground">{result.subtitle}</p>
          )}
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">What Δt saved</span>
            {isBatch && (
              <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">
                all booked together · {result?.bookings.length ?? 0} rows · all or nothing
              </span>
            )}
          </div>

          <div className="max-h-64 space-y-2 overflow-auto">
            {result?.bookings.map((booking) => {
              const resource = resourceById.get(booking.resourceId);
              const cfg = [
                resource && resource.capacity > 1 ? `capacity ${resource.capacity}` : null,
                resource && resource.bufferMinutes > 0 ? `buffer ${resource.bufferMinutes}m` : null,
              ].filter(Boolean).join(" · ");
              return (
                <div
                  key={booking.id}
                  className="rounded-md border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed"
                >
                  <Field label="id" value={booking.id} copyable />
                  <Field label="resource" value={booking.resourceId} note={resource?.name ?? undefined} />
                  <Field label="time (ms)" value={`[${booking.start}, ${booking.end})`} />
                  <Field
                    label="time"
                    value={`[${formatTime(booking.start)}, ${formatTime(booking.end)})`}
                  />
                  {booking.label && <Field label="label" value={booking.label} />}
                  {cfg && <Field label="settings" value={cfg} />}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => result && console.log("deltat bookings:", result.bookings)}
          >
            Log to console
          </Button>
          <Button size="sm" onClick={() => (onBookAnother ?? onClose)()}>
            Book another
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  note,
  copyable,
}: {
  label: string;
  value: string;
  note?: string;
  copyable?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="break-all text-foreground">{value}</span>
      {note && <span className="shrink-0 text-muted-foreground/60">{`// ${note}`}</span>}
      {copyable && (
        <button
          type="button"
          className="ml-auto shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => navigator.clipboard?.writeText(value)}
          aria-label="Copy id"
        >
          <Copy className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
