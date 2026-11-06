"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelCalendarBooking,
  deleteCalendar,
  renameCalendar,
} from "@open-deltat/examples/actions/my-bookables";

export function RenameField({ id, initialName }: { id: string; initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (name.trim() === initialName) return;
    setError(null);
    start(async () => {
      const result = await renameCalendar(id, name);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          maxLength={60}
          className="w-full rounded-md border bg-transparent px-3 py-1.5 text-lg font-semibold"
          aria-label="Calendar name"
        />
        {pending ? <span className="text-xs text-muted-foreground">saving…</span> : null}
      </div>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

export function CancelBookingButton({ id, bookingId }: { id: string; bookingId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await cancelCalendarBooking(id, bookingId);
          router.refresh();
        })
      }
      className="text-xs text-destructive underline underline-offset-2 disabled:opacity-60"
    >
      {pending ? "cancelling…" : "cancel"}
    </button>
  );
}

export function DeleteCalendarButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="text-sm text-dt-ink-3 underline underline-offset-4 transition-colors hover:text-destructive"
      >
        Delete calendar
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Delete “{name}” and all its bookings?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await deleteCalendar(id);
            if (result.ok) router.push("/dashboard");
          })
        }
        className="h-9 rounded-full bg-destructive px-4 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "deleting…" : "Yes, delete"}
      </button>
      <button type="button" onClick={() => setArmed(false)} className="text-xs underline">
        keep it
      </button>
    </div>
  );
}
