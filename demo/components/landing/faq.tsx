import { ChevronDown } from "lucide-react";

// The questions a reader with Google Calendar open in the next tab actually has. Every answer
// describes what ships today; nothing here is a roadmap item.
const FAQ = [
  {
    q: "My calendar already shows free and busy. What is different?",
    a: "It shows you a list and leaves the work to you. It cannot keep a slot for an agent that is still asking, it cannot refuse a second booking of the same time, and it cannot tell anyone the moment something changed. Δt does all three inside the storage engine, so no code path can skip them.",
  },
  {
    q: "Does Δt replace Google Calendar or Outlook?",
    a: "Δt is the source of truth for whatever your agent books: rooms, machines, seats, people's hours. Your calendar app stays the thing you look at. There is no connector to Google or Outlook in the box today; a pilot scopes one if you need it.",
  },
  {
    q: "What is TAP?",
    a: "The Time Allocation Protocol: four verbs (find, hold, commit, listen) spoken over the Postgres wire. Any Postgres driver connects to Δt, and the MCP server exposes the same four verbs to agents.",
  },
  {
    q: "What happens when a hold runs out?",
    a: "The slot is free again, and everyone listening hears it at once. A hold is a promise with a clock, not a booking, so an agent that goes quiet never blocks a time for good.",
  },
  {
    q: "How does an agent talk to it?",
    a: "Through the MCP server (npx @open-deltat/mcp), which gives any agent find_slots, hold_slot and commit_hold. Or through the TypeScript client, or straight over the Postgres wire from any language.",
  },
  {
    q: "Can I run it myself?",
    a: "Yes. The whole database is open source under AGPL-3.0: one Rust binary or a Docker image, every feature included. The founding pilot is for teams that want it hosted, wired in and reviewed by its author instead.",
  },
] as const;

export function Faq() {
  return (
    <div className="mx-auto max-w-3xl divide-y divide-dt-line rounded-3xl border border-dt-line bg-dt-surface shadow-dt-surface">
      {FAQ.map((f) => (
        <details key={f.q} className="group px-5 sm:px-6">
          <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15.5px] font-medium tracking-tight [&::-webkit-details-marker]:hidden">
            {f.q}
            <ChevronDown className="h-4 w-4 shrink-0 text-dt-ink-3 transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <p className="pb-5 text-[14.5px] leading-relaxed text-dt-ink-2">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
