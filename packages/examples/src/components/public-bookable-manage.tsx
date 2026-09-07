"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import type { Booking } from "@open-deltat/client";
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
  const [bookings, setBookings] = useState<Booking[] | null>(null);
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
        <p className="mx-auto max-w-md text-center text-[13px] text-zinc-400">
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
          <p className="flex items-start gap-2 rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[12px] text-rose-200">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}

        <div>
          <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">Name</div>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400/40"
            />
            <button
              type="button"
              onClick={rename}
              disabled={working || name.trim() === record.name}
              className={cn("rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors", ACCENT_CTA)}
            >
              Save
            </button>
          </div>
        </div>

        <div>
          <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            Booked ({bookings?.length ?? 0})
          </div>
          {bookings === null ? (
            <div className="flex justify-center py-6 text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : bookings.length === 0 ? (
            <p className="py-4 text-[13px] text-zinc-500">Nothing booked yet.</p>
          ) : (
            <ul className="space-y-1">
              {bookings
                .slice()
                .sort((a, b) => a.start - b.start)
                .map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[12.5px]"
                  >
                    <span className="text-zinc-300">
                      {new Date(b.start).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      {formatTime(b.start)}
                    </span>
                    <span className="text-zinc-500">{b.label ?? "no name"}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>

        <div className="border-t border-white/[0.07] pt-5">
          {confirmingDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-zinc-400">
                Delete it and every booking on it? This cannot be undone.
              </span>
              <button
                type="button"
                onClick={destroy}
                disabled={working}
                className="rounded-full border border-rose-400/40 bg-rose-400/15 px-3 py-1 text-xs text-rose-200 hover:bg-rose-400/25"
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
              className="text-[12px] text-zinc-500 underline-offset-4 hover:text-rose-300 hover:underline"
            >
              Delete this bookable
            </button>
          )}
        </div>
      </div>
    </Stage>
  );
}
