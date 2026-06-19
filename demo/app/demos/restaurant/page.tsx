"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { RestaurantReservation } from "@/components/restaurant-reservation";
import { seedRestaurant } from "@/app/actions/seed-restaurant";

export default function RestaurantPage() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    seedRestaurant()
      .then(setRestaurantId)
      .catch(() => toast.error("Failed to connect to deltat. Is it running?"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0a0a0c] text-zinc-400">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Connecting to deltat…
        </div>
      </div>
    );
  }

  if (!restaurantId) return null;

  return <RestaurantReservation restaurantId={restaurantId} />;
}
