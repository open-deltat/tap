"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setBookingMode } from "@open-deltat/examples/actions/my-bookables";

// How a visitor gets onto this calendar: book directly, or ask and wait for the owner to approve.
export function BookingMode({ id, initial }: { id: string; initial: "instant" | "request" }) {
  const [mode, setMode] = useState(initial);
  const [pending, start] = useTransition();

  const toggle = (approveEach: boolean) => {
    const previous = mode;
    const next = approveEach ? "request" : "instant";
    setMode(next); // optimistic, like the sign-in toggle beside it
    start(async () => {
      const result = await setBookingMode(id, next);
      if (!result.ok) {
        setMode(previous);
        toast.error(result.error);
        return;
      }
      toast.success(approveEach ? "Visitors now send requests; you approve each meeting." : "Visitors now book directly.");
    });
  };

  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={mode === "request"}
        disabled={pending}
        onChange={(e) => toggle(e.target.checked)}
        className="accent-primary mt-0.5 size-4"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">Approve each meeting</span>
        <span className="text-muted-foreground text-xs">
          Visitors sign in and ask for a time instead of booking it. Nothing is reserved while you
          decide; approving books it, and if someone took the time meanwhile you are told instead.
          Requests appear under Requests, and at NOTIFY_WEBHOOK_URL if the site has one.
        </span>
      </span>
    </label>
  );
}
