"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Clock, Loader2, Save, Tag } from "lucide-react";
import { WeekHoursEditor } from "@open-deltat/examples/components/week-hours-editor";
import { saveCalendarAvailability } from "@open-deltat/examples/actions/my-bookables";
import type { WeekHours } from "@open-deltat/examples/builder";
import { Button } from "@open-deltat/examples/components/ui/button";
import { Input } from "@open-deltat/examples/components/ui/input";
import { Label } from "@open-deltat/examples/components/ui/label";
import { InfoHint } from "@/components/ui/tooltip";

// Kept in sync with ALLOWED_SLOT_MINUTES in bookable-service (server-only; not imported into the
// client bundle). The server action re-validates against the authoritative list.
const SLOT_OPTIONS = [15, 30, 60, 90, 120] as const;

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

  const save = () => {
    const trimmed = price.trim().replace(",", ".");
    if (trimmed !== "" && !/^\d+(\.\d{1,2})?$/.test(trimmed)) {
      toast.error("Enter a price like 40 or 39.99, or leave it blank for free.");
      return;
    }
    const priceCents = trimmed === "" ? null : Math.round(Number(trimmed) * 100);
    start(async () => {
      const result = await saveCalendarAvailability(id, { week, slotMinutes, priceCents, currency });
      if (result.ok) toast.success("Availability saved.");
      else toast.error(result.error);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="flex items-center gap-1.5">
            <Clock className="text-muted-foreground size-3.5" />
            Slot length
            <InfoHint>How long each bookable appointment is. A day of open hours is divided into slots of this length.</InfoHint>
          </Label>
          <select
            value={slotMinutes}
            onChange={(e) => setSlotMinutes(Number(e.target.value))}
            className="border-input bg-background focus-visible:ring-ring/50 h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
          >
            {SLOT_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="price" className="flex items-center gap-1.5">
            <Tag className="text-muted-foreground size-3.5" />
            Price per slot ({currency})
            <InfoHint>Shown to bookers. Charging is coming; for now it is displayed, not collected.</InfoHint>
          </Label>
          <Input
            id="price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Free"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="flex items-center gap-1.5">
          Weekly hours
          <InfoHint>The days and times this calendar is open. Bookers can only take slots inside these windows.</InfoHint>
        </Label>
        <WeekHoursEditor week={week} onChange={setWeek} />
      </div>

      <Button type="button" onClick={save} disabled={pending} className="w-fit">
        {pending ? <Loader2 className="animate-spin" /> : <Save />}
        {pending ? "Saving…" : "Save availability"}
      </Button>
    </div>
  );
}
