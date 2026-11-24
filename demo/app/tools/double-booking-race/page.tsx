import Link from "next/link";
import { ToolShell, ToolSection } from "@/components/tools/tool-shell";
import { HowItWorks } from "@/components/tools/how-it-works";
import { DoubleBookingRace } from "@/components/tools/race";
import { Markdown } from "@/components/markdown";
import { pageMetadata, webApplicationLd } from "@/lib/seo";
import { toolByHref } from "@/lib/tools/registry";

const TOOL = toolByHref("/tools/double-booking-race");

export const metadata = pageMetadata({ title: TOOL.title, description: TOOL.description, path: TOOL.href });

const WITHOUT = `Most booking code does this: read the calendar, see the slot is free, write the booking. Two people
who press at the same moment both read "free", and both writes go through. That is a double booking,
and no amount of re-reading fixes it, because the gap between the read and the write is where the
second booker gets in.

A **booking hold** closes the gap. The hold is the write, and Δt checks for a clash inside it. Of two
holds on the same time, one lands and the other is refused, however close together they arrive. The
refusal is not a dead end: it carries the next free times, so the loser can be offered one straight away.

The hold also expires on its own. A booker who walks away mid-checkout gives the slot back without any
clean-up job. That is why a hold is cheap enough to place before you even ask the person "does 14:30 work?".`;

export default function DoubleBookingRacePage() {
  return (
    <ToolShell
      tool={TOOL}
      ld={[webApplicationLd({ title: TOOL.title, description: TOOL.description, path: TOOL.href, category: "DeveloperApplication" })]}
      lead={
        <p>
          Two bookers read the same half hour, both see it free, and both try to hold it at the same instant. Press start and watch which one
          gets it. This runs on a real Δt calendar, and every reply below is the one the engine sent.
        </p>
      }
    >
      <DoubleBookingRace />

      <HowItWorks
        steps={[
          {
            title: "Both bookers read the slot",
            body: "Each asks Δt for the free time in that half hour, at the same moment. Both are told it is free. On most systems this is where the trouble starts.",
          },
          {
            title: "Both send a hold in the same tick",
            body: "Our server sends the two holds to Δt together, on two separate connections. Which one goes out first is a coin toss each round, so neither side wins by being first in the code.",
          },
          {
            title: "Δt lets exactly one through",
            body: "The clash check runs inside the write. The second hold is refused with CONFLICT and a list of other free times, read from the same reply. Nothing was booked twice and nobody is left with nothing to offer.",
          },
          {
            title: "The winner lets go",
            body: "This page releases the winning hold straight away, so the slot is free for the next round. In a real checkout the winner would commit it, which turns the hold into a booking in one step.",
          },
        ]}
      />

      <ToolSection title="Why a read is not enough">
        <Markdown>{WITHOUT}</Markdown>
      </ToolSection>

      <ToolSection title="Try it by hand">
        <p className="mt-3 max-w-[68ch] text-[15.5px] leading-relaxed text-dt-ink-2">
          The{" "}
          <Link href="/demos/live" data-umami-event="tool-double-booking-race-app" data-umami-event-from="live-demo" className="font-medium text-dt-accent-ink underline decoration-dt-accent/40 underline-offset-4">
            realtime seats demo
          </Link>{" "}
          shows one cinema twice. Hold a seat on one side and it turns amber on the other at once; try to take the same seat from both and one
          side is refused. For the code behind it, read{" "}
          <Link href="/docs/guides/booking-holds" className="text-dt-accent-ink underline decoration-dt-accent/40 underline-offset-4">
            booking holds
          </Link>{" "}
          and{" "}
          <Link href="/docs/guides/prevent-double-booking" className="text-dt-accent-ink underline decoration-dt-accent/40 underline-offset-4">
            how Δt prevents double bookings
          </Link>
          .
        </p>
      </ToolSection>
    </ToolShell>
  );
}
