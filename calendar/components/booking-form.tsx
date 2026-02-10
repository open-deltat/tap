"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatTime } from "@/lib/time";
import { createPublicBooking } from "@/app/actions/public";

interface BookingFormProps {
  slug: string;
  start: number;
  end: number;
}

export function BookingForm({ slug, start, end }: BookingFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        await createPublicBooking({ slug, start, end, name, email });
        router.push(`/book/${slug}/confirm`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to book");
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="text-sm font-medium">
        {formatTime(start)} – {formatTime(end)}
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Your Name</Label>
        <Input
          placeholder="John Smith"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Email</Label>
        <Input
          type="email"
          placeholder="john@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="text-sm"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={handleSubmit} disabled={isPending || !name || !email} className="w-full" size="sm">
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
        Book Appointment
      </Button>
    </div>
  );
}
