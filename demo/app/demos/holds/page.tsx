"use client";

import { useEffect, useState, useCallback, useTransition, useRef } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResourceTree } from "@/components/resource-tree";
import { CreateResourceDialog } from "@/components/create-resource-dialog";
import { AddRuleDialog } from "@/components/add-rule-dialog";
import { ResourceSettingsDialog } from "@/components/resource-settings-dialog";
import type { Resource, Hold } from "@/lib/schemas";
import { useResourceEvents } from "@/hooks/use-resource-events";

import {
  createResources,
  deleteResource,
  getResources,
  updateResourceSettings,
} from "@/app/actions/resources";
import { addRule, addRecurringRules, deleteRule } from "@/app/actions/rules";
import {
  placeHold,
  releaseHold,
  getHoldsForResource,
} from "@/app/actions/holds";

const EXPIRY_OPTIONS = [
  { label: "5 min", value: 5 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hour", value: 60 },
];

function toDatetimeLocal(d: Date): string {
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "expired";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function HoldsPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Form state
  const [startStr, setStartStr] = useState(() => toDatetimeLocal(new Date()));
  const [endStr, setEndStr] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    return toDatetimeLocal(d);
  });
  const [expiryMinutes, setExpiryMinutes] = useState(15);

  // Countdown ticker
  const [now, setNow] = useState(Date.now());

  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleResourceId, setRuleResourceId] = useState<string>("");
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsResourceId, setSettingsResourceId] = useState<string>("");

  const selectedResource =
    resources.find((r) => r.id === selectedId) ?? null;

  // Load holds for selected resource
  const loadHolds = useCallback(async (resourceId: string) => {
    try {
      const h = await getHoldsForResource(resourceId);
      setHolds(h);
    } catch (err) {
      console.error("Failed to load holds:", err);
    }
  }, []);

  // Load resources on mount
  useEffect(() => {
    async function init() {
      try {
        const all = await getResources();
        setResources(all);
        if (all.length > 0) {
          const leaves = all.filter(
            (r) => !all.some((c) => c.parentId === r.id)
          );
          if (leaves.length > 0) setSelectedId(leaves[0].id);
        }
      } catch (err) {
        console.error("Failed to load resources:", err);
        toast.error("Failed to connect to deltat. Is it running?");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Load holds when selection changes
  useEffect(() => {
    if (selectedId) {
      loadHolds(selectedId);
    } else {
      setHolds([]);
    }
  }, [selectedId, loadHolds]);

  // Real-time updates via SSE
  useResourceEvents(selectedId, useCallback(() => {
    if (selectedId) loadHolds(selectedId);
  }, [selectedId, loadHolds]));

  // Tick countdown every second
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Resource management callbacks
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
        if (created.length === 1) setSelectedId(created[0].id);
        toast.success(`Created ${created.length} resource${created.length > 1 ? "s" : ""}`);
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
      } catch (err: any) {
        toast.error(err.message ?? "Failed to add recurring rules");
      }
    });
  }

  async function handleDeleteRule(id: string) {
    startTransition(async () => {
      try {
        await deleteRule(id);
        toast.success("Rule deleted");
      } catch (err: any) {
        toast.error(err.message ?? "Failed to delete rule");
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

  // Hold actions
  async function handlePlaceHold() {
    if (!selectedId) return;
    const start = new Date(startStr).getTime();
    const end = new Date(endStr).getTime();
    if (isNaN(start) || isNaN(end) || end <= start) {
      toast.error("Invalid time range");
      return;
    }
    startTransition(async () => {
      try {
        await placeHold({
          resourceId: selectedId,
          start,
          end,
          durationMinutes: expiryMinutes,
        });
        toast.success(`Hold placed (expires in ${expiryMinutes}m)`);
        await loadHolds(selectedId);
      } catch (err: any) {
        toast.error(err.message ?? "Failed to place hold");
      }
    });
  }

  async function handleReleaseHold(id: string) {
    startTransition(async () => {
      try {
        await releaseHold(id);
        toast.success("Hold released");
        if (selectedId) await loadHolds(selectedId);
      } catch (err: any) {
        toast.error(err.message ?? "Failed to release hold");
      }
    });
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

  const activeHolds = holds.filter((h) => h.expiresAt > now);

  return (
    <div className="flex h-full">
      {/* Left sidebar: resource tree */}
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
      </div>

      {/* Main area */}
      <div className="flex-1 min-w-0 overflow-auto p-6">
        {!selectedResource ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-sm text-muted-foreground">
              Select a resource to manage holds
            </div>
          </div>
        ) : (
          <div className="max-w-xl mx-auto space-y-6">
            <div>
              <h1 className="text-lg font-semibold">{selectedResource.name}</h1>
              <p className="text-xs text-muted-foreground">
                Place temporary holds that auto-expire
              </p>
            </div>

            {/* Place Hold form */}
            <div className="rounded-lg border p-4 space-y-4">
              <div className="text-sm font-medium">Place Hold</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Start</Label>
                  <Input
                    type="datetime-local"
                    value={startStr}
                    onChange={(e) => setStartStr(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">End</Label>
                  <Input
                    type="datetime-local"
                    value={endStr}
                    onChange={(e) => setEndStr(e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Expires After</Label>
                <div className="flex gap-1">
                  {EXPIRY_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      variant={expiryMinutes === opt.value ? "default" : "outline"}
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => setExpiryMinutes(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
              <Button
                className="w-full"
                onClick={handlePlaceHold}
                disabled={isPending}
              >
                Place Hold
              </Button>
            </div>

            {/* Active holds */}
            <div className="space-y-3">
              <div className="text-sm font-medium">
                Active Holds{" "}
                {activeHolds.length > 0 && (
                  <span className="text-muted-foreground font-normal">
                    ({activeHolds.length})
                  </span>
                )}
              </div>

              {activeHolds.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <div className="text-sm text-muted-foreground">
                    No active holds
                  </div>
                  <div className="text-xs text-muted-foreground/70 mt-1">
                    Place a hold to temporarily reserve a time slot
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeHolds.map((hold) => {
                    const remaining = hold.expiresAt - now;
                    const urgent = remaining < 60_000;
                    return (
                      <div
                        key={hold.id}
                        className="flex items-center gap-3 rounded-lg border p-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">
                            {formatDate(hold.start)} · {formatTime(hold.start)}{" "}
                            – {formatTime(hold.end)}
                          </div>
                          <div
                            className={`text-xs ${urgent ? "text-destructive font-medium" : "text-muted-foreground"}`}
                          >
                            expires in {formatCountdown(remaining)}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleReleaseHold(hold.id)}
                          disabled={isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
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

      {settingsResourceId && (
        <ResourceSettingsDialog
          open={settingsDialogOpen}
          onOpenChange={setSettingsDialogOpen}
          resourceName={
            resources.find((r) => r.id === settingsResourceId)?.name ?? ""
          }
          slotMinutes={
            resources.find((r) => r.id === settingsResourceId)?.slotMinutes ?? 60
          }
          bufferMinutes={
            resources.find((r) => r.id === settingsResourceId)?.bufferMinutes ?? 0
          }
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
