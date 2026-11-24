import Link from "next/link";
import { ToolShell, ToolSection } from "@/components/tools/tool-shell";
import { HowItWorks } from "@/components/tools/how-it-works";
import { MeetingPlanner } from "@/components/tools/meeting-planner";
import { Markdown } from "@/components/markdown";
import { pageMetadata, webApplicationLd } from "@/lib/seo";
import { toolByHref } from "@/lib/tools/registry";

const TOOL = toolByHref("/tools/timezone-meeting-planner");

export const metadata = pageMetadata({ title: TOOL.title, description: TOOL.description, path: TOOL.href });

const CLOCKS = `Clocks do not change on the same day everywhere. In 2026 the US moved to summer time on 8 March
and most of Europe on 29 March, so for three weeks New York and Berlin were five hours apart instead of
six, and their shared working time grew from two hours to three. Then it happens again in reverse in
the autumn. Australia and New Zealand change in the other direction, and many countries never change.

A planner that adds a fixed offset gets those weeks wrong. This one does not use offsets at all: it
asks for each person's working hours on that exact date, in their own zone, and lets the time zone
database say what that means in absolute time.`;

export default function TimezoneMeetingPlannerPage() {
  return (
    <ToolShell
      tool={TOOL}
      ld={[webApplicationLd({ title: TOOL.title, description: TOOL.description, path: TOOL.href, category: "BusinessApplication" })]}
      lead={
        <p>
          Put in where everyone is and when they work, pick the day, and read off the hours you all share. The first row is you: every time is
          shown in your zone, and each person&apos;s own clock is under their name.
        </p>
      }
    >
      <MeetingPlanner />

      <HowItWorks
        steps={[
          {
            title: "Each person's hours become real instants",
            body: "09:00 to 17:00 in New York on 16 March is turned into two exact moments in time, with that day's rules for that zone. The code that does it is expandRecurrence from the Δt SDK, the same function that lays down opening hours on every Δt calendar.",
          },
          {
            title: "The day is your day",
            body: "The ribbon spans midnight to midnight in your zone. On the day your clocks change it is 23 or 25 hours long, and the ribbon is too.",
          },
          {
            title: "The overlap is where every ribbon is green",
            body: "Spans are intersected, person by person. A shift that runs past midnight is split at your midnight, so night workers count too.",
          },
        ]}
      />

      <ToolSection title="Why the overlap moves in March and October">
        <Markdown>{CLOCKS}</Markdown>
      </ToolSection>

      <ToolSection title="From a free hour to a booked one">
        <p className="mt-3 max-w-[68ch] text-[15.5px] leading-relaxed text-dt-ink-2">
          Knowing when everyone is free is half of it. On Δt each person has a calendar, an agent asks for the times they all share, and it{" "}
          <Link href="/tools/double-booking-race" className="text-dt-accent-ink underline decoration-dt-accent/40 underline-offset-4">
            holds
          </Link>{" "}
          that hour on every calendar at once while it checks with them, so nobody books over it in the meantime. See it with five people in the{" "}
          <Link href="/demos/meet" data-umami-event="tool-timezone-planner-app" data-umami-event-from="meet-demo" className="font-medium text-dt-accent-ink underline decoration-dt-accent/40 underline-offset-4">
            group bookings demo
          </Link>
          .
        </p>
      </ToolSection>
    </ToolShell>
  );
}
