"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@open-deltat/examples/components/ui/button";
import { Input } from "@open-deltat/examples/components/ui/input";
import {
  approveMeetingRequest,
  calendarMeetingRequests,
  declineMeetingRequest,
  type RequestView,
} from "@open-deltat/examples/actions/meeting-requests";
import { RequestStatus, spanLabel } from "@/components/booking/request-status";

// The owner's inbox: who asked for which time, and the answer. Pending first, since those are the
// ones waiting on a decision; everything else stays listed so the history is one glance away.
export function MeetingInbox({
  calendarId,
  timezone,
  initialRequests,
}: {
  calendarId: string;
  timezone: string;
  initialRequests: RequestView[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const refresh = async () => {
    const inbox = await calendarMeetingRequests(calendarId);
    if (inbox.ok) setRequests(inbox.value);
  };

  const approve = (id: string) =>
    start(async () => {
      const result = await approveMeetingRequest(id);
      if (result.ok) toast.success("Approved and booked.");
      else toast.error(result.error);
      await refresh();
    });

  const decline = (id: string) =>
    start(async () => {
      const result = await declineMeetingRequest(id, reason);
      if (result.ok) toast.success("Declined.");
      else toast.error(result.error);
      setDeclining(null);
      setReason("");
      await refresh();
    });

  const ordered = [...requests].sort(
    (a, b) => Number(b.status === "pending") - Number(a.status === "pending") || a.start - b.start
  );

  if (ordered.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
        No requests yet. Share the calendar&apos;s link; people sign in and ask for a time.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {ordered.map((r) => (
        <li key={r.id} className="flex flex-col gap-3 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{spanLabel(r.start, r.end, timezone)}</span>
              <span className="text-muted-foreground text-xs">
                {r.contact?.name}
                {r.contact?.email ? ` · ${r.contact.email}${r.contact.emailVerified ? "" : " (unverified)"}` : ""}
              </span>
              {r.note ? <span className="text-xs">“{r.note}”</span> : null}
              {r.reason ? <span className="text-muted-foreground text-xs">Your reason: “{r.reason}”</span> : null}
            </div>
            <RequestStatus status={r.status} />
          </div>

          {r.status === "pending" ? (
            declining === r.id ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (optional, they will see it)"
                  maxLength={200}
                  className="h-8 flex-1"
                  autoFocus
                />
                <Button size="sm" variant="destructive" onClick={() => decline(r.id)} disabled={pending}>
                  Decline
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeclining(null)} disabled={pending}>
                  Back
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => approve(r.id)} disabled={pending}>
                  {pending ? <Loader2 className="animate-spin" /> : <Check />} Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDeclining(r.id)} disabled={pending}>
                  <X /> Decline
                </Button>
              </div>
            )
          ) : null}
        </li>
      ))}
    </ul>
  );
}
