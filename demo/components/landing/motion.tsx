"use client";

import { useEffect, useState } from "react";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// A hold's timer, ticking down for real from 4:59 and starting over when it reaches zero, so a
// held slot on the page looks like what it is: a promise with a clock. Under reduced motion it
// stays at its first value.
export function Countdown({ from = 299 }: { from?: number }) {
  const [left, setLeft] = useState(from);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setLeft((s) => (s <= 0 ? from : s - 1)), 1000);
    return () => clearInterval(id);
  }, [from]);
  return <span className="tabular-nums">{mmss(left)}</span>;
}

// "asking" with three dots that light one after another: someone is thinking, not frozen.
export function Asking({ who }: { who: string }) {
  return (
    <span className="inline-flex items-baseline">
      {who} · asking
      <span aria-hidden className="ml-px inline-flex">
        <span className="dt-dot">.</span>
        <span className="dt-dot [animation-delay:200ms]">.</span>
        <span className="dt-dot [animation-delay:400ms]">.</span>
      </span>
    </span>
  );
}
