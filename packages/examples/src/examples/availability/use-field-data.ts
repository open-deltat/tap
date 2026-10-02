"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeltaTEvent } from "@open-deltat/client";
import { dayStarts, diffField, type FieldSnapshot, type Slot } from "../../lib/day-field";
import type { TakenSlot } from "../../components/time-field";
import { readField } from "./field-data";
import { extendAvailabilityThrough } from "./seed";

const INITIAL_DAYS = 28;
const PAGE_DAYS = 28;
/** Two years: as far as the open hours go on this demo, and the most the server will lay down. */
export const MAX_DAYS = 730;
const TAKEN_FLASH_MS = 800;
const FEED_MS = 6_000;
/** Events arrive in bursts (a booking is two of them); one read serves the burst. */
const COALESCE_MS = 60;
/** After a hold or booking should have run out, read again a beat later to confirm it did. */
const EXPIRY_GRACE_MS = 400;

export interface FieldData {
  snapshot: FieldSnapshot | null;
  /** Local midnights of every day loaded, in order. */
  starts: number[];
  windowStart: number;
  windowEnd: number;
  /** This page's clock when the snapshot arrived. */
  now: number;
  /** Server clock minus this page's clock. */
  skew: number;
  taken: TakenSlot[];
  feed: string | null;
  more: { loading: boolean; done: boolean; onNeed: () => void };
  /** Feed this the stream's events: it reads again, once per burst. */
  onEvent: (event: DeltaTEvent) => void;
  refresh: () => Promise<void>;
}

/**
 * The field's one source of truth: a snapshot of free time, holds and bookings for the days loaded so
 * far. It reads again on every stream event and when a hold or booking is due to run out, and it
 * diffs each read against the last to say what someone else just did. More days load as the person
 * scrolls, the server laying the open hours down ahead of them.
 */
export function useFieldData(resourceId: string | null, slotMs: number, ownSpans: () => readonly Slot[]): FieldData {
  // `days` is how far we have asked to see; `coveredDays` is how far the data we hold reaches. The rows
  // follow the data, not the request: rows for days we have not read yet would look closed, and the page
  // would keep asking for more because the end of the list never moved away.
  const [days, setDays] = useState(INITIAL_DAYS);
  const [coveredDays, setCoveredDays] = useState(0);
  const [snapshot, setSnapshot] = useState<FieldSnapshot | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [skew, setSkew] = useState(0);
  const [taken, setTaken] = useState<TakenSlot[]>([]);
  const [feed, setFeed] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const latest = useRef(0);
  const previous = useRef<FieldSnapshot | null>(null);
  const loadingMoreRef = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const ownRef = useRef(ownSpans);
  ownRef.current = ownSpans;

  const { windowStart, windowEnd } = useMemo(() => {
    const bounds = dayStarts(new Date(), days + 1);
    return { windowStart: bounds[0], windowEnd: bounds[days] };
  }, [days]);
  const starts = useMemo(() => dayStarts(new Date(), coveredDays), [coveredDays]);
  const previousEnd = useRef(0);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const refresh = useCallback(async () => {
    if (!resourceId) return;
    const seq = ++latest.current;
    const next = await readField(resourceId, windowStart, windowEnd);
    if (seq !== latest.current) return; // a newer read is already on its way

    const at = Date.now();
    const before = previous.current;
    const sharedEnd = Math.min(previousEnd.current || windowEnd, windowEnd);
    previous.current = next;
    previousEnd.current = windowEnd;
    setNow(at);
    setSkew(next.at - at);
    setSnapshot(next);
    setCoveredDays(days);
    loadingMoreRef.current = false;
    setLoadingMore(false);

    const change = before ? diffField(before, next, slotMs, at, ownRef.current(), sharedEnd) : null;
    if (change?.taken.length) {
      setTaken(change.taken.map((s) => ({ ...s, key: s.start + at })));
      later(() => setTaken([]), TAKEN_FLASH_MS);
    }
    if (change?.message) {
      setFeed(change.message);
      later(() => setFeed(null), FEED_MS);
    }
  }, [resourceId, windowStart, windowEnd, days, slotMs, later]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A hold or booking that is about to run out: look again just after it should have.
  useEffect(() => {
    if (!snapshot) return;
    const expiries = [...snapshot.holds.map((h) => h.expiresAt), ...snapshot.busy.flatMap((b) => (b.expiresAt ? [b.expiresAt] : []))];
    const soonest = Math.min(...expiries.filter((t) => t > snapshot.at));
    if (!Number.isFinite(soonest)) return;
    const timer = setTimeout(() => void refresh(), Math.max(0, soonest - (Date.now() + skew)) + EXPIRY_GRACE_MS);
    return () => clearTimeout(timer);
  }, [snapshot, skew, refresh]);

  const coalesce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEvent = useCallback(
    (event: DeltaTEvent) => {
      if ("Lagged" in event) {
        setFeed(`caught up, ${event.Lagged.missed} updates missed`);
        later(() => setFeed(null), FEED_MS);
      }
      if (coalesce.current) clearTimeout(coalesce.current);
      coalesce.current = setTimeout(() => void refresh(), COALESCE_MS);
    },
    [refresh, later]
  );
  useEffect(() => () => (coalesce.current ? clearTimeout(coalesce.current) : undefined), []);

  const onNeed = useCallback(() => {
    if (!resourceId || loadingMoreRef.current || days >= MAX_DAYS) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const next = Math.min(MAX_DAYS, days + PAGE_DAYS);
    extendAvailabilityThrough(next + 14)
      .then(() => setDays(next))
      .catch(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [resourceId, days]);

  return { snapshot, starts, windowStart, windowEnd, now, skew, taken, feed, more: { loading: loadingMore, done: days >= MAX_DAYS, onNeed }, onEvent, refresh };
}
