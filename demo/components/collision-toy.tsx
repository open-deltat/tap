"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { MoveHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

// Two stretches on one time line. The first is fixed; drag (or arrow-key) the second across it and
// the overlap test flips between clear and colliding. That flip is the whole conflict model, so the
// docs let you feel it rather than just read it. The grip handle and the pulsing cue make it obvious
// the green chip is the thing you move, which is not otherwise discoverable.
const A_START = 24;
const A_WIDTH = 28;
const B_WIDTH = 26;
const A_END = A_START + A_WIDTH;
const MAX_B = 100 - B_WIDTH;

export function CollisionToy() {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [bStart, setBStart] = useState(60);
  const [touched, setTouched] = useState(false);

  const bEnd = bStart + B_WIDTH;
  const colliding = A_START < bEnd && bStart < A_END;
  const overlapLeft = Math.max(A_START, bStart);
  const overlapWidth = Math.min(A_END, bEnd) - overlapLeft;

  const moveTo = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setBStart(Math.max(0, Math.min(MAX_B, pct - B_WIDTH / 2)));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    setTouched(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    moveTo(e.clientX);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) moveTo(e.clientX);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      setTouched(true);
      setBStart((s) => Math.max(0, s - 4));
    } else if (e.key === "ArrowRight") {
      setTouched(true);
      setBStart((s) => Math.min(MAX_B, s + 4));
    }
  };

  return (
    <div className="mt-5 rounded-2xl border border-dt-line bg-dt-surface p-4 shadow-dt-surface sm:p-5">
      <div className="mb-3 flex items-center justify-between text-[12px]">
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2.5 py-1",
            touched ? "text-dt-ink-3" : "dt-breathe bg-dt-sunken text-dt-ink"
          )}
        >
          <MoveHorizontal className="h-3 w-3" />
          Drag the new booking
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 font-medium",
            colliding ? "bg-destructive/10 text-destructive" : "bg-dt-accent-soft text-dt-accent-ink"
          )}
        >
          {colliding ? "Collision" : "Clear"}
        </span>
      </div>

      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative h-24 cursor-grab touch-none select-none rounded-xl bg-dt-sunken active:cursor-grabbing"
      >
        {/* the time axis */}
        <div className="absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-dt-line-strong" />
        <div className="absolute bottom-1 left-3 text-[10px] text-dt-ink-3">past</div>
        <div className="absolute bottom-1 right-3 text-[10px] text-dt-ink-3">future</div>

        {/* overlap band, only while colliding */}
        {colliding && overlapWidth > 0 && (
          <div aria-hidden className="absolute inset-y-0 bg-destructive/10" style={{ left: `${overlapLeft}%`, width: `${overlapWidth}%` }} />
        )}

        {/* fixed booking */}
        <div
          aria-hidden
          className={cn(
            "absolute top-3 flex h-7 items-center justify-center rounded-lg border text-[11px] transition-colors",
            colliding ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-dt-line-strong bg-dt-surface text-dt-ink-2"
          )}
          style={{ left: `${A_START}%`, width: `${A_WIDTH}%` }}
        >
          Booking
        </div>

        {/* draggable booking */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Second booking position"
          aria-valuemin={0}
          aria-valuemax={Math.round(MAX_B)}
          aria-valuenow={Math.round(bStart)}
          onKeyDown={onKeyDown}
          className={cn(
            "absolute bottom-4 flex h-7 cursor-grab items-center justify-center gap-1 rounded-lg border border-transparent text-[11px] font-medium shadow-dt-float transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-dt-accent active:cursor-grabbing",
            colliding ? "bg-destructive text-white" : "bg-dt-ink text-dt-on-ink",
            !touched && "ring-2 ring-dt-accent/50"
          )}
          style={{ left: `${bStart}%`, width: `${B_WIDTH}%` }}
        >
          <MoveHorizontal className="h-3 w-3 opacity-80" />
          New booking
        </div>
      </div>

      <p className="mt-3 text-[13.5px] leading-relaxed text-dt-ink-2">
        The whole conflict model is one comparison: two stretches collide only when they actually share a moment.
        There is no third state.
      </p>
    </div>
  );
}
