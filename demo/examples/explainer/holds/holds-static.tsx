import type { ReactNode } from "react";
import { Check, X } from "lucide-react";

type Seat = "free" | "held" | "booked";

const SEATS = 6;
const FOCUS = 3; // seat 4, the one both people want

// Free is green, held is amber, booked is ink: the same colours the landing and the examples use.
const SEAT_LOOK: Record<Seat, string> = {
  free: "bg-dt-accent-soft ring-1 ring-inset ring-dt-accent/25",
  held: "bg-dt-held-soft ring-1 ring-inset ring-dt-held/45 text-dt-held-ink",
  booked: "bg-dt-ink text-dt-on-ink",
};

function Seats({ focus }: { focus: Seat }) {
  return (
    <div role="img" aria-label={`Seat 4 ${focus}, the others free`} className="flex shrink-0 gap-1.5">
      {Array.from({ length: SEATS }, (_, i) => {
        const state = i === FOCUS ? focus : "free";
        return (
          <span
            key={i}
            className={`flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-medium tabular-nums ${SEAT_LOOK[state]}`}
          >
            {i === FOCUS && (state === "booked" ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : "4")}
          </span>
        );
      })}
    </div>
  );
}

// One moment of the race: who did what, what came of it, and the seats as everyone now sees them.
// A half-width ending stacks its seats under the words, because six seats beside a sentence do not
// fit in half the card.
function Moment({ n, who, status, seats, half }: { n: string; who: string; status: ReactNode; seats: Seat; half?: boolean }) {
  return (
    <div className={`flex flex-col gap-3 p-5 ${half ? "" : "sm:flex-row sm:items-center sm:justify-between"}`}>
      <div className="text-[13.5px]">
        <span className="font-mono text-[12px] text-dt-ink-3">{n}</span>
        <span className="ml-2 text-dt-ink">{who}</span>
        <div className="mt-1 text-[12.5px]">{status}</div>
      </div>
      <Seats focus={seats} />
    </div>
  );
}

const Status = ({ tone, icon, children }: { tone: string; icon?: ReactNode; children: ReactNode }) => (
  <span className={`inline-flex items-center gap-1.5 ${tone}`}>
    {icon}
    {children}
  </span>
);

// Two people, one seat: Bob holds it, Jane is refused at once, and then one of two endings. Every
// row shows the seats as everyone sees them, because a hold counts as taken for all the moment it
// lands. Static on purpose: the race reads top to bottom without anyone having to play it.
export function HoldsStatic() {
  return (
    <figure className="overflow-hidden rounded-3xl border border-dt-line bg-dt-surface shadow-dt-surface">
      <div className="divide-y divide-dt-line">
        <Moment
          n="01"
          who="Bob taps seat 4"
          seats="held"
          status={<Status tone="text-dt-held-ink">held for a few minutes, taken for everyone</Status>}
        />
        <Moment
          n="02"
          who="Jane taps seat 4"
          seats="held"
          status={<Status tone="text-dt-ink-2" icon={<X className="h-3.5 w-3.5" strokeWidth={2.5} />}>refused at once: it is held</Status>}
        />
        <div className="grid divide-y divide-dt-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <Moment
            n="03"
            who="Bob says yes"
            seats="booked"
            half
            status={<Status tone="text-dt-accent-ink" icon={<Check className="h-3.5 w-3.5" strokeWidth={2.5} />}>booked in one step</Status>}
          />
          <Moment
            n="or"
            who="Bob goes quiet"
            seats="free"
            half
            status={<Status tone="text-dt-ink-2">the hold runs out, seat 4 is free</Status>}
          />
        </div>
      </div>
    </figure>
  );
}
