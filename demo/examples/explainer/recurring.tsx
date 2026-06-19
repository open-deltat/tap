// "Repeating times": how a pattern like "every Monday at 9" is handled. deltat stores each real
// occurrence as a stretch on the line; the pattern itself is expanded outside the database.

import { LabeledTimeline } from "@/components/labeled-timeline";

function RecurringViz() {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-3 text-center text-[11px] text-zinc-400">
        Pattern: <span className="text-emerald-300">every Monday, 9 to 10</span>
      </div>
      <div className="relative h-12">
        <div className="absolute inset-x-2 top-5 h-px bg-white/15" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${12 + i * 25}%` }}>
            <div className="mx-auto h-5 w-7 rounded bg-emerald-500/55" />
            <div className="mt-1.5 text-[9px] text-zinc-500">Mon {i + 1}</div>
          </div>
        ))}
      </div>
      <div className="mt-1 text-center text-[10px] text-zinc-500">
        saved as four real stretches, one per week
      </div>
    </div>
  );
}

export function RecurringTopic() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-[10.5px] uppercase tracking-[0.2em] text-zinc-500">Repeating times</div>
      <h2 className="mt-2 text-2xl font-semibold text-zinc-100">Every Monday at 9</h2>
      <p className="mt-1 text-sm text-emerald-300/90">deltat does not store &quot;every Monday&quot;. It stores each Monday.</p>

      <div className="mt-5">
        <RecurringViz />
      </div>

      <div className="mt-3">
        <div className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Labeled-box style</div>
        <LabeledTimeline
          axisStart={0}
          axisEnd={100}
          labelWidth={0}
          rows={[
            {
              boxes: [
                { start: 8, end: 20, color: "emerald", text: "Mon" },
                { start: 32, end: 44, color: "emerald", text: "Mon" },
                { start: 56, end: 68, color: "emerald", text: "Mon" },
                { start: 80, end: 92, color: "emerald", text: "Mon" },
              ],
            },
          ]}
        />
      </div>

      <div className="mt-5 space-y-3 text-[13.5px] leading-relaxed text-zinc-400">
        <p>
          Say a clinic is open every Monday from 9 to 10. You might expect to save a rule that says
          &quot;every Monday&quot;. deltat does not work that way, and that is on purpose.
        </p>
        <p>
          deltat only stores plain stretches on a resource&apos;s timeline, each with a real start and
          end. So to set up &quot;every Monday at 9&quot;, you spell each one out as a rule: this Monday 9 to
          10, next Monday 9 to 10, the Monday after, and so on, as far ahead as you care about. Each
          Monday becomes its own stretch on the timeline.
        </p>
        <p>
          You do not do this by hand. tap, the small library that talks to deltat, has a helper. You
          give it the pattern, which days, what time, and over what range, and it works out all those
          real rules and stores them for you. Every demo here sets up its opening hours this way.
        </p>
        <p>
          Why keep this out of the database? Repeating times are tangled up with calendars, time
          zones, and daylight saving, which are human things that keep changing. deltat stays simple
          by never knowing about any of it. It just sees stretches of time. The calendar thinking
          lives next to the people, in the app, not in the database.
        </p>
      </div>
    </div>
  );
}
