"use client";

import { useState, useSyncExternalStore } from "react";
import { CodeBlock } from "@/components/tools/code-block";
import { SITE } from "@/lib/seo";

// The credit line both snippets carry, so a site that pastes them links back.
const POWERED_BY = `<p style="margin:6px 0 0;font:13px system-ui,sans-serif"><a href="${SITE.url}/?ref=widget">Powered by Δt</a></p>`;

const EVENT = "tool-availability-widget-use";
const EMBED_HEIGHT = 820;

// The origin never changes while the page is open, so there is nothing to subscribe to.
const noSubscription = () => () => {};

// The live schedule's snippet. The origin is read in the browser so it is right wherever the demo
// is served; the first paint uses the public site so there is no empty or shifting block.
export function ScheduleSnippet() {
  const origin = useSyncExternalStore(noSubscription, () => window.location.origin, () => SITE.url);

  const code = `<iframe src="${origin}/embed/gym" width="100%" height="${EMBED_HEIGHT}" style="border:0;border-radius:12px" loading="lazy" title="Class schedule"></iframe>\n${POWERED_BY}`;
  return <CodeBlock code={code} label="HTML to paste" event={EVENT} from="schedule" />;
}

const PLACEHOLDER_LINK = `${SITE.url}/b/your-calendar-id`;

type ParsedLink = { readonly kind: "empty" } | { readonly kind: "valid"; readonly href: string } | { readonly kind: "invalid" };

// A booking link is exactly https://delt.at/b/<id>. Compared as parsed parts, never as a substring,
// so delt.at.evil.example or a look-alike scheme cannot end up inside the snippet.
function parseBookingLink(input: string): ParsedLink {
  const value = input.trim();
  if (value === "") return { kind: "empty" };
  try {
    const url = new URL(value);
    const ok = url.protocol === "https:" && url.hostname === new URL(SITE.url).hostname && url.pathname.startsWith("/b/") && url.pathname.length > "/b/".length;
    return ok ? { kind: "valid", href: `${url.origin}${url.pathname}` } : { kind: "invalid" };
  } catch {
    return { kind: "invalid" };
  }
}

const escapeAttr = (s: string) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;");

const buttonHtml = (href: string) =>
  `<a href="${escapeAttr(href)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#111;color:#fff;font:600 15px system-ui,sans-serif;text-decoration:none">Book a time</a>\n${POWERED_BY}`;

// A "Book a time" button for the visitor's own calendar: they paste the booking link their agent
// gave them and get a self-contained snippet back.
export function ButtonSnippet() {
  const [input, setInput] = useState("");
  const parsed = parseBookingLink(input);
  const href = parsed.kind === "valid" ? parsed.href : PLACEHOLDER_LINK;

  return (
    <div className="mt-4">
      <label htmlFor="booking-link" className="text-[14px] font-medium text-dt-ink">
        Your booking link
      </label>
      <input
        id="booking-link"
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={PLACEHOLDER_LINK}
        aria-describedby="booking-link-hint"
        aria-invalid={parsed.kind === "invalid"}
        className="mt-1.5 h-11 w-full max-w-xl rounded-xl border border-dt-line bg-dt-surface px-3.5 font-mono text-[13.5px] text-dt-ink placeholder:text-dt-ink-3 focus:border-dt-accent focus:outline-none"
      />
      <p id="booking-link-hint" className={parsed.kind === "invalid" ? "mt-2 text-[13.5px] text-dt-held-ink" : "mt-2 text-[13.5px] text-dt-ink-3"}>
        {parsed.kind === "invalid"
          ? "That is not a Δt booking link. It looks like https://delt.at/b/ followed by an id."
          : parsed.kind === "valid"
            ? "Your link is in the snippet below."
            : "Paste the link your assistant gave you. Until then the snippet shows a placeholder."}
      </p>
      <CodeBlock className="mt-4" code={buttonHtml(href)} label="HTML to paste" event={EVENT} from="button" />
    </div>
  );
}
