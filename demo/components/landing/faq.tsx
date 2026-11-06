import { ChevronDown } from "lucide-react";

// The questions a reader with Google Calendar open in the next tab actually has. Every answer
// describes what ships today; nothing here is a roadmap item. The same list feeds the page's
// FAQPage structured data, so what search engines read is exactly what people read.
export const FAQ = [
  {
    q: "My calendar already shows free and busy. What is different?",
    a: "Your calendar shows you a list and leaves the work to you. It cannot keep a slot for an agent that is still asking, it cannot refuse a second booking of the same time, and it cannot tell everyone the moment something changes. Δt does all three inside the database, so nothing can skip them.",
  },
  {
    q: "What happens if two agents book the same slot at the same moment?",
    a: "One gets it. The other is refused, and the refusal already carries times that are still free, so the agent can offer one in the same breath instead of starting over.",
  },
  {
    q: "Does Δt replace Google Calendar or Outlook?",
    a: "Δt holds whatever your agents and apps book: rooms, machines, seats, people's hours. You keep your calendar app for looking at your own day. There is no connector to Google or Outlook today; a pilot can include one.",
  },
  {
    q: "Which agents can use it?",
    a: "Any agent that speaks MCP: Claude Desktop, Claude Code, Cursor and other MCP clients connect with npx @open-deltat/mcp. Your own agent can also use the TypeScript client, or any Postgres driver in any language.",
  },
  {
    q: "What happens when a hold runs out?",
    a: "The slot is free again and everyone listening hears it at once. A hold is a promise with a clock, not a booking, so an agent that goes quiet never blocks a time for good.",
  },
  {
    q: "Can it book several things together?",
    a: "Yes. An agent can hold a room, a person and the equipment in one call, and then book them in one step: all of them or none. Nobody ends up with the room and no doctor.",
  },
  {
    q: "How does it handle time zones?",
    a: "Agents send times with their zone attached, and answers come back in UTC plus the local time in the zone they asked for. Inside, every time is a plain number, so there is nothing to get wrong twice.",
  },
  {
    q: "Is our data kept separate from other customers?",
    a: "Yes. Each tenant has its own engine and its own log on disk; there is no shared table filtered by customer. On a pilot your Δt is hosted in the EU.",
  },
  {
    q: "What is TAP?",
    a: "The Time Allocation Protocol: the small shared model behind Δt (resources, open hours, holds, bookings, and free time as what is left), spoken over the Postgres wire. Any Postgres driver can connect, and the MCP server gives agents the same actions.",
  },
  {
    q: "Can I run it myself?",
    a: "Yes. The whole database is open source (AGPL-3.0): one Rust binary or a Docker image, every feature included. The founding pilot is for teams that want it hosted, wired in and checked by its author.",
  },
  {
    q: "What does it cost?",
    a: "Running it yourself is free. The founding pilot is €990 a month for the first five teams, with the price locked for a year. Enterprise, including a commercial licence without AGPL obligations, is priced per team.",
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
