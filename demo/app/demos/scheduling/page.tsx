"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Resource } from "@/lib/schemas";
import { toLocalDateString } from "@/lib/time";

import { getResources } from "@/app/actions/resources";
import { getCombinedAvailability } from "@/app/actions/availability";
import { batchBookSlots } from "@/app/actions/bookings";
import { usePersonalCalendar } from "@/components/personal-calendar-provider";
import { formatError } from "@/lib/format-error";

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

type ThresholdMode = "all" | "any" | "custom";

export default function SchedulingPage() {
  const { calendarId } = usePersonalCalendar();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Selected resource IDs (multi-select)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Threshold
  const [thresholdMode, setThresholdMode] = useState<ThresholdMode>("all");
  const [customThreshold, setCustomThreshold] = useState(2);

  // Date range
  const [date, setDate] = useState(toLocalDateString(new Date()));

  // Results
  const [slots, setSlots] = useState<{ start: number; end: number }[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Booking
  const [bookingSlot, setBookingSlot] = useState<{ start: number; end: number } | null>(null);
  const [bookingLabel, setBookingLabel] = useState("");

  // Compute threshold value
  const minAvailable =
    thresholdMode === "all"
      ? selectedIds.size
      : thresholdMode === "any"
        ? 1
        : Math.min(customThreshold, selectedIds.size);

  // Get leaf resources (no children — these are bookable)
  const leafResources = resources.filter(
    (r) => !resources.some((c) => c.parentId === r.id)
  );

  // Build tree structure for display
  const rootResources = resources.filter((r) => r.parentId === null);

  function getChildren(parentId: string): Resource[] {
    return resources.filter((r) => r.parentId === parentId);
  }

  function isLeaf(r: Resource): boolean {
    return !resources.some((c) => c.parentId === r.id);
  }

  function toggleResource(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setHasSearched(false);
  }

  // Select/deselect all leaves under a parent
  function toggleGroup(parentId: string) {
    const leaves = resources
      .filter((r) => r.parentId === parentId && isLeaf(r))
      .map((r) => r.id);
    if (leaves.length === 0) return;

    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = leaves.every((id) => next.has(id));
      if (allSelected) {
        for (const id of leaves) next.delete(id);
      } else {
        for (const id of leaves) next.add(id);
      }
      return next;
    });
    setHasSearched(false);
  }

  async function handleSearch() {
    if (selectedIds.size < 1) {
      toast.error("Select at least one resource");
      return;
    }
    startTransition(async () => {
      try {
        const dayStart = new Date(`${date}T00:00`).getTime();
        const dayEnd = dayStart + 86_400_000;
        const result = await getCombinedAvailability(
          Array.from(selectedIds),
          dayStart,
          dayEnd,
          minAvailable
        );
        setSlots(result);
        setHasSearched(true);
        if (result.length === 0) {
          toast.info("No combined availability found for that day");
        }
      } catch (err: any) {
        console.error(err);
        toast.error(formatError(err.message) ?? "Failed to compute availability");
      }
    });
  }

  async function handleBook() {
    if (!bookingSlot || selectedIds.size === 0) return;
    startTransition(async () => {
      try {
        const bookSlots = Array.from(selectedIds).map((resourceId) => ({
          resourceId,
          start: bookingSlot.start,
          end: bookingSlot.end,
          label: bookingLabel,
        }));
        if (calendarId) {
          const names = Array.from(selectedIds)
            .map((id) => resources.find((r) => r.id === id)?.name ?? id)
            .join(", ");
          bookSlots.push({
            resourceId: calendarId,
            start: bookingSlot.start,
            end: bookingSlot.end,
            label: `Schedule: ${names}`,
          });
        }
        await batchBookSlots(bookSlots);
        toast.success(
          `Booked ${bookSlots.length} resource${bookSlots.length > 1 ? "s" : ""} atomically`
        );
        setBookingSlot(null);
        setBookingLabel("");
        // Refresh
        handleSearch();
      } catch (err: any) {
        toast.error(formatError(err.message) ?? "Booking failed — conflict detected");
      }
    });
  }

  function prevDay() {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(toLocalDateString(d));
    setHasSearched(false);
  }

  function nextDay() {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    setDate(toLocalDateString(d));
    setHasSearched(false);
  }

  // Load resources on mount
  useEffect(() => {
    async function init() {
      try {
        const all = await getResources();
        setResources(all);
      } catch (err) {
        console.error("Failed to load resources:", err);
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

  // Render resource tree node
  function ResourceNode({ resource, depth }: { resource: Resource; depth: number }) {
    const children = getChildren(resource.id);
    const leaf = isLeaf(resource);
    const isSelected = selectedIds.has(resource.id);

    // For non-leaf: check if all/some/none of descendants are selected
    const descendantLeaves = leaf
      ? []
      : resources
          .filter((r) => {
            let p = r.parentId;
            while (p) {
              if (p === resource.id) return isLeaf(r);
              const parent = resources.find((x) => x.id === p);
              p = parent?.parentId ?? null;
            }
            return false;
          })
          .map((r) => r.id);
    const allDescSelected =
      descendantLeaves.length > 0 && descendantLeaves.every((id) => selectedIds.has(id));
    const someDescSelected =
      descendantLeaves.length > 0 && descendantLeaves.some((id) => selectedIds.has(id));

    return (
      <div>
        <button
          className={cn(
            "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted/50 transition-colors",
            leaf && isSelected && "bg-emerald-50 text-emerald-700",
            !leaf && allDescSelected && "text-emerald-700",
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            if (leaf) toggleResource(resource.id);
            else toggleGroup(resource.id);
          }}
        >
          {/* Checkbox indicator */}
          <div
            className={cn(
              "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]",
              leaf && isSelected && "border-emerald-500 bg-emerald-500 text-white",
              leaf && !isSelected && "border-muted-foreground/30",
              !leaf && allDescSelected && "border-emerald-500 bg-emerald-500 text-white",
              !leaf && someDescSelected && !allDescSelected && "border-emerald-500 bg-emerald-100",
              !leaf && !someDescSelected && "border-muted-foreground/30",
            )}
          >
            {(leaf ? isSelected : allDescSelected) && <Check className="h-3 w-3" />}
            {!leaf && someDescSelected && !allDescSelected && (
              <div className="h-1.5 w-1.5 rounded-sm bg-emerald-500" />
            )}
          </div>
          <span className={cn(!leaf && "font-medium")}>{resource.name}</span>
          {resource.price !== null && (
            <span className="ml-auto text-xs text-muted-foreground">${resource.price}</span>
          )}
        </button>
        {children.map((child) => (
          <ResourceNode key={child.id} resource={child} depth={depth + 1} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar — page title only, nav is in shared header */}
      <div className="sr-only">
        <h1>Multi-Resource Scheduling</h1>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: resource picker */}
        <div className="w-72 shrink-0 border-r flex flex-col">
          <div className="px-4 py-2 border-b">
            <div className="text-xs font-medium text-muted-foreground">
              Select resources ({selectedIds.size} selected)
            </div>
          </div>
          <div className="flex-1 overflow-auto py-1">
            {rootResources.map((r) => (
              <ResourceNode key={r.id} resource={r} depth={0} />
            ))}
          </div>

          {/* Threshold selector */}
          <div className="border-t p-4 space-y-3">
            <Label className="text-xs font-medium">Availability Mode</Label>
            <div className="flex gap-1">
              <Button
                variant={thresholdMode === "all" ? "default" : "outline"}
                size="sm"
                className="flex-1 text-xs"
                onClick={() => setThresholdMode("all")}
              >
                All Free
              </Button>
              <Button
                variant={thresholdMode === "any" ? "default" : "outline"}
                size="sm"
                className="flex-1 text-xs"
                onClick={() => setThresholdMode("any")}
              >
                Any Free
              </Button>
              <Button
                variant={thresholdMode === "custom" ? "default" : "outline"}
                size="sm"
                className="flex-1 text-xs"
                onClick={() => setThresholdMode("custom")}
              >
                At Least
              </Button>
            </div>
            {thresholdMode === "custom" && (
              <Input
                type="number"
                min={1}
                max={selectedIds.size || 1}
                value={customThreshold}
                onChange={(e) => setCustomThreshold(Number(e.target.value))}
                className="text-sm"
              />
            )}
            <div className="text-xs text-muted-foreground">
              {thresholdMode === "all" && "Find times when ALL selected resources are free simultaneously"}
              {thresholdMode === "any" && "Find times when ANY one selected resource is free"}
              {thresholdMode === "custom" && `Find times when at least ${minAvailable} resource${minAvailable > 1 ? "s are" : " is"} free`}
            </div>
          </div>
        </div>

        {/* Right: controls + results */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Date picker + search */}
          <div className="flex items-center gap-4 border-b px-6 py-3">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevDay}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                type="date"
                value={date}
                onChange={(e) => { setDate(e.target.value); setHasSearched(false); }}
                className="w-40 text-sm"
              />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextDay}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button
              onClick={handleSearch}
              disabled={selectedIds.size === 0 || isPending}
              size="sm"
            >
              Find Availability
            </Button>
            <div className="text-xs text-muted-foreground">
              {selectedIds.size} resource{selectedIds.size !== 1 ? "s" : ""} ·{" "}
              {thresholdMode === "all"
                ? "intersection"
                : thresholdMode === "any"
                  ? "union"
                  : `at least ${minAvailable}`}
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-auto p-6">
            {!hasSearched ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center space-y-2">
                  <div className="text-sm text-muted-foreground">
                    Select resources, pick a date, and click "Find Availability"
                  </div>
                  <div className="text-xs text-muted-foreground/70">
                    Try selecting a mechanic + a plane to find maintenance windows,
                    <br />
                    or select a pool of resources to see combined availability.
                  </div>
                </div>
              </div>
            ) : slots.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-sm text-muted-foreground">
                  No combined availability found for {new Date(date + "T00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                </div>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto space-y-3">
                <div className="text-sm font-medium">
                  {slots.length} available slot{slots.length !== 1 ? "s" : ""} on{" "}
                  {new Date(date + "T00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                </div>
                {slots.map((slot, i) => {
                  const duration = slot.end - slot.start;
                  const isSelected = bookingSlot?.start === slot.start && bookingSlot?.end === slot.end;

                  return (
                    <button
                      key={i}
                      className={cn(
                        "w-full rounded-lg border p-4 text-left transition-all",
                        isSelected
                          ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200"
                          : "border-border hover:border-emerald-300 hover:bg-emerald-50/50"
                      )}
                      onClick={() => {
                        setBookingSlot(isSelected ? null : slot);
                        setBookingLabel("");
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-semibold">
                            {formatTime(slot.start)} – {formatTime(slot.end)}
                          </span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {formatDuration(duration)}
                          </span>
                        </div>
                        {isSelected && (
                          <div className="text-xs font-medium text-emerald-600">Selected</div>
                        )}
                      </div>
                    </button>
                  );
                })}

                {/* Booking panel */}
                {bookingSlot && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-3">
                    <div className="text-sm font-medium">
                      Book {selectedIds.size} resource{selectedIds.size > 1 ? "s" : ""} ·{" "}
                      {formatTime(bookingSlot.start)} – {formatTime(bookingSlot.end)}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {Array.from(selectedIds).map((id) => {
                        const res = resources.find((r) => r.id === id);
                        return (
                          <span
                            key={id}
                            className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700"
                          >
                            {res?.name ?? id}
                          </span>
                        );
                      })}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="schedule-label" className="text-xs">
                        Label (optional)
                      </Label>
                      <Input
                        id="schedule-label"
                        placeholder="e.g. Maintenance check, Team meeting"
                        value={bookingLabel}
                        onChange={(e) => setBookingLabel(e.target.value)}
                        className="text-sm bg-white"
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={handleBook}
                      disabled={isPending}
                    >
                      Book All {selectedIds.size} Resources Atomically
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Working...
          </div>
        </div>
      )}
    </div>
  );
}
