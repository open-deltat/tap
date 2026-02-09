"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { Resource } from "@/lib/schemas";

interface CreateResourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentId: string | null;
  resources: Resource[];
  onSubmit: (data: { names: string[]; parentId: string | null }) => void;
}

export function CreateResourceDialog({
  open,
  onOpenChange,
  parentId,
  resources,
  onSubmit,
}: CreateResourceDialogProps) {
  const [names, setNames] = useState<string[]>([""]);
  const [batchPrefix, setBatchPrefix] = useState("");
  const [batchCount, setBatchCount] = useState(5);

  const parentName = parentId
    ? resources.find((r) => r.id === parentId)?.name ?? "Unknown"
    : null;

  function addRow() {
    setNames([...names, ""]);
  }

  function removeRow(index: number) {
    setNames(names.filter((_, i) => i !== index));
  }

  function updateRow(index: number, value: string) {
    const next = [...names];
    next[index] = value;
    setNames(next);
  }

  function applyBatch() {
    if (!batchPrefix.trim() || batchCount < 1) return;
    const generated = Array.from(
      { length: batchCount },
      (_, i) => `${batchPrefix.trim()} ${i + 1}`
    );
    setNames((prev) => {
      const existing = prev.filter((n) => n.trim());
      return [...existing, ...generated];
    });
    setBatchPrefix("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valid = names.map((n) => n.trim()).filter(Boolean);
    if (valid.length === 0) return;
    onSubmit({ names: valid, parentId });
    setNames([""]);
    setBatchPrefix("");
    setBatchCount(5);
    onOpenChange(false);
  }

  const validCount = names.filter((n) => n.trim()).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {parentId
              ? `Add children to "${parentName}"`
              : "Create resources"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Batch generation */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Generate many</Label>
            <div className="flex gap-2">
              <Input
                value={batchPrefix}
                onChange={(e) => setBatchPrefix(e.target.value)}
                placeholder="Name prefix, e.g. Seat"
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyBatch();
                  }
                }}
              />
              <Input
                type="number"
                min={1}
                max={100}
                value={batchCount}
                onChange={(e) => setBatchCount(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0"
                onClick={applyBatch}
                disabled={!batchPrefix.trim()}
              >
                Add
              </Button>
            </div>
          </div>

          <Separator />

          {/* Individual names */}
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {names.map((name, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={name}
                  onChange={(e) => updateRow(i, e.target.value)}
                  placeholder={`Resource ${i + 1}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && i === names.length - 1 && name.trim()) {
                      e.preventDefault();
                      addRow();
                    }
                  }}
                />
                {names.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-9 w-9"
                    onClick={() => removeRow(i)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={addRow}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add another
          </Button>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={validCount === 0}>
              Create {validCount || ""}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
