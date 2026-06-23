"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Scales its children DOWN (never up) so their natural width fits the parent, preserving aspect
 * ratio — so a fixed-size grid (e.g. a seat map) shrinks to fit a phone while every cell keeps the
 * exact same shape. When the parent is at least as wide as the content (desktop), the scale is 1, a
 * no-op: the transform is identity and the reserved height equals the natural height, so desktop
 * renders byte-identical. Centering matches the surrounding `items-center` layout via flex.
 */
export function FitToWidth({ children }: { children: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number>();

  useEffect(() => {
    const w = wrap.current;
    const c = content.current;
    if (!w || !c) return;
    const measure = () => {
      // offsetWidth/Height are the untransformed layout box. The content must NOT be a stretched
      // flex child (items-start below + shrink-0), or its offsetHeight would track the height we
      // set and the ResizeObserver would spiral it toward 0 whenever scale < 1.
      const s = Math.min(1, w.clientWidth / c.offsetWidth);
      setScale(s);
      setHeight(c.offsetHeight * s);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(w);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrap} className="flex w-full justify-center overflow-hidden" style={{ height }}>
      <div
        ref={content}
        className="shrink-0 self-start"
        style={{ transform: `scale(${scale})`, transformOrigin: "top center", width: "max-content" }}
      >
        {children}
      </div>
    </div>
  );
}
