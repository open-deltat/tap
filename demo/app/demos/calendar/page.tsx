"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ResourceTree } from "@/components/resource-tree";
import { WeekCalendar } from "@/components/week-calendar";
import { DayCalendar } from "@/components/day-calendar";
import { CreateResourceDialog } from "@/components/create-resource-dialog";
import { AddRuleDialog } from "@/components/add-rule-dialog";
import { BookingDialog, CancelBookingDialog } from "@/components/booking-dialog";
import { ResourceSettingsDialog } from "@/components/resource-settings-dialog";
import { RulesPanel } from "@/components/rules-panel";
import { weekStart } from "@/lib/utils";
import type { Resource, Rule, AvailabilitySlot, Booking } from "@/lib/schemas";
import { useResourceEvents } from "@/hooks/use-resource-events";

import { seed } from "@/app/actions/seed";
import { createResources, deleteResource, getResources, updateResourceSettings } from "@/app/actions/resources";
import { addRule, addRecurringRules, editRule, deleteRule, getRulesForResource } from "@/app/actions/rules";
import { bookSlot, cancelBooking, getBookingsForResource, getMultiResourceBookings } from "@/app/actions/bookings";
import { getAvailability, getMultiResourceAvailability } from "@/app/actions/availability";

export default function CalendarPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [weekOf, setWeekOf] = useState(() => weekStart(new Date()));
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleResourceId, setRuleResourceId] = useState<string>("");
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<{ start: number; end: number } | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsResourceId, setSettingsResourceId] = useState<string>("");
  const [viewMode, setViewMode] = useState<"week" | "day">("week");
  const [dayDate, setDayDate] = useState(() => new Date());
  const [dayAvailability, setDayAvailability] = useState<Map<string, AvailabilitySlot[]>>(new Map());
  const [dayBookings, setDayBookings] = useState<Map<string, Booking[]>>(new Map());
  const [bookingLabel, setBookingLabel] = useState("");

  const selectedResource = resources.find((r) => r.id === selectedId) ?? null;
  const childResources = selectedResource
    ? resources.filter((r) => r.parentId === selectedResource.id)
    : [];
  const hasChildren = childResources.length > 0;

  // Load availability + bookings + rules for selected resource
  const loadCalendarData = useCallback(
    async (resourceId: string, week: Date) => {
      const start = week.getTime();
      const end = start + 7 * 86_400_000;
      try {
        const [avail, bk, rl] = await Promise.all([
          getAvailability(resourceId, start, end),
          getBookingsForResource(resourceId),
          getRulesForResource(resourceId),
        ]);
        setAvailability(avail);
        setBookings(bk.filter((b) => b.start < end && b.end > start));
        setRules(rl);
      } catch (err) {
        console.error("Failed to load calendar data:", err);
        toast.error("Failed to load calendar data");
      }
    },
    []
  );

  // Seed on mount
  useEffect(() => {
    async function init() {
      try {
        const { resources: seeded } = await seed();
        setResources(seeded);
        if (seeded.length > 0) {
          const leaves = seeded.filter(
            (r) => !seeded.some((c) => c.parentId === r.id)
          );
          if (leaves.length > 0) {
            setSelectedId(leaves[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to seed:", err);
        toast.error("Failed to connect to deltat. Is it running?");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Reload calendar when selection or week changes
  useEffect(() => {
    if (selectedId) {
      loadCalendarData(selectedId, weekOf);
    } else {
      setAvailability([]);
      setBookings([]);
      setRules([]);
    }
  }, [selectedId, weekOf, loadCalendarData]);

  // Real-time updates via SSE
  useResourceEvents(selectedId, useCallback(() => {
    if (selectedId) loadCalendarData(selectedId, weekOf);
  }, [selectedId, weekOf, loadCalendarData]));

  function handleCreateChildren(parentId: string | null) {
    setCreateParentId(parentId);
    setCreateDialogOpen(true);
  }

  async function handleCreateResources(data: {
    names: string[];
    parentId: string | null;
  }) {
    startTransition(async () => {
      try {
        const created = await createResources(data);
        const updated = await getResources();
        setResources(updated);
        if (created.length === 1) {
          setSelectedId(created[0].id);
        }
        const count = created.length;
        toast.success(`Created ${count} resource${count > 1 ? "s" : ""}`);
      } catch (err: any) {
        toast.error(err.message ?? "Failed to create resources");
      }
    });
  }

  async function handleDeleteResource(id: string) {
    const resource = resources.find((r) => r.id === id);
    if (!resource) return;
    startTransition(async () => {
      try {
        await deleteResource(id);
        const updated = await getResources();
        setResources(updated);
        if (selectedId === id) setSelectedId(null);
        toast.success(`Deleted "${resource.name}"`);
      } catch (err: any) {
        toast.error(err.message ?? "Failed to delete resource");
      }
    });
  }

  function handleSettings(resourceId: string) {
    setSettingsResourceId(resourceId);
    setSettingsDialogOpen(true);
  }

  async function handleUpdateSettings(settings: {
    slotMinutes: number;
    bufferMinutes: number;
  }) {
    if (!settingsResourceId) return;
    startTransition(async () => {
      try {
        await updateResourceSettings(settingsResourceId, settings);
        const updated = await getResources();
        setResources(updated);
        toast.success("Settings updated");
      } catch (err: any) {
        toast.error(err.message ?? "Failed to update settings");
      }
    });
  }

  function handleAddRule(resourceId: string) {
    setRuleResourceId(resourceId);
    setRuleDialogOpen(true);
  }

  async function handleAddRuleSubmit(data: {
    resourceId: string;
    start: number;
    end: number;
    blocking: boolean;
  }) {
    startTransition(async () => {
      try {
        await addRule(data);
        toast.success(data.blocking ? "Blocking rule added" : "Availability rule added");
        if (selectedId) {
          await loadCalendarData(selectedId, weekOf);
        }
      } catch (err: any) {
        toast.error(err.message ?? "Failed to add rule");
      }
    });
  }

  async function handleAddRecurringRules(data: {
    resourceId: string;
    daysOfWeek: number[];
    startTime: string;
    endTime: string;
    fromDate: string;
    toDate: string;
    blocking: boolean;
  }) {
    startTransition(async () => {
      try {
        const created = await addRecurringRules(data);
        toast.success(`Created ${created.length} rules`);
        if (selectedId) {
          await loadCalendarData(selectedId, weekOf);
        }
      } catch (err: any) {
        toast.error(err.message ?? "Failed to add recurring rules");
      }
    });
  }

  async function handleEditRule(
    id: string,
    data: { start: number; end: number; blocking: boolean }
  ) {
    startTransition(async () => {
      try {
        await editRule(id, data);
        toast.success("Rule updated");
        if (selectedId) {
          await loadCalendarData(selectedId, weekOf);
        }
      } catch (err: any) {
        toast.error(err.message ?? "Failed to update rule");
      }
    });
  }

  async function handleDeleteRule(id: string) {
    startTransition(async () => {
      try {
        await deleteRule(id);
        toast.success("Rule deleted");
        if (selectedId) {
          await loadCalendarData(selectedId, weekOf);
        }
      } catch (err: any) {
        toast.error(err.message ?? "Failed to delete rule");
      }
    });
  }

  function handleSlotClick(start: number, end: number) {
    setBookingSlot({ start, end });
    setBookingLabel("");
    setBookingDialogOpen(true);
  }

  async function handleBookConfirm() {
    if (!selectedId || !bookingSlot) return;
    setBookingDialogOpen(false);
    startTransition(async () => {
      try {
        await bookSlot({
          resourceId: selectedId,
          start: bookingSlot.start,
          end: bookingSlot.end,
          label: bookingLabel,
        });
        toast.success("Slot booked!");
        await loadCalendarData(selectedId, weekOf);
      } catch (err: any) {
        toast.error(err.message ?? "Failed to book slot");
      }
    });
  }

  function handleBookingClick(booking: Booking) {
    setCancelTarget(booking);
    setCancelDialogOpen(true);
  }

  async function handleCancelConfirm() {
    if (!cancelTarget || !selectedId) return;
    setCancelDialogOpen(false);
    startTransition(async () => {
      try {
        await cancelBooking(cancelTarget.id);
        toast.success("Booking cancelled");
        await loadCalendarData(selectedId, weekOf);
      } catch (err: any) {
        toast.error(err.message ?? "Failed to cancel booking");
      }
    });
  }

  // Load day view data for multi-resource
  const loadDayData = useCallback(
    async (children: Resource[], date: Date) => {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const start = dayStart.getTime();
      const end = start + 86_400_000;
      const ids = children.map((r) => r.id);
      try {
        const [availMap, bookMap] = await Promise.all([
          getMultiResourceAvailability(ids, start, end),
          getMultiResourceBookings(ids),
        ]);
        setDayAvailability(new Map(Object.entries(availMap)));
        // Filter bookings to day range
        const filtered = new Map<string, Booking[]>();
        for (const [id, bks] of Object.entries(bookMap)) {
          filtered.set(id, (bks as Booking[]).filter((b) => b.start < end && b.end > start));
        }
        setDayBookings(filtered);
      } catch (err) {
        console.error("Failed to load day data:", err);
      }
    },
    []
  );

  // Reload day data when in day mode
  useEffect(() => {
    if (viewMode === "day" && hasChildren) {
      loadDayData(childResources, dayDate);
    }
  }, [viewMode, dayDate, selectedId, hasChildren]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDaySlotClick(resourceId: string, start: number, end: number) {
    setSelectedId(resourceId);
    setBookingSlot({ start, end });
    setBookingLabel("");
    setBookingDialogOpen(true);
  }

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

  return (
    <div className="flex h-full">
      {/* Left sidebar: resource tree + rules panel */}
      <div className="w-72 shrink-0 border-r flex flex-col">
        <div className="flex-1 min-h-0">
          <ResourceTree
            resources={resources}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCreateChildren={handleCreateChildren}
            onDelete={handleDeleteResource}
            onAddRule={handleAddRule}
            onSettings={handleSettings}
          />
        </div>
        {selectedResource && (
          <div className="max-h-[40%] overflow-auto">
            <RulesPanel
              resourceName={selectedResource.name ?? "Resource"}
              rules={rules}
              onDelete={handleDeleteRule}
              onEdit={handleEditRule}
              onAdd={() => handleAddRule(selectedResource.id)}
            />
          </div>
        )}
      </div>

      {/* Right: Calendar */}
      <div className="flex-1 min-w-0">
        {viewMode === "day" && hasChildren ? (
          <DayCalendar
            date={dayDate}
            onDateChange={setDayDate}
            resources={childResources.map((r) => ({ id: r.id, name: r.name ?? r.id }))}
            availabilityByResource={dayAvailability}
            bookingsByResource={dayBookings}
            slotMinutes={selectedResource?.slotMinutes ?? 60}
            onSlotClick={handleDaySlotClick}
            onBookingClick={handleBookingClick}
            onViewChange={() => setViewMode("week")}
          />
        ) : (
          <WeekCalendar
            weekOf={weekOf}
            onWeekChange={setWeekOf}
            availability={availability}
            bookings={bookings}
            resourceName={selectedResource?.name ?? null}
            slotMinutes={selectedResource?.slotMinutes ?? 60}
            onSlotClick={handleSlotClick}
            onBookingClick={handleBookingClick}
            hasChildren={hasChildren}
            onDayView={() => {
              setDayDate(new Date());
              setViewMode("day");
            }}
          />
        )}
      </div>

      {/* Dialogs */}
      <CreateResourceDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        parentId={createParentId}
        resources={resources}
        onSubmit={handleCreateResources}
      />

      {ruleResourceId && (
        <AddRuleDialog
          open={ruleDialogOpen}
          onOpenChange={setRuleDialogOpen}
          resourceId={ruleResourceId}
          resources={resources}
          onSubmit={handleAddRuleSubmit}
          onRecurringSubmit={handleAddRecurringRules}
        />
      )}

      {bookingSlot && (
        <BookingDialog
          open={bookingDialogOpen}
          onOpenChange={setBookingDialogOpen}
          resourceName={selectedResource?.name ?? ""}
          start={bookingSlot.start}
          end={bookingSlot.end}
          label={bookingLabel}
          onLabelChange={setBookingLabel}
          onConfirm={handleBookConfirm}
        />
      )}

      {cancelTarget && (
        <CancelBookingDialog
          open={cancelDialogOpen}
          onOpenChange={setCancelDialogOpen}
          resourceName={selectedResource?.name ?? ""}
          start={cancelTarget.start}
          end={cancelTarget.end}
          onConfirm={handleCancelConfirm}
        />
      )}

      {settingsResourceId && (
        <ResourceSettingsDialog
          open={settingsDialogOpen}
          onOpenChange={setSettingsDialogOpen}
          resourceName={resources.find((r) => r.id === settingsResourceId)?.name ?? ""}
          slotMinutes={resources.find((r) => r.id === settingsResourceId)?.slotMinutes ?? 60}
          bufferMinutes={resources.find((r) => r.id === settingsResourceId)?.bufferMinutes ?? 0}
          onSubmit={handleUpdateSettings}
        />
      )}

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
