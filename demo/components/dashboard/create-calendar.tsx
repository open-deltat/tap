"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCalendar } from "@open-deltat/examples/actions/my-bookables";

// Step one of two: name a calendar. Creating it lands you on its page, where you set the
// availability (hours, slot length, price). The browser timezone is captured here.
export function CreateCalendar() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    start(async () => {
      const result = await createCalendar({ name, timezone });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/dashboard/${result.id}`);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border p-4">
      <label htmlFor="cal-name" className="text-sm font-medium">
        Name your calendar
      </label>
      <div className="flex gap-2">
        <input
          id="cal-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={60}
          placeholder="e.g. Haircuts at Simon's"
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Next you&apos;ll set its hours, slot length, and price.
      </p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
