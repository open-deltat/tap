"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import type { BookingWithWho } from "../lib/booking-details";
import { Stage } from "./stage";
import { ACCENT_CTA, PILL_BASE, PILL_IDLE } from "../lib/accent";
import { cn } from "@open-deltat/shared/utils";
import { formatTime } from "@open-deltat/shared/time";
import type { BookableRecord } from "../lib/public-bookables";
import { deletePublicBookable, renamePublicBookable } from "../actions/public-bookables";
import { getPublicBookings } from "../actions/public-booking";

const HORIZON_MS = 62 * 86_400_000;

export function PublicBookableManage({
  record: initial,
  manageKey,
}: {
  record: BookableRecord;
  manageKey: string;
}) {
  const [record, setRecord] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [bookings, setBookings] = useState<BookingWithWho[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [working, startWorking] = useTransition();

  const loadBookings = useCallback(async () => {
    const now = Date.now();
    const result = await getPublicBookings(record.id, manageKey, { start: now, end: now + HORIZON_MS });
    if (result.ok) setBookings(result.value);
  }, [record.id, manageKey]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  function rename() {
    setError(null);
    startWorking(async () => {
      const result = await renamePublicBookable(record.id, manageKey, name);
      if (result.ok) {
        setRecord(result.value);
        setName(result.value.name);
      } else {
        setError(result.error);
      }
    });
  }

  function destroy() {
    setError(null);
    startWorking(async () => {
      const result = await deletePublicBookable(record.id, manageKey);
      if (result.ok) setDeleted(true);
      else setError(result.error);
    });
  }

  if (deleted) {
    return (
      <Stage title="Gone">
        <p className="mx-auto max-w-md text-center text-[15px] leading-relaxed text-dt-ink-2">
          Deleted, along with every booking on it. The share link is dead and this page will not come
          back.
        </p>
      </Stage>
    );
  }

  return (
    <Stage
      primitive={{ label: "The key is the account", specId: "IDENT-01" }}
      title={`Managing ${record.name}`}
    >
      <div className="mx-auto max-w-xl space-y-7">
        {error && (
          <p className="flex items-start gap-2 rounded-xl border border-dt-held/40 bg-dt-held-soft px-3.5 py-2.5 text-[13px] text-dt-held-ink">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}

        <div>
          <div className="mb-2 text-[13px] font-medium text-dt-ink">Name</div>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="h-11 min-w-0 flex-1 rounded-xl border border-dt-line-strong bg-dt-surface px-3.5 text-base text-dt-ink outline-none focus:border-dt-ink sm:text-[14px]"
            />
            <button
              type="button"
              onClick={rename}
              disabled={working || name.trim() === record.name}
              className={cn("h-11 px-5 text-[14px] font-semibold", ACCENT_CTA)}
            >
              Save
            </button>
          </div>
        </div>

        <div>
          <div className="mb-2 text-[13px] font-medium tabular-nums text-dt-ink">
            Booked ({bookings?.length ?? 0})
          </div>
          {bookings === null ? (
            <div className="flex justify-center py-6 text-dt-ink-3">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : bookings.length === 0 ? (
            <p className="py-4 text-[14px] text-dt-ink-3">Nothing booked yet.</p>
          ) : (
            <ul className="divide-y divide-dt-line overflow-hidden rounded-2xl border border-dt-line bg-dt-surface">
              {bookings
                .slice()
                .sort((a, b) => a.start - b.start)
                .map((b) => (
                  <li
                    key={b.id}
                    className="flex min-h-11 items-center justify-between px-4 py-2 text-[14px] tabular-nums"
                  >
                    <span className="text-dt-ink">
                      {new Date(b.start).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      {formatTime(b.start)}
                    </span>
                    <span className="text-dt-ink-3">{b.who?.name ?? "no name"}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>

        <div className="border-t border-dt-line pt-5">
          {confirmingDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-dt-ink-2">
                Delete it and every booking on it? This cannot be undone.
              </span>
              <button
                type="button"
                onClick={destroy}
                disabled={working}
                className="h-10 rounded-full bg-destructive px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
              >
                {working ? "Deleting" : "Yes, delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className={cn(PILL_BASE, PILL_IDLE)}
              >
                Keep it
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="min-h-11 text-[13px] text-dt-ink-3 underline-offset-4 transition-colors hover:text-destructive hover:underline"
            >
              Delete this bookable
            </button>
          )}
        </div>
      </div>
    </Stage>
  );
}
