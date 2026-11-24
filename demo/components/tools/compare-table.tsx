import { cn } from "@/lib/utils";

export interface CompareColumn {
  readonly name: string;
  /** Marks the column as ours, with a small badge. */
  readonly ours?: boolean;
}

/** A short string, or a string with the vendor page it was read on. */
export type CompareCell = string | { readonly text: string; readonly href: string };

export interface CompareRow {
  readonly label: string;
  /** One cell per column, in column order. */
  readonly cells: readonly CompareCell[];
}

// A semantic table inside a card. On a phone the card scrolls sideways instead of the page, and the
// first column stays put so every row keeps its label. Cells are short on purpose: a sentence that
// needs a paragraph belongs in the prose below the table.
export function CompareTable({ caption, columns, rows }: { caption: string; columns: readonly CompareColumn[]; rows: readonly CompareRow[] }) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-dt-line bg-dt-surface shadow-dt-surface">
      <table className="w-full min-w-[44rem] border-collapse text-left text-[14px] leading-snug text-dt-ink-2">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 w-36 border-b border-dt-line bg-dt-surface px-4 py-3 sm:w-44">
              <span className="sr-only">Feature</span>
            </th>
            {columns.map((c) => (
              <th key={c.name} scope="col" className={cn("border-b border-dt-line px-4 py-3 align-bottom text-[14.5px] font-semibold text-dt-ink", c.ours && "bg-dt-accent-soft")}>
                {c.name}
                {c.ours ? <span className="ml-2 rounded-full border border-dt-accent/40 px-2 py-px align-middle text-[11px] font-medium text-dt-accent-ink">ours</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="sticky left-0 z-10 border-t border-dt-line bg-dt-surface px-4 py-3 text-left align-top text-[13.5px] font-medium text-dt-ink">
                {row.label}
              </th>
              {row.cells.map((cell, i) => {
                const column = columns[i];
                return (
                  <td key={column?.name ?? i} className={cn("border-t border-dt-line px-4 py-3 align-top", column?.ours && "bg-dt-accent-soft")}>
                    {typeof cell === "string" ? (
                      cell
                    ) : (
                      <>
                        {cell.text}
                        <sup className="ml-1 text-[10.5px]">
                          <a href={cell.href} target="_blank" rel="noreferrer" aria-label={`Source for: ${cell.text}`} className="text-dt-ink-3 underline underline-offset-2 hover:text-dt-ink">
                            src
                          </a>
                        </sup>
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
