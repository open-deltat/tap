"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { RealtimeSeatClient } from "@/components/realtime-seat-client";
import type { Resource } from "@/lib/schemas";
import { toLocalDateString, formatTime } from "@/lib/time";
import { buildSections, allSeatIds } from "@/lib/seat-sections";
import { seedAirline } from "@/app/actions/seed-airline";
import { getResources } from "@/app/actions/resources";
import { getAvailability } from "@/app/actions/availability";

export default function RealtimePage() {
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState<Resource[]>([]);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ start: number; end: number } | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const ids = await seedAirline();
        const all = await getResources();
        setResources(all);

        const vid = ids[0];
        setVenueId(vid);

        const today = toLocalDateString(new Date());
        const dayStart = new Date(`${today}T00:00`).getTime();
        const dayEnd = dayStart + 86_400_000;

        let slots = await getAvailability(vid, dayStart, dayEnd);

        // If no slots today, try tomorrow
        if (slots.length === 0) {
          const tomorrow = new Date(dayStart + 86_400_000);
          const tmrStart = tomorrow.getTime();
          slots = await getAvailability(vid, tmrStart, tmrStart + 86_400_000);
        }

        if (slots.length > 0) {
          setSlot({ start: slots[0].start, end: slots[0].end });
        }
      } catch (err) {
        console.error("Failed to init:", err);
        toast.error("Failed to connect to deltat. Is it running?");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Connecting to deltat...
        </div>
      </div>
    );
  }

  if (!venueId || !slot) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted-foreground">No available flights found</div>
      </div>
    );
  }

  const venue = resources.find((r) => r.id === venueId);
  const sections = buildSections(venueId, resources);
  const seatIds = allSeatIds(sections);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4 text-center">
        <div className="text-lg font-semibold">{venue?.name ?? "Flight"}</div>
        <div className="text-sm text-muted-foreground">
          {formatTime(slot.start)} – {formatTime(slot.end)}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Click a seat on either side to place a 15-minute hold. The other side updates in real-time.
        </div>
      </div>

      <div className="flex flex-1 overflow-auto">
        <RealtimeSeatClient
          clientLabel="Client A"
          clientColor="bg-violet-100 text-violet-700"
          venueId={venueId}
          sections={sections}
          seatIds={seatIds}
          slotStart={slot.start}
          slotEnd={slot.end}
        />

        <div className="w-px bg-border shrink-0" />

        <RealtimeSeatClient
          clientLabel="Client B"
          clientColor="bg-sky-100 text-sky-700"
          venueId={venueId}
          sections={sections}
          seatIds={seatIds}
          slotStart={slot.start}
          slotEnd={slot.end}
        />
      </div>
    </div>
  );
}
