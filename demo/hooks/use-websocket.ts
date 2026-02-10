import { useEffect, useRef } from "react";
import type { DeltaTEvent } from "@open-tap/client";

interface SubscribeOptions {
  type: "subscribe";
  resourceId: string;
  onEvent: (event: DeltaTEvent) => void;
}

export function wsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

export function useWebSocket(options: SubscribeOptions | null): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!options) return;

    const ws = new WebSocket(wsUrl());

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe", resourceId: options.resourceId }));
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "error") return;
        optionsRef.current?.onEvent(data as DeltaTEvent);
      } catch {}
    };

    return () => { ws.close(); };
  }, [options?.resourceId]);
}
