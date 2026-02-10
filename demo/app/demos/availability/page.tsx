"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AvailabilityOwnerPanel } from "@/components/availability-owner-panel";
import { AvailabilityBookerPanel } from "@/components/availability-booker-panel";
import { seedAvailabilityScheduler } from "@/app/actions/seed-availability-scheduler";

export default function AvailabilityPage() {
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);

  useEffect(() => {
    seedAvailabilityScheduler()
      .then(setResourceId)
      .catch(() => toast.error("Failed to connect to deltat. Is it running?"))
      .finally(() => setLoading(false));
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

  if (!resourceId) return null;

  return (
    <div className="flex h-full">
      {/* Owner panel */}
      <div className="w-80 shrink-0 border-r overflow-auto">
        <div className="p-5 border-b">
          <h2 className="text-sm font-semibold">Dr. Sarah Chen</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Manage availability</p>
        </div>
        <div className="p-5">
          <AvailabilityOwnerPanel
            resourceId={resourceId}
            blockedDates={blockedDates}
            onBlockedDatesChange={setBlockedDates}
          />
        </div>
      </div>

      {/* Booker panel */}
      <div className="flex-1 overflow-auto">
        <div className="p-5 border-b">
          <h2 className="text-sm font-semibold">Book an Appointment</h2>
          <p className="text-xs text-muted-foreground mt-0.5">30-minute sessions with Dr. Sarah Chen</p>
        </div>
        <div className="p-5 max-w-lg">
          <AvailabilityBookerPanel resourceId={resourceId} />
        </div>
      </div>
    </div>
  );
}
