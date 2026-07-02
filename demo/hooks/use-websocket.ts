import { useEffect, useRef, useState } from "react";
import type { DeltaTEvent } from "@open-tap/client";

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

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws.close();
    };
  }, [options?.resourceId]);

  return { status };
}
