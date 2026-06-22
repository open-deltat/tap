"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ParkingGarage } from "./parking-garage";
import { seedParking } from "./seed";

export default function ParkingExample() {
  const [garageId, setGarageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    seedParking()
      .then(([id]) => setGarageId(id))
      .catch(() => toast.error("Failed to connect to Δt. Is it running?"))
      .finally(() => setLoading(false));
  }, []);

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

  if (!garageId) return null;

  return <ParkingGarage garageId={garageId} />;
}
