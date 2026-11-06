import type { ReactNode } from "react";
import { Check, RefreshCw } from "lucide-react";
import { AppleMark, GoogleCalendarMark, OutlookMark } from "./brand-icons";
import { DeltatMark } from "@/components/deltat-mark";

const ROWS = ["14:00", "14:30", "15:00", "15:30"] as const;
type Row = (typeof ROWS)[number];

// The same moment on two calendars, shown finished: Agent A and Agent B both booked Tuesday 14:30.
// Left, a calendar that is copied and checked now and then: both landed. Right, Δt: the second was
// refused with a time that still worked and took it. Static on purpose, so the whole point is there
// in one look, and nothing under it explains it. The refusal with alternatives is what the kernel
// and the MCP server answer today.
const OLD_WORLD = [
  { name: "Google Calendar", Mark: GoogleCalendarMark },
  { name: "Apple Calendar", Mark: AppleMark },
  { name: "Outlook", Mark: OutlookMark },
] as const;

export function WithWithout() {
  return (
    <div className="mx-auto mt-14 max-w-4xl sm:mt-20">
      <div className="grid gap-x-3 gap-y-8 md:grid-cols-2">
        <div>
          <div className="mb-3 flex h-8 flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12.5px] text-dt-ink-3">
            {OLD_WORLD.map(({ name, Mark }) => (
              <span key={name} className="inline-flex items-center gap-1.5 text-dt-ink-2">
                <Mark className="h-3.5 w-3.5" />
                {name}
              </span>
            ))}
          </div>
          <Calendar
            status={
              <>
                <RefreshCw className="h-3 w-3" />
                updated 4 min ago
              </>
            }
            cells={{
              "14:30": (
                <>
                  <Chip tone="clash">Agent A</Chip>
                  <Chip tone="clash">Agent B</Chip>
                </>
              ),
            }}
            tags={{ "14:30": "double booked" }}
          />
        </div>

        <div>
          <div className="mb-3 flex h-8 items-center justify-center">
            <DeltatMark />
          </div>
          <Calendar
            status={
              <>
                <span className="dt-breathe h-1.5 w-1.5 rounded-full bg-dt-accent" />
                live
              </>
            }
            cells={{
              "14:30": (
                <>
                  <Chip tone="booked">Agent A</Chip>
                  <Chip tone="moved">Agent B → 15:00</Chip>
                </>
              ),
              "15:00": (
                <Chip tone="booked">
                  Agent B
                  <Check className="ml-1.5 h-3.5 w-3.5 text-dt-accent" strokeWidth={2.5} />
                </Chip>
              ),
            }}
            highlight
          />
        </div>
      </div>
    </div>
  );
}

function Calendar({
  status,
  cells,
  tags = {},
  highlight,
}: {
  status: ReactNode;
  cells: Partial<Record<Row, ReactNode>>;
  tags?: Partial<Record<Row, string>>;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-3xl border bg-dt-surface p-5 shadow-dt-float sm:p-6 ${highlight ? "border-dt-accent/40" : "border-dt-line"}`}>
      <div className="flex items-center justify-between gap-3 text-[12.5px] text-dt-ink-3">
        <span className="font-medium text-dt-ink-2">Tuesday</span>
        <span className="inline-flex items-center gap-1.5">{status}</span>
      </div>
      <div className="mt-2 divide-y divide-dt-line border-y border-dt-line">
        {ROWS.map((t) => (
          <div key={t} className="flex min-h-[48px] items-center gap-3 py-1.5">
            <span className="w-11 shrink-0 font-mono text-[12px] tabular-nums text-dt-ink-3">{t}</span>
            <div className="flex min-w-0 flex-1 gap-1.5">{cells[t]}</div>
            {tags[t] && <span className="shrink-0 text-[11.5px] font-medium text-dt-held-ink">{tags[t]}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// booked: ink, the colour the examples use for a booking you hold. clash: amber, someone else is
// in the same slot. moved: a dashed outline, the booking that was refused and sent on.
function Chip({ tone, children }: { tone: "booked" | "clash" | "moved"; children: ReactNode }) {
  const look =
    tone === "booked"
      ? "bg-dt-ink text-dt-on-ink"
      : tone === "clash"
        ? "border border-dt-held/40 bg-dt-held-soft text-dt-held-ink"
        : "border border-dashed border-dt-line-strong text-dt-ink-3";
  return <span className={`inline-flex h-8 flex-1 items-center justify-center whitespace-nowrap rounded-lg px-2 text-[12.5px] font-medium ${look}`}>{children}</span>;
}
