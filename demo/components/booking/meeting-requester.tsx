"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Clock, Globe, Loader2, LogIn, Send, TriangleAlert } from "lucide-react";
import { Calendar } from "@open-deltat/examples/components/ui/calendar";
import { Button } from "@open-deltat/examples/components/ui/button";
import { Input } from "@open-deltat/examples/components/ui/input";
import { Label } from "@open-deltat/examples/components/ui/label";
import { getPublicSlots } from "@open-deltat/examples/actions/public-booking";
import {
  myMeetingRequests,
  requestMeeting,
  withdrawMeetingRequest,
  type RequestView,
} from "@open-deltat/examples/actions/meeting-requests";
import type { BookableRecord } from "@open-deltat/examples/lib/public-bookables";
import type { RequestContact } from "@open-deltat/examples/lib/meeting-requests";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { sliceIntoSlots, type Slot } from "./slots";
import { RequestStatus, spanLabel } from "./request-status";

// The public page of a calendar whose owner approves each meeting. Same shape as the instant booker
// (a month, the day's free times), but picking a time asks rather than holds: nothing is reserved,
// the owner answers later, and the visitor's requests and their answers are listed underneath.

const DAY_MS = 86_400_000;

export function MeetingRequester({
  record,
  signInHref,
  contact,
  initialRequests,
}: {
  record: BookableRecord;
  /** Null when the visitor is signed in (or sign-in is not configured here). */
  signInHref: string | null;
  contact: RequestContact | null;
  initialRequests: RequestView[];
}) {
  const tz = record.timezone;
  const slotMs = record.slotMinutes * 60_000;
  const [date, setDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [month, setMonth] = useState<Date>(date);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [picked, setPicked] = useState<Slot | null>(null);
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [requests, setRequests] = useState<RequestView[]>(initialRequests);
  const [pending, start] = useTransition();

  const time = useCallback(
    (ms: number) => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(ms),
    [tz]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    const dayStart = date.getTime();
    try {
      setSlots(sliceIntoSlots(await getPublicSlots(record.id, dayStart, dayStart + DAY_MS), slotMs, Date.now()));
    } catch {
      setLoadFailed(true);
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [date, record.id, slotMs]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshRequests = useCallback(async () => setRequests(await myMeetingRequests(record.id)), [record.id]);

  const send = () => {
    if (!picked) return;
    start(async () => {
      const result = await requestMeeting({ calendarId: record.id, start: picked.start, end: picked.end, note, name });
      if (!result.ok) {
        toast.error(result.error === "SIGN_IN_REQUIRED" ? "Sign in to send a request." : result.error);
        return;
      }
      toast.success("Request sent. You will see the answer here.");
      setPicked(null);
      setNote("");
      await refreshRequests();
    });
  };

  const withdraw = (id: string) => {
    start(async () => {
      const result = await withdrawMeetingRequest(id);
      if (!result.ok) toast.error(result.error);
      await refreshRequests();
    });
  };

  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: tz }).format(date);
  const viewerTz = typeof Intl === "undefined" ? tz : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzNote = viewerTz === tz ? null : `Times shown in ${tz.replace(/_/g, " ")}`;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-[auto_1fr]">
          <div className="sm:border-r sm:pr-6">
            <Calendar
              mode="single"
              required
              selected={date}
              onSelect={(d) => {
                if (!d) return;
                const next = new Date(d);
                next.setHours(0, 0, 0, 0);
                setDate(next);
                setPicked(null);
              }}
              month={month}
              onMonthChange={setMonth}
              startMonth={new Date()}
              disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
              className="bg-transparent p-0"
            />
          </div>

          <div className="flex min-h-80 flex-col">
            <div className="mb-3 flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{dateLabel}</span>
                <Badge variant="muted" className="gap-1">
                  <Clock className="size-3" />
                  {record.slotMinutes}m
                </Badge>
              </div>
              {tzNote ? (
                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Globe className="size-3" />
                  {tzNote}
                </span>
              ) : null}
            </div>

            {picked ? (
              <div className="bg-muted/40 flex flex-1 flex-col justify-center gap-4 rounded-lg border p-6">
                <div className="flex flex-col items-center gap-1 text-center">
                  <p className="text-muted-foreground text-sm">Ask for</p>
                  <p className="text-lg font-semibold">
                    {dateLabel.split(",")[0]} at {time(picked.start)}
                  </p>
                  <p className="text-muted-foreground text-xs">Nothing is reserved until the owner says yes.</p>
                </div>

                {signInHref ? (
                  <Button asChild>
                    <a href={signInHref}>
                      <LogIn /> Sign in to send the request
                    </a>
                  </Button>
                ) : (
                  <>
                    {contact ? (
                      <p className="text-muted-foreground text-center text-xs">
                        Asking as {contact.name}
                        {contact.email ? ` (${contact.email})` : ""}
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="requester-name">Your name</Label>
                        <Input id="requester-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="request-note">What is it about? (optional)</Label>
                      <textarea
                        id="request-note"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={500}
                        rows={3}
                        className="border-input bg-background focus-visible:ring-ring/50 rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={send} disabled={pending || (!contact && !name.trim())} className="flex-1">
                        {pending ? <Loader2 className="animate-spin" /> : <Send />}
                        Send request
                      </Button>
                      <Button variant="ghost" onClick={() => setPicked(null)} disabled={pending}>
                        Back
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : loading ? (
              <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
                <Loader2 className="mr-2 size-4 animate-spin" /> Loading…
              </div>
            ) : loadFailed ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center">
                <TriangleAlert className="text-muted-foreground size-5" />
                <p className="text-sm">Could not load times for this day.</p>
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  Try again
                </Button>
              </div>
            ) : slots.length === 0 ? (
              <div className="text-muted-foreground flex flex-1 items-center justify-center rounded-lg border border-dashed text-center text-sm">
                Nothing open this day. Try another.
              </div>
            ) : (
              <div className="grid max-h-96 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                {slots.map((s) => (
                  <button
                    key={s.start}
                    onClick={() => setPicked(s)}
                    disabled={pending}
                    className="hover:border-primary/40 hover:bg-accent rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {time(s.start)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {requests.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Your requests</h2>
          <ul className="flex flex-col divide-y rounded-lg border">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div className="flex flex-col">
                  <span>{spanLabel(r.start, r.end, tz)}</span>
                  {r.reason ? <span className="text-muted-foreground text-xs">“{r.reason}”</span> : null}
                </div>
                <div className="flex items-center gap-2">
                  <RequestStatus status={r.status} />
                  {r.status === "pending" ? (
                    <Button variant="ghost" size="sm" onClick={() => withdraw(r.id)} disabled={pending}>
                      Withdraw
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
