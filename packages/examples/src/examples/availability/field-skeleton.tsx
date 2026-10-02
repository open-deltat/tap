import { cn } from "@open-deltat/shared/utils";

const COLUMNS = 16;
// Which days are open, as a real week looks: four open, a closed day, repeating. A uniform block would
// tell you nothing about how a schedule reads.
const ROWS = ["open", "open", "open", "open", "closed", "open", "open", "open", "open", "closed", "open", "open"] as const;
// How faint each cell is: a little variety, deterministic so the server and the client draw the same thing.
const FILLS = ["opacity-[0.05]", "opacity-[0.08]", "opacity-[0.08]", "opacity-[0.11]", "opacity-[0.11]", "opacity-[0.14]"] as const;
const fillOf = (row: number, col: number) => FILLS[(row * 7 + col * 13 + ((row * col) % 5)) % FILLS.length];

// One slow, soft pulse on the whole block, and none at all under reduced motion.
const BREATHE = "motion-safe:animate-pulse [animation-duration:2.8s]";

/**
 * What the field looks like before it has read anything: the loaded layout, drawn as a quiet lattice of
 * every slot there could be. It shows no dates and no zone, which also keeps server and client markup
 * identical, and it does not guess how full the schedule is.
 */
export function FieldSkeleton() {
  return (
    <div aria-busy aria-label="Reading availability">
      {/* The loaded field is exactly this tall (its scroller's max height), so nothing moves when data lands. */}
      <div className="hidden h-[min(34rem,calc(100dvh-22rem))] overflow-hidden @2xl:block">
        <div className="flex border-b border-line">
          <div className="w-[8.25rem] shrink-0" />
          <div className="relative h-8 flex-1">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} aria-hidden className="absolute bottom-0 h-1.5 w-px bg-line-strong" style={{ left: `${(i / 8) * 100}%` }} />
            ))}
          </div>
        </div>
        <div className={BREATHE}>
          {ROWS.map((kind, row) => (
            <div key={row} className="flex w-full border-t border-line first:border-t-0" style={{ height: kind === "open" ? 29 : 16 }}>
              <span className="w-[8.25rem] shrink-0" />
              <span className="relative block flex-1">
                {kind === "open" ? (
                  Array.from({ length: COLUMNS }, (_, col) => (
                    <span
                      key={col}
                      className={cn("absolute inset-y-[3px] border-r border-panel bg-signal", fillOf(row, col))}
                      style={{ left: `${(col / COLUMNS) * 100}%`, width: `${100 / COLUMNS}%` }}
                    />
                  ))
                ) : (
                  <span aria-hidden className="absolute inset-x-0 top-1/2 border-t border-dashed border-line-strong" />
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="@2xl:hidden">
        <div className={cn("flex overflow-hidden border-b border-line", BREATHE)}>
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="grid h-[4.5rem] w-14 shrink-0 place-items-center border-r border-line">
              <span className="h-8 w-8 bg-signal opacity-[0.08]" />
            </div>
          ))}
        </div>
        {/* The day heading and a full day's grid (16 times, six rows), the height the loaded picker has. */}
        <div className="h-[2.875rem]" />
        <div className={cn("grid grid-cols-3 overflow-hidden border-t border-line [&>*]:border-b [&>*]:border-r [&>*]:border-line", BREATHE)}>
          {Array.from({ length: 18 }, (_, i) => (
            <span key={i} className="grid h-11 place-items-center">
              <span className={cn("h-5 w-14 bg-signal", fillOf(i, i % 3))} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
