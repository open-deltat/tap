import { Fragment, type ReactNode } from "react";
import { Markdown } from "@/components/markdown";

// A docs page body: markdown with live components dropped in where the text has a marker such as
// <!--VERBS-->. The page passes the components by marker name; an unknown marker is an error at
// build time, so a typo cannot silently drop a picture from a page.
export function DocBody({ source, slots = {} }: { source: string; slots?: Record<string, ReactNode> }) {
  const [first, ...rest] = source.split("<!--");
  const parts = rest.map((chunk) => {
    const end = chunk.indexOf("-->");
    if (end < 0) throw new Error(`Unclosed docs marker near: ${chunk.slice(0, 40)}`);
    const name = chunk.slice(0, end).trim();
    if (!(name in slots)) throw new Error(`Docs marker <!--${name}--> has no component`);
    return { name, slot: slots[name], text: chunk.slice(end + 3) };
  });
  return (
    <>
      <Markdown>{first}</Markdown>
      {parts.map((p, i) => (
        <Fragment key={`${p.name}-${i}`}>
          <div className="my-8">{p.slot}</div>
          <Markdown>{p.text}</Markdown>
        </Fragment>
      ))}
    </>
  );
}
