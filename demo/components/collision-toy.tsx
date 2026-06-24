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
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-[0.18em]">
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2 py-0.5",
            touched ? "text-zinc-500" : "animate-pulse bg-emerald-400/10 text-emerald-300"
          )}
        >
          <MoveHorizontal className="h-3 w-3" />
          drag the green booking
        </span>
        <span className={cn("rounded px-1.5 py-0.5 font-medium", colliding ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300")}>
          {colliding ? "collision" : "clear"}
        </span>
      </div>

      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative h-20 cursor-grab touch-none select-none rounded-md bg-black/20 active:cursor-grabbing"
      >
        {/* the time axis */}
        <div className="absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-white/15" />
        <div className="absolute bottom-1 left-3 text-[9px] text-zinc-600">past</div>
        <div className="absolute bottom-1 right-3 text-[9px] text-zinc-600">future</div>

        {/* overlap band, only while colliding */}
        {colliding && overlapWidth > 0 && (
          <div aria-hidden className="absolute inset-y-0 bg-rose-500/15" style={{ left: `${overlapLeft}%`, width: `${overlapWidth}%` }} />
        )}

        {/* fixed booking */}
        <div
          aria-hidden
          className={cn(
            "absolute top-3 flex h-6 items-center justify-center rounded border text-[10px] text-zinc-100 transition-colors",
            colliding ? "border-rose-400/50 bg-rose-500/30" : "border-sky-400/40 bg-sky-500/25"
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
            "absolute bottom-3 flex h-6 cursor-grab items-center justify-center gap-1 rounded border text-[10px] font-medium text-zinc-100 shadow-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:cursor-grabbing",
            colliding ? "border-rose-400/60 bg-rose-500/40" : "border-emerald-400/60 bg-emerald-500/40",
            !touched && "ring-2 ring-white/40"
          )}
          style={{ left: `${bStart}%`, width: `${B_WIDTH}%` }}
        >
          <MoveHorizontal className="h-3 w-3 opacity-80" />
          New booking
        </div>
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">
        The whole conflict model is one comparison: two stretches collide only when they actually share a moment.
        There is no third state.
      </p>
    </div>
  );
}
