// "Flow of a booking": what happens end to end when you tap a seat. This is where the ideas that
// used to be separate cards (capacity, all-or-nothing, bubbling, live updates) show up in context.

function Node({ title, sub, accent }: { title: string; sub: string; accent?: boolean }) {
  return (
    <div
      className={
        "flex-1 rounded-lg border p-2 text-center " +
        (accent ? "border-emerald-400/30 bg-emerald-400/[0.06]" : "border-white/10 bg-white/[0.03]")
      }
    >
      <div className={"text-[12px] font-semibold " + (accent ? "text-emerald-200" : "text-zinc-100")}>{title}</div>
      <div className="mt-0.5 text-[9.5px] text-zinc-500">{sub}</div>
    </div>
  );
}

function FlowDiagram() {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2">
        <Node title="Your screen" sub="shows the seat map" />
        <span className="text-zinc-600">→</span>
        <Node title="tap" sub="the small library in the page" />
        <span className="text-zinc-600">→</span>
        <Node title="deltat" sub="the booking database" accent />
      </div>
      <div className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-emerald-300/80">
        <span aria-hidden>↑</span>
        deltat tells every open screen the moment anything changes
        <span aria-hidden>↑</span>
      </div>
    </div>
  );
}

const STEPS: { who: string; text: string }[] = [
  {
    who: "Show",
    text: "deltat holds the data. Your screen asks it what is free, and draws the seat map. The little library that does this talking and drawing is called tap.",
  },
  {
    who: "Tap",
    text: "You tap a seat. Your screen sends that one request to deltat.",
  },
  {
    who: "Check",
    text: "deltat checks the seat does not collide with anything already there, and that there is still room. A section can hold many people at once, and it only says yes while there is still space.",
  },
  {
    who: "All or nothing",
    text: "If you grabbed several seats together, it is all or nothing. Either every seat is booked, or none of them are, so you never end up with half a booking.",
  },
  {
    who: "Save and announce",
    text: "deltat saves the booking, then announces what changed.",
  },
  {
    who: "Bubble up",
    text: "That change also rolls up to the section and the whole stadium, so a single live counter sitting at the top can watch everything underneath it without listening to 80,000 seats one by one.",
  },
  {
    who: "Everyone updates",
    text: "Every screen looking at that seat map gets the news and repaints on its own. No refreshing, no checking again and again. This is the live part you see in the Live demo.",
  },
];

export function FlowTopic() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-[10.5px] uppercase tracking-[0.2em] text-zinc-500">Putting it together</div>
      <h2 className="mt-2 text-2xl font-semibold text-zinc-100">The flow of a booking</h2>
      <p className="mt-1 text-sm text-emerald-300/90">What happens, end to end, when you tap a seat.</p>

      <div className="mt-5">
        <FlowDiagram />
      </div>

      <ol className="mt-5 space-y-2.5">
        {STEPS.map((s, i) => (
          <li key={i} className="flex gap-3">
            <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/15 bg-white/[0.03] text-[11px] font-medium text-zinc-300">
              {i + 1}
            </div>
            <div className="flex-1 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="text-[12px] font-semibold text-zinc-100">{s.who}</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-400">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
