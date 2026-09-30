export interface Slot {
  start: number;
  end: number;
}

/** Free spans cut into slot-length starts, dropping any that begin before `notBefore`. */
export function sliceIntoSlots(spans: Slot[], slotMs: number, notBefore: number): Slot[] {
  return spans.flatMap((span) => {
    const out: Slot[] = [];
    for (let s = span.start; s + slotMs <= span.end; s += slotMs) {
      if (s >= notBefore) out.push({ start: s, end: s + slotMs });
    }
    return out;
  });
}
