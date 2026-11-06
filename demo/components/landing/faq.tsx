import { ChevronDown } from "lucide-react";

// The questions a reader with Google Calendar open in the next tab actually has. Every answer
// describes what ships today; nothing here is a roadmap item.
const FAQ = [
  {
    q: "My calendar already shows free and busy. What is different?",
    a: "Your calendar shows you a list and leaves the work to you. It cannot keep a slot for an agent that is still asking, it cannot refuse a second booking of the same time, and it cannot tell everyone the moment something changes. Δt does all three inside the database, so nothing can skip them.",
  },
  {
    q: "Does Δt replace Google Calendar or Outlook?",
    a: "Δt holds whatever your agent books: rooms, machines, seats, people's hours. You keep your calendar app for looking at your day. There is no connector to Google or Outlook today; a pilot can include one.",
  },
  {
    q: "What is TAP?",
    a: "The Time Allocation Protocol: find, hold, book, listen, spoken over the Postgres wire. Any Postgres driver can connect to Δt, and the MCP server gives agents the same four actions.",
  },
  {
    q: "What happens when a hold runs out?",
    a: "The slot is free again and everyone listening hears it at once. A hold is a promise with a clock, not a booking, so an agent that goes quiet never blocks a time for good.",
  },
  {
    q: "How does an agent talk to it?",
    a: "Through the MCP server (npx @open-deltat/mcp), the TypeScript client, or straight over the Postgres wire from any language.",
  },
  {
    q: "Can I run it myself?",
    a: "Yes. The whole database is open source (AGPL-3.0): one Rust binary or a Docker image, every feature included. The founding pilot is for teams that want it hosted, wired in and checked by its author.",
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
