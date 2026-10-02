"use client";

import { useRef } from "react";
import { NarrowPicker } from "./time-field-narrow";
import { WideField } from "./time-field-wide";
import { useWide, type FieldProps } from "./time-field-shared";

export type { FieldProps, TakenSlot } from "./time-field-shared";

/**
 * Free time as it really is: a segment on a line. Every day is a row, the hours run along the top, and
 * each open stretch is drawn where it sits, next to who is holding what and what is booked. You read the
 * schedule at a glance and choose a point or draw an interval on the line. There is no month grid and no
 * pill list; this is the number line, one row per day, scrolling as far as the schedule goes.
 *
 * Wide, each open slot is a radio, a drag draws a longer interval, and arrow keys move across the line.
 * Narrow, a field of 20-pixel segments cannot be tapped, so it becomes a strip of days with the chosen
 * day's times below.
 */
export function TimeField(props: FieldProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const wide = useWide(rootRef);
  return <div ref={rootRef}>{wide ? <WideField {...props} /> : <NarrowPicker {...props} />}</div>;
}
