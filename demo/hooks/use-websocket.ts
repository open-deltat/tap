import { useEffect, useRef } from "react";
import type { DeltaTEvent, Hold } from "@open-tap/client";

interface SubscribeOptions {
  type: "subscribe";
  resourceId: string;
  onEvent: (event: DeltaTEvent) => void;
}

interface HoldOptions {
  type: "hold";
  resourceId: string;
  start: number;
  end: number;
  durationMinutes: number;
  onHoldPlaced: (hold: Hold) => void;
  onEvent: (event: DeltaTEvent) => void;
}

type UseWebSocketOptions = SubscribeOptions | HoldOptions;

export function wsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

export function useWebSocket(options: UseWebSocketOptions | null): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!options) return;

    const ws = new WebSocket(wsUrl());

    ws.onopen = () => {
      if (options.type === "hold") {
        ws.send(
          JSON.stringify({
            type: "hold",
            resourceId: options.resourceId,
            start: options.start,
            end: options.end,
            durationMinutes: options.durationMinutes,
          })
        );
      } else {
        ws.send(
          JSON.stringify({
            type: "subscribe",
            resourceId: options.resourceId,
          })
        );
      }
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        const current = optionsRef.current;
        if (!current) return;

        if (data.type === "hold_placed" && current.type === "hold") {
          current.onHoldPlaced(data.hold);
          return;
        }
        if (data.type === "error") return;
        current.onEvent(data as DeltaTEvent);
      } catch {
        // Ignore malformed messages
      }
    };

    return () => {
      ws.close();
    };
  }, [
    options?.type,
    options?.resourceId,
    options?.type === "hold" ? options.start : undefined,
    options?.type === "hold" ? options.end : undefined,
    options?.type === "hold" ? options.durationMinutes : undefined,
  ]);
}
