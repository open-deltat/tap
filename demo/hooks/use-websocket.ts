import { useEffect, useRef, useState, useCallback } from "react";
import type { DeltaTEvent, Booking } from "@open-tap/client";

interface SubscribeOptions {
  type: "subscribe";
  resourceId: string;
  onEvent: (event: DeltaTEvent) => void;
}

/** "live" = streaming; "expiring" = server warned it will pause soon; "paused" = server closed it by
 *  policy (the user must opt back in); "connecting" = (re)opening after a genuine drop. */
export type StreamStatus = "connecting" | "live" | "expiring" | "paused";

export interface StreamControl {
  status: StreamStatus;
  /** Re-open the stream — used to honor "keep watching" / "resume" after a policy pause. */
  reconnect: () => void;
}

/** App-defined close code the proxy uses when it pauses a stream by policy (age/idle). On this code
 *  the client must NOT auto-reconnect — otherwise it reconnect-storms and defeats the server guard. */
const POLICY_CLOSE = 4002;

export function wsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

export function useWebSocket(options: SubscribeOptions | null): StreamControl {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const reconnectRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!options) return;
    const resourceId = options.resourceId;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let ws: WebSocket;

    const connect = () => {
      setStatus("connecting");
      ws = new WebSocket(wsUrl());

      ws.onopen = () => {
        attempt = 0;
        setStatus("live");
        ws.send(JSON.stringify({ type: "subscribe", resourceId }));
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "__expiring") { setStatus("expiring"); return; }
          if (data.type === "__closing") return; // a close event follows immediately
          if (data.type === "error") return;
          optionsRef.current?.onEvent(data as DeltaTEvent);
        } catch {}
      };

      // A policy pause is intentional — show "paused" and wait for the user, never auto-reconnect
      // (that would storm the server guard). A genuine drop (HMR, sleep/wake) reconnects with capped
      // backoff so live updates resume without hammering on a flapping connection.
      ws.onclose = (ev) => {
        if (cancelled) return;
        if (ev.code === POLICY_CLOSE) { setStatus("paused"); return; }
        setStatus("connecting");
        const delay = Math.min(1000 * 2 ** attempt, 15000);
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    reconnectRef.current = () => {
      attempt = 0;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
      connect();
    };
    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws.close();
    };
  }, [options?.resourceId]);

  const reconnect = useCallback(() => reconnectRef.current(), []);
  return { status, reconnect };
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
