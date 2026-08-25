import type { Metadata } from "next";

// A stand-in "partner website" that embeds the gym schedule exactly as a third party would: paste
// the <iframe>, nothing else. Proves /embed/gym renders framed, chrome-free, and unauthenticated.
// This page is NOT a demo example. It's the host you'd paste the snippet into, so it stays out of
// search (robots.ts disallows it too): a fake fitness studio must never rank as a real page.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function EmbedTestPage() {
  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold">Riverside Fitness</span>
          <nav className="flex gap-5 text-sm text-zinc-500">
            <span>Classes</span>
            <span>Membership</span>
            <span>Contact</span>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-bold">Class schedule</h1>
        <p className="mt-1 mb-6 text-sm text-zinc-600">
          Live timetable, embedded straight from our booking system.
        </p>

        {/* The copy-paste snippet, pasted. */}
        <iframe
          src="/embed/gym"
          width="100%"
          height={820}
          style={{ border: 0, borderRadius: 12 }}
          loading="lazy"
          title="Class schedule"
        />

        <p className="mt-6 text-xs text-zinc-400">
          This is a mock external site. The schedule above is the deltat demo&apos;s /embed/gym route
          rendered in an iframe: a read-only public schedule.
        </p>
      </main>
    </div>
  );
}
