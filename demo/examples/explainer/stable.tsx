// "Same room, several nights": the stable-unit idea, in plain language with the hotel example.

function NightsViz() {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex gap-1">
        {Array.from({ length: 10 }).map((_, i) => {
          const stay = i >= 2 && i <= 6;
          return <div key={i} className={"h-8 flex-1 rounded " + (stay ? "bg-emerald-500/55" : "bg-white/[0.06]")} />;
        })}
      </div>
      <div className="mt-2 text-center text-[10px] text-zinc-500">five nights in a row, all in one room</div>
    </div>
  );
}

export function StableTopic() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-[10.5px] uppercase tracking-[0.2em] text-zinc-500">A neat result</div>
      <h2 className="mt-2 text-2xl font-semibold text-zinc-100">Same room, several nights</h2>
      <p className="mt-1 text-sm text-emerald-300/90">Find a stay that keeps you in one room the whole time, without searching.</p>

      <div className="mt-5">
        <NightsViz />
      </div>

      <div className="mt-5 space-y-3 text-[13.5px] leading-relaxed text-zinc-400">
        <p>
          A hotel often has several identical rooms of one type, say five standard rooms. You want
          three nights in a row, and you want the same room the whole time. Nobody wants to pack up
          and move rooms halfway through a stay.
        </p>
        <p>
          Here is the nice part. Because of the way deltat counts how many rooms are in use each
          night, there is a simple rule: if every night in a stretch has at least one room free,
          then one single room can cover the whole stretch. You do not have to try each room to find
          out, and you do not have to label rooms ahead of time.
        </p>
        <p>
          So finding &quot;three nights in the same room&quot; is just finding a run of nights that are each
          below full. deltat finds that in one pass. The hotel demo&apos;s &quot;soonest opening&quot; and
          &quot;longest stay&quot; buttons are doing exactly this.
        </p>
      </div>
    </div>
  );
}
