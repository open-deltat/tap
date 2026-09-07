"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Copy, Loader2, TriangleAlert } from "lucide-react";
import { Stage } from "./stage";
import { WeekHoursEditor } from "./week-hours-editor";
import { Segmented } from "./ui/segmented";
import { ACCENT_CTA, ACCENT_GHOST } from "../lib/accent";
import { cn } from "@open-deltat/shared/utils";
import { DEFAULT_WEEK, type WeekHours } from "../examples/builder/schedule";
import { createPublicBookable } from "../actions/public-bookables";

const SLOT_CHOICES = [15, 30, 60, 90, 120];

interface Created {
  id: string;
  name: string;
  manageKey: string;
}

export function PublicBookableCreate() {
  const [name, setName] = useState("");
  const [slotMinutes, setSlotMinutes] = useState(30);
  const [week, setWeek] = useState<WeekHours>(DEFAULT_WEEK);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [submitting, startSubmitting] = useTransition();

  function submit() {
    setError(null);
    startSubmitting(async () => {
      const result = await createPublicBookable({
        name,
        slotMinutes,
        // The kernel never learns a time zone (NOT-01). It enters here, at the edge, so the hours
        // someone types are the hours their visitors see.
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        week,
      });
      if (result.ok) {
        setCreated({ id: result.id, name: result.name, manageKey: result.manageKey });
      } else {
        setError(result.error);
      }
    });
  }

  if (created) return <CreatedLinks created={created} />;

  return (
    <Stage
      primitive={{ label: "Anyone can publish a timeline", specId: "VIS-11" }}
      title="Make something bookable"
      tray={
        <button
          type="button"
          onClick={submit}
          disabled={submitting || name.trim().length === 0}
          className={cn("rounded-full px-5 py-2 text-sm font-medium transition-colors", ACCENT_CTA)}
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating
            </span>
          ) : (
            "Create it"
          )}
        </button>
      }
    >
      <div className="grid gap-7 lg:grid-cols-2">
        <div className="space-y-6">
          <div>
            <label
              htmlFor="bookable-name"
              className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-zinc-500"
            >
              What is it
            </label>
            <input
              id="bookable-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dentist chair, meeting room 2, the good desk"
              maxLength={80}
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-400/40"
            />
          </div>

          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              How long is one booking
            </div>
            <Segmented
              ariaLabel="Slot length"
              value={slotMinutes}
              onChange={setSlotMinutes}
              className="justify-start"
              items={SLOT_CHOICES.map((m) => ({ value: m, label: `${m} min` }))}
            />
          </div>

          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[12px] text-rose-200">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          <p className="text-[12px] leading-relaxed text-zinc-400">
            You get two links. One to share with whoever books, one to keep. There is no account and
            no password, so the link you keep is the only way back in.
          </p>
        </div>

        <div>
          <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            When is it open
          </div>
          <WeekHoursEditor week={week} onChange={setWeek} disabled={submitting} />
          <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">
            These hours become real blocks of time in Δt, one per day for the next 60 days. Nothing
            stores &quot;every Monday&quot;, just the actual days.
          </p>
        </div>
      </div>
    </Stage>
  );
}

function CreatedLinks({ created }: { created: Created }) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const publicUrl = `${origin}/b/${created.id}`;
  const manageUrl = `${origin}/b/${created.id}/manage/${created.manageKey}`;

  return (
    <Stage
      primitive={{ label: "One timeline, two doors", specId: "SEC-03" }}
      title={`${created.name} is live`}
    >
      <div className="mx-auto max-w-xl space-y-6">
        <LinkRow
          label="Share this one"
          hint="Anyone with this link can see what is free and book it."
          url={publicUrl}
        />
        <LinkRow
          label="Keep this one"
          hint="The only way to rename or delete it. It is shown once and we store nothing that can rebuild it."
          url={manageUrl}
          danger
        />
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            href={`/b/${created.id}`}
            className={cn("rounded-full px-4 py-1.5 text-xs transition-colors", ACCENT_GHOST)}
          >
            Open the booking page
          </Link>
        </div>
      </div>
    </Stage>
  );
}

function LinkRow({
  label,
  hint,
  url,
  danger = false,
}: {
  label: string;
  hint: string;
  url: string;
  danger?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-3",
        danger ? "border-amber-400/25 bg-amber-400/[0.06]" : "border-white/[0.07] bg-white/[0.02]"
      )}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">{label}</span>
        {danger && <TriangleAlert className="h-3 w-3 text-amber-300/80" />}
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto whitespace-nowrap rounded bg-black/30 px-2 py-1.5 text-[11px] text-zinc-300">
          {url}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label}`}
          className="shrink-0 rounded-md border border-white/10 p-1.5 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-zinc-500">{hint}</p>
    </div>
  );
}
