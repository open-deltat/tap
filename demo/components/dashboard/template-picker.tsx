"use client";

import { useState, useTransition, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Users,
  Clock,
  GraduationCap,
  Store,
  type LucideProps,
} from "lucide-react";
import { createFromTemplate } from "@open-deltat/examples/actions/my-bookables";
import type { SchedulerTemplate } from "@open-deltat/examples/lib/scheduler-templates";

const ICONS: Record<string, ComponentType<LucideProps>> = {
  CalendarDays,
  Users,
  Clock,
  GraduationCap,
  Store,
};

// The "which one do you want to make?" grid. Click a template, optionally rename it, and it becomes
// a real owned scheduler; we route straight to its manage page (the same page the secret-link flow
// lands on). The browser timezone is read here because the server cannot know it.

export function TemplatePicker({ templates }: { templates: readonly SchedulerTemplate[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = (template: SchedulerTemplate) => {
    setError(null);
    setBusyId(template.id);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    startTransition(async () => {
      const result = await createFromTemplate({ templateId: template.id, timezone });
      if (!result.ok) {
        setError(result.error);
        setBusyId(null);
        return;
      }
      router.push(`/b/${result.id}/manage/${result.manageKey}`);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {templates.map((t) => {
          const Icon = ICONS[t.icon] ?? CalendarDays;
          const busy = pending && busyId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={pending}
              onClick={() => create(t)}
              className="flex items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:border-foreground/40 hover:bg-accent/40 disabled:opacity-60"
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{t.label}</span>
                <span className="text-xs text-muted-foreground">{busy ? "Creating…" : t.tagline}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
