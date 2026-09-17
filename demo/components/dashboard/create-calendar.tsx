"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Loader2 } from "lucide-react";
import { createCalendar } from "@open-deltat/examples/actions/my-bookables";
import { Button } from "@open-deltat/examples/components/ui/button";
import { Input } from "@open-deltat/examples/components/ui/input";

// Step one of two: name a calendar. Creating it lands you on its page, where you set the
// availability (hours, slot length, price). The browser timezone is captured here.
export function CreateCalendar() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    start(async () => {
      const result = await createCalendar({ name, timezone });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push(`/dashboard/${result.id}`);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        maxLength={60}
        placeholder="e.g. My consulting hours"
        className="flex-1"
        aria-label="Calendar name"
      />
      <Button type="submit" disabled={pending} className="shrink-0">
        {pending ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
        {pending ? "Creating…" : "Create calendar"}
      </Button>
    </form>
  );
}
