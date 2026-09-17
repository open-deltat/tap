"use client";

import { useState, useTransition } from "react";
import { WeekHoursEditor } from "@open-deltat/examples/components/week-hours-editor";
import { saveCalendarAvailability } from "@open-deltat/examples/actions/my-bookables";
import type { WeekHours } from "@open-deltat/examples/builder";

// Kept in sync with ALLOWED_SLOT_MINUTES in bookable-service (a server-only module we must not pull
// into the client bundle); the server action re-validates against the authoritative list.
const SLOT_OPTIONS = [15, 30, 60, 90, 120] as const;

// Set a calendar's availability in one place: the weekly open hours, how long each bookable slot
// is, and what a slot costs. Saving expands the hours into deltat rules and stores the slot length
// and price. Re-openable any time; this is the edit surface, not just the create one.

export function AvailabilityEditor({
  id,
  initialWeek,
  initialSlotMinutes,
  initialPriceCents,
  currency,
}: {
  id: string;
  initialWeek: WeekHours;
  initialSlotMinutes: number;
  initialPriceCents: number | null;
  currency: string;
}) {
  const [week, setWeek] = useState<WeekHours>(initialWeek);
  const [slotMinutes, setSlotMinutes] = useState(initialSlotMinutes);
  const [price, setPrice] = useState(initialPriceCents === null ? "" : (initialPriceCents / 100).toString());
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);

  const save = () => {
    setStatus(null);
    const trimmed = price.trim();
    const priceCents = trimmed === "" ? null : Math.round(Number(trimmed) * 100);
    if (priceCents !== null && (!Number.isFinite(priceCents) || priceCents < 0)) {
      setStatus({ kind: "error", msg: "Enter a price like 40, or leave it blank for free." });
      return;
    }
    start(async () => {
      const result = await saveCalendarAvailability(id, { week, slotMinutes, priceCents, currency });
      setStatus(
        result.ok
          ? { kind: "ok", msg: "Availability saved." }
          : { kind: "error", msg: result.error }
      );
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Slot length</span>
          <select
            value={slotMinutes}
            onChange={(e) => setSlotMinutes(Number(e.target.value))}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            {SLOT_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Price per slot ({currency})</span>
          <input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Free"
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Weekly hours</span>
        <WeekHoursEditor week={week} onChange={setWeek} />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="w-fit rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save availability"}
        </button>
        {status ? (
          <span className={status.kind === "ok" ? "text-sm text-green-600" : "text-sm text-red-600"}>
            {status.msg}
          </span>
        ) : null}
      </div>
    </div>
  );
}
