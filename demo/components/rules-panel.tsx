"use client";

import { useState } from "react";
import { Clock, Trash2, Pencil, Ban, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Rule } from "@/lib/schemas";

interface RulesPanelProps {
  resourceName: string;
  rules: Rule[];
  onDelete: (id: string) => void;
  onEdit: (id: string, data: { start: number; end: number; blocking: boolean }) => void;
  onAdd: () => void;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalDatetimeString(ms: number): string {
  const date = new Date(ms);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

export function RulesPanel({
  resourceName,
  rules,
  onDelete,
  onEdit,
  onAdd,
}: RulesPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const sorted = [...rules].sort((a, b) => a.start - b.start);

  return (
    <div className="flex flex-col border-t">
      <div className="flex items-center justify-between px-4 py-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Rules for {resourceName}
        </h3>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onAdd}>
          <Clock className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {sorted.length === 0 ? (
          <p className="px-4 py-3 text-xs text-muted-foreground">
            No rules. Add one to define availability windows.
          </p>
        ) : (
          <div className="px-2 pb-2 space-y-1">
            {sorted.map((rule) =>
              editingId === rule.id ? (
                <RuleEditRow
                  key={rule.id}
                  rule={rule}
                  onSave={(data) => {
                    onEdit(rule.id, data);
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  onEdit={() => setEditingId(rule.id)}
                  onDelete={() => onDelete(rule.id)}
                />
              )
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function RuleRow({
  rule,
  onEdit,
  onDelete,
}: {
  rule: Rule;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const sameDay =
    new Date(rule.start).toDateString() === new Date(rule.end).toDateString();

  return (
    <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent">
      <Badge
        variant={rule.blocking ? "destructive" : "secondary"}
        className="h-5 px-1.5 text-[10px] shrink-0"
      >
        {rule.blocking ? "block" : "open"}
      </Badge>
      <div className="flex-1 min-w-0 truncate">
        {sameDay ? (
          <>
            {formatDate(rule.start)}{" "}
            <span className="text-muted-foreground">
              {formatTime(rule.start)} – {formatTime(rule.end)}
            </span>
          </>
        ) : (
          <>
            {formatDate(rule.start)} {formatTime(rule.start)}
            <span className="text-muted-foreground"> – </span>
            {formatDate(rule.end)} {formatTime(rule.end)}
          </>
        )}
      </div>
      <div className="hidden gap-0.5 group-hover:flex shrink-0">
        <button
          className="rounded p-0.5 hover:bg-muted"
          onClick={onEdit}
          title="Edit"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          className="rounded p-0.5 hover:bg-destructive hover:text-destructive-foreground"
          onClick={onDelete}
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function RuleEditRow({
  rule,
  onSave,
  onCancel,
}: {
  rule: Rule;
  onSave: (data: { start: number; end: number; blocking: boolean }) => void;
  onCancel: () => void;
}) {
  const [start, setStart] = useState(toLocalDatetimeString(rule.start));
  const [end, setEnd] = useState(toLocalDatetimeString(rule.end));
  const [blocking, setBlocking] = useState(rule.blocking);

  function handleSave() {
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    if (endMs <= startMs) return;
    onSave({ start: startMs, end: endMs, blocking });
  }

  return (
    <div className="rounded-md border p-2 space-y-2 bg-muted/30">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">Start</Label>
          <Input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px]">End</Label>
          <Input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={blocking}
            onChange={(e) => setBlocking(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-input"
          />
          <Ban className="h-3 w-3" />
          Blocking
        </label>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={handleSave}>
            <Check className="h-3 w-3 mr-1" />
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
