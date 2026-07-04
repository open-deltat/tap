"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { wsUrl } from "./use-websocket";

type Slot = { start: number; end: number };

/**
 * Owns the per-seat hold lifecycle for the seat booker. A selected seat is exactly one open hold
 * WebSocket: opening the socket asks the server to place the hold, closing it releases the hold.
 * `selectedSeats` and the socket map are therefore kept in lockstep, so callers read selection from
 * here rather than tracking holds separately.
 */
export function useSeatHolds() {
  const holdWsRef = useRef(new Map<string, WebSocket>());
  const [selectedSeats, setSelectedSeats] = useState<Set<string>>(new Set());

  // A hold lives only as long as its socket, so close every socket when the booker unmounts.
  useEffect(() => {
    const conns = holdWsRef.current;
    return () => {
      for (const ws of conns.values()) ws.close();
      conns.clear();
    };
  }, []);

  // Stable so effects that reset on venue/date/slot changes can depend on it without re-running.
  const clearSelection = useCallback(() => {
    for (const ws of holdWsRef.current.values()) ws.close();
    holdWsRef.current.clear();
    setSelectedSeats(new Set());
  }, []);

  function toggleSeat(seatId: string, slot: Slot) {
    if (selectedSeats.has(seatId)) {
      const ws = holdWsRef.current.get(seatId);
      if (ws) {
        ws.close();
        holdWsRef.current.delete(seatId);
      }
      setSelectedSeats((prev) => {
        const next = new Set(prev);
        next.delete(seatId);
        return next;
      });
      return;
    }

    const ws = new WebSocket(wsUrl());
    const revertSelection = () => {
      holdWsRef.current.delete(seatId);
      setSelectedSeats((prev) => {
        const next = new Set(prev);
        next.delete(seatId);
        return next;
      });
    };
    ws.onopen = () => {
      ws.send(
        JSON.stringify({ type: "hold", resourceId: seatId, start: slot.start, end: slot.end })
      );
    };
    ws.onerror = revertSelection;
    // The server rejects a hold as a {type:"error"} MESSAGE (not a transport error), so onerror
    // never fires for it. Without this, the optimistic green selection stays even though no hold
    // exists, a phantom-held seat whose later Book then fails.
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data));
        if (data?.type === "error") {
          ws.close();
          revertSelection();
          toast.error("That seat was just taken");
        }
      } catch {
        // non-JSON / deltat event frame, ignore
      }
    };
    holdWsRef.current.set(seatId, ws);
    setSelectedSeats((prev) => new Set(prev).add(seatId));
  }

  return { selectedSeats, toggleSeat, clearSelection };
}
