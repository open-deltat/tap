import { useEffect, useRef, useState, useCallback } from "react";
import type { DeltaTEvent, Booking } from "@open-tap/client";

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
    const resourceId = options.resourceId;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let ws: WebSocket;

    const connect = () => {
      ws = new WebSocket(wsUrl());

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "subscribe", resourceId }));
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "error") return;
          optionsRef.current?.onEvent(data as DeltaTEvent);
        } catch {}
      };

      // Browser sockets never auto-reconnect; without this a single drop (HMR restart,
      // sleep/wake, proxy timeout) silently freezes live updates for the rest of the session.
      ws.onclose = () => {
        if (!cancelled) reconnectTimer = setTimeout(connect, 1000);
      };
    };
    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws.close();
    };
  }, [options?.resourceId]);
}

interface HoldWebSocketOptions {
  resourceId: string;
  start: number;
  end: number;
  onEvent?: (event: DeltaTEvent) => void;
}

interface HoldWebSocketResult {
  connected: boolean;
  confirm: (label?: string) => Promise<Booking>;
}

export function useHoldWebSocket(
  options: HoldWebSocketOptions | null
): HoldWebSocketResult {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const resolveRef = useRef<{ resolve: (b: Booking) => void; reject: (e: Error) => void } | null>(null);
  const onEventRef = useRef(options?.onEvent);
  onEventRef.current = options?.onEvent;

  useEffect(() => {
    if (!options) {
      setConnected(false);
      return;
    }

    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "hold",
        resourceId: options.resourceId,
        start: options.start,
        end: options.end,
      }));
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "confirmed") {
          resolveRef.current?.resolve(data.booking);
          resolveRef.current = null;
          return;
        }
        if (data.type === "error") {
          setConnected(false);
          resolveRef.current?.reject(new Error(data.message));
          resolveRef.current = null;
          return;
        }
        if ("HoldPlaced" in data) {
          setConnected(true);
        }
        onEventRef.current?.(data as DeltaTEvent);
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      resolveRef.current?.reject(new Error("Connection closed"));
      resolveRef.current = null;
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [options?.resourceId, options?.start, options?.end]);

  const confirm = useCallback((label?: string): Promise<Booking> => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"));
        return;
      }
      resolveRef.current = { resolve, reject };
      ws.send(JSON.stringify({ type: "confirm", label }));
    });
  }, []);

  return { connected, confirm };
}
