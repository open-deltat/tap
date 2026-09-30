import type { RequestView } from "@open-deltat/examples/actions/meeting-requests";
import { Badge } from "@/components/ui/badge";

// One vocabulary for a request's state, on the requester's page and in the owner's inbox alike.
const LABELS: Record<RequestView["status"], { text: string; variant: "secondary" | "success" | "muted" | "destructive" }> = {
  pending: { text: "Waiting for an answer", variant: "secondary" },
  approved: { text: "Booked", variant: "success" },
  declined: { text: "Declined", variant: "destructive" },
  unavailable: { text: "Taken before approval", variant: "muted" },
  withdrawn: { text: "Withdrawn", variant: "muted" },
  expired: { text: "Expired", variant: "muted" },
};

export function RequestStatus({ status }: { status: RequestView["status"] }) {
  const { text, variant } = LABELS[status];
  return <Badge variant={variant}>{text}</Badge>;
}

/** "Sun 6 Oct, 11:00 to 11:30", in the calendar's zone. */
export function spanLabel(start: number, end: number, timeZone: string): string {
  const day = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", timeZone }).format(start);
  const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", timeZone });
  return `${day}, ${time.format(start)} to ${time.format(end)}`;
}
