// Three things booked on one line of time; two of them collide, one sits clear. Embedded on the
// "What is Δt" docs page as the illustration of the overlap idea.
export function CollisionViz() {
  const segs = [
    { label: "Flight", left: 8, width: 34, cls: "bg-sky-500/40 border-sky-400/40", row: 0 },
    { label: "Hotel", left: 30, width: 36, cls: "bg-rose-500/40 border-rose-400/40", row: 1 },
    { label: "Dinner", left: 72, width: 20, cls: "bg-emerald-500/40 border-emerald-400/40", row: 2 },
  ];
  return (
    <div className="relative h-32 overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]">
      <div className="absolute inset-y-0 left-[30%] w-[12%] bg-rose-500/10">
        <div className="absolute inset-x-0 top-1 text-center text-[8.5px] font-medium uppercase tracking-wider text-rose-300/80">
          collision
        </div>
      </div>
      {/* the time axis: past on the left, future on the right */}
      <div className="absolute inset-x-3 top-1/2 flex -translate-y-1/2 items-center gap-1 text-zinc-500">
        <span className="text-[11px] leading-none">◀</span>
        <div className="h-px flex-1 bg-white/20" />
        <span className="text-[11px] leading-none">▶</span>
      </div>
      {segs.map((s) => (
        <div
          key={s.label}
          className={`absolute flex h-5 items-center justify-center rounded border text-[10px] text-zinc-100 ${s.cls}`}
          style={{ left: `${s.left}%`, width: `${s.width}%`, top: `${22 + s.row * 26}%` }}
        >
          {s.label}
        </div>
      ))}
      <div className="absolute bottom-1 left-3 text-[9px] text-zinc-500">past</div>
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-zinc-500">time</div>
      <div className="absolute bottom-1 right-3 text-[9px] text-zinc-500">future</div>
    </div>
  );
}
