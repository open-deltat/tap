import { Fragment, type ReactNode } from "react";
import { Markdown } from "@/components/markdown";

export interface DocSlot {
  node: ReactNode;
  /** A small inline element (a chip under a heading) sits close to the text; a widget gets room. */
  tight?: boolean;
}

type Part = { kind: "text"; text: string } | { kind: "slot"; name: string };

// A marker is a line that holds nothing but <!--NAME-->, outside any fenced code block. Anything
// else that looks like a comment (inside a code sample, or mid-sentence) stays text.
function markerName(line: string): string | null {
  const t = line.trim();
  if (!t.startsWith("<!--") || !t.endsWith("-->")) return null;
  const name = t.slice(4, -3).trim();
  return name.length > 0 && [...name].every((c) => (c >= "A" && c <= "Z") || c === "_") ? name : null;
}

function splitMarkers(source: string): Part[] {
  const out: Part[] = [];
  let buffer: string[] = [];
  let inFence = false;
  for (const line of source.split("\n")) {
    if (line.trimStart().startsWith("```")) inFence = !inFence;
    const name = inFence ? null : markerName(line);
    if (name) {
      out.push({ kind: "text", text: buffer.join("\n") }, { kind: "slot", name });
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  out.push({ kind: "text", text: buffer.join("\n") });
  return out;
}

// A docs page body: markdown with live components dropped in where the text has a marker line such
// as <!--VERBS-->. The page passes the components by marker name; a marker with no component is an
// error at build time, so a typo cannot silently drop a picture from a page.
export function DocBody({ source, slots = {} }: { source: string; slots?: Record<string, ReactNode | DocSlot> }) {
  const parts = splitMarkers(source);
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === "text") return p.text.trim() ? <Markdown key={i}>{p.text}</Markdown> : null;
        if (!(p.name in slots)) throw new Error(`Docs marker <!--${p.name}--> has no component`);
        const slot = slots[p.name];
        const isSlot = typeof slot === "object" && slot !== null && "node" in slot;
        const node = isSlot ? (slot as DocSlot).node : (slot as ReactNode);
        const tight = isSlot && (slot as DocSlot).tight;
        return (
          <Fragment key={i}>
            <div className={tight ? "mt-4" : "my-8"}>{node}</div>
          </Fragment>
        );
      })}
    </>
  );
}
