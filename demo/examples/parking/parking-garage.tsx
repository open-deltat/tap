"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Stage } from "@/components/stage";
import { BookingConfirmedModal, type BookingResult } from "@/components/booking-confirmed-modal";
import { ParkingControls, DURATIONS } from "./parking-controls";
import { ParkingGrid, type ZoneTile } from "./parking-grid";
import { toLocalDateString, formatTime } from "@/lib/time";
import { formatError } from "@open-deltat/examples/lib/format-error";
import type { Resource } from "@open-deltat/examples/lib/schemas";

import { getResources } from "@open-deltat/examples/actions/resources";
import { getAvailability } from "@open-deltat/examples/actions/availability";
import { getMultiResourceBookings, bookSlot } from "@open-deltat/examples/actions/bookings";

function nowTime(): string {
  const now = new Date();
  const totalMin = now.getHours() * 60 + Math.ceil(now.getMinutes() / 15) * 15;
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

interface ParkingGarageProps {
  garageId: string;
}

export function ParkingGarage({ garageId }: ParkingGarageProps) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const [date] = useState(toLocalDateString(new Date()));
  const [startTime, setStartTime] = useState(nowTime());
  const [duration, setDuration] = useState(120);

  // Per-zone derived state for the selected window.
  const [tiles, setTiles] = useState<Map<string, { remaining: number; closed: boolean }>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);

  // Structure: floors are direct children of the garage; zones are capacity-N children of a floor.
  const floors = resources.filter((r) => r.parentId === garageId);
  const zones = resources.filter((r) => floors.some((f) => f.id === r.parentId));

  function windowMs(): { start: number; end: number } {
    const [h, m] = startTime.split(":").map(Number);
    const d = new Date(`${date}T00:00:00`);
    d.setHours(h, m, 0, 0);
    const start = d.getTime();
    return { start, end: start + duration * 60_000 };
  }

  const refresh = useCallback(
    async (zoneList: Resource[], start: number, end: number) => {
      if (zoneList.length === 0) return;
      const ids = zoneList.map((z) => z.id);
      const [bookMap, availLists] = await Promise.all([
        getMultiResourceBookings(ids),
        Promise.all(zoneList.map((z) => getAvailability(z.id, start, end))),
      ]);

      const next = new Map<string, { remaining: number; closed: boolean }>();
      zoneList.forEach((z, i) => {
        const overlapping = (bookMap[z.id] ?? []).filter((b) => b.start < end && b.end > start);
        const remaining = Math.max(0, z.capacity - overlapping.length);
        // Closed = a blocking rule leaves no available time covering the requested window.
        const slots = availLists[i];
        const covered = slots.some((s) => s.start <= start && s.end >= end);
        next.set(z.id, { remaining, closed: !covered });
      });
      setTiles(next);
    },
    []
  );

  // Seed-derived resources + initial load.
  useEffect(() => {
    (async () => {
      try {
        const all = await getResources();
        setResources(all);
        const fs = all.filter((r) => r.parentId === garageId);
        const zs = all.filter((r) => fs.some((f) => f.id === r.parentId));
        const { start, end } = windowMs();
        await refresh(zs, start, end);
      } catch {
        toast.error("Failed to connect to Δt. Is it running?");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recompute when the requested window changes.
  useEffect(() => {
    if (!zones.length) return;
    const { start, end } = windowMs();
    startTransition(() => void refresh(zones, start, end));
    setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTime, duration, resources]);

  const zoneTiles: ZoneTile[] = zones.map((z) => {
    const floor = floors.find((f) => f.id === z.parentId);
    const t = tiles.get(z.id);
    return {
      id: z.id,
      name: z.name ?? z.id,
      floorName: floor?.name ?? "",
      capacity: z.capacity,
      remaining: t?.remaining ?? z.capacity,
      price: z.price ?? 0,
      closed: t?.closed ?? false,
    };
  });

  const grouped = floors.map((f) => ({
    name: f.name ?? f.id,
    zones: zoneTiles.filter((z) => z.floorName === (f.name ?? f.id)),
  }));

  const selected = zoneTiles.find((z) => z.id === selectedId) ?? null;
  const totalCapacity = zoneTiles.reduce((n, z) => n + z.capacity, 0);
  const totalRemaining = zoneTiles.reduce((n, z) => n + z.remaining, 0);
  const durLabel = DURATIONS.find((d) => d.minutes === duration)?.label ?? `${duration}m`;

  function book() {
    if (!selected) return;
    const { start, end } = windowMs();
    const selRes = zones.find((z) => z.id === selected.id);
    const label = `${selected.name} · ${durLabel}`;
    startTransition(async () => {
      try {
        const created = await bookSlot({ resourceId: selected.id, start, end, label });
        setResult({
          title: `1 spot · ${selected.name}`,
          subtitle: `${selected.floorName} · ${formatTime(start)} – ${formatTime(end)}`,
          bookings: [created],
          resources: selRes ? [selRes] : undefined,
        });
        setSelectedId(null);
        await refresh(zones, start, end);
      } catch (err) {
        toast.error(formatError(err instanceof Error ? err.message : String(err)));
        await refresh(zones, start, end);
      }
    });
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0a0a0c] text-zinc-400">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Connecting to Δt…
        </div>
      </div>
    );
  }

  const { start: winStart, end: winEnd } = windowMs();
  const ribbon = (
    <ParkingControls
      startTime={startTime}
      onStartTimeChange={setStartTime}
      duration={duration}
      onDurationChange={setDuration}
      summary={`${totalRemaining.toLocaleString()} of ${totalCapacity.toLocaleString()} spots free for ${formatTime(winStart)} – ${formatTime(winEnd)} across ${zones.length} zones`}
    />
  );

  const tray = selected ? (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-zinc-100">
          {selected.floorName} · {selected.name}
        </div>
        <div className="text-xs text-zinc-400">
          {selected.remaining.toLocaleString()} of {selected.capacity} free
          {selected.price > 0 && ` · $${selected.price}/hr`}
        </div>
      </div>
      <Button
        onClick={book}
        disabled={isPending || selected.remaining <= 0 || selected.closed}
        className="bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-40"
      >
        Park here
        {selected.price > 0 && ` · $${(selected.price * (duration / 60)).toFixed(0)}`}
      </Button>
    </div>
  ) : undefined;

  return (
    <>
      <Stage
        primitive={{ label: "Grab a spot before the zone fills", specId: "AVAIL-05" }}
        title="Downtown Garage"
        ribbon={ribbon}
        tray={tray}
      >
        <ParkingGrid floors={grouped} selectedId={selectedId} onSelect={(id) => setSelectedId(id === selectedId ? null : id)} />

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
          <Legend color="bg-emerald-500" label="plenty" />
          <Legend color="bg-amber-500" label="filling" />
          <Legend color="bg-rose-500" label="nearly full" />
          <Legend color="bg-zinc-700" label="full / closed" />
          <span className="text-zinc-600">one zone is closed for maintenance tonight</span>
        </div>
      </Stage>

      <BookingConfirmedModal
        result={result}
        onClose={() => setResult(null)}
        onBookAnother={() => setResult(null)}
      />

      {isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Working…
          </div>
        </div>
      )}
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  );
}
