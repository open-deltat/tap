"use client";

import { useEffect, useRef } from "react";
import { wsUrl } from "./use-websocket";
import type { Slot } from "../lib/day-field";

/** How long a choice has to stand still before it is held. Arrowing through ten times places one hold, not ten. */
const SETTLE_MS = 220;

/**
 * Keeps a hold on `span` for exactly as long as it is the chosen interval. A hold is one open
 * WebSocket: opening it asks the server to place the hold, closing it (the choice changed, the page
 * closed, the booking went through) releases it. Nothing is held until someone chooses something, and
 * a choice that is replaced gives its time back at once.
 *
 * The server answers a refused hold with an error frame, not a transport error, so that frame is what
 * `onRefused` hears about. A successful hold sends no frame of its own; it shows up in the field's next
 * read, which is the one place that decides who holds what.
 */
export function useSlotHold(resourceId: string | null, span: Slot | null, onRefused: (span: Slot) => void): void {
  const refused = useRef(onRefused);
  refused.current = onRefused;
  const start = span?.start;
  const end = span?.end;

  useEffect(() => {
    if (!resourceId || start === undefined || end === undefined) return;
    let live = true;
    let socket: WebSocket | null = null;
    const refuse = () => {
      if (!live) return;
      live = false;
      socket?.close();
      refused.current({ start, end });
    };

    const timer = setTimeout(() => {
      const ws = new WebSocket(wsUrl());
      socket = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: "hold", resourceId, start, end }));
      ws.onerror = refuse;
      ws.onmessage = (event) => {
        try {
          if (JSON.parse(String(event.data))?.type === "error") refuse();
        } catch {
          // a deltat event frame, not ours to read
        }
      };
    }, SETTLE_MS);

    return () => {
      live = false;
      clearTimeout(timer);
      socket?.close();
    };
  }, [resourceId, start, end]);
}
