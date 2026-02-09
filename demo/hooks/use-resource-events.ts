import { useEffect, useRef } from "react";
import type { DeltaTEvent } from "@open-tap/client";

export function useResourceEvents(
  resourceId: string | null,
  onEvent: (event: DeltaTEvent) => void
): void {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    if (!resourceId) return;

    const es = new EventSource(`/api/events/${resourceId}`);

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === "connected") return;
        callbackRef.current(event as DeltaTEvent);
      } catch {
        // Ignore malformed data
      }
    };

    return () => {
      es.close();
    };
  }, [resourceId]);
}
