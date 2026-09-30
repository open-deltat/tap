"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setRequireLoginToBook } from "@open-deltat/examples/actions/my-bookables";

// Who may BOOK. The schedule itself is always public to read, so a calendar is never a locked page;
// this gates only the write. Default on: an account makes every booking attributable (a no-show has
// someone to follow up with) and is the platform's main organic sign-up path.
export function BookingAccess({ id, initial }: { id: string; initial: boolean }) {
  const [required, setRequired] = useState(initial);
  const [pending, start] = useTransition();

  const toggle = (next: boolean) => {
    const previous = required;
    setRequired(next); // optimistic: the control should feel instant
    start(async () => {
      const result = await setRequireLoginToBook(id, next);
      if (!result.ok) {
        setRequired(previous);
        toast.error(result.error);
        return;
      }
      toast.success(next ? "Visitors must sign in to book." : "Anyone can book without an account.");
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={required}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
          className="accent-primary mt-0.5 size-4"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Require sign-in to book</span>
          <span className="text-muted-foreground text-xs">
            Anyone can always see the schedule. With this on, booking a slot asks the visitor to sign
            in first, so every booking has a real account behind it.
          </span>
        </span>
      </label>
    </div>
  );
}
