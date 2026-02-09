"use client";

import { useState, useEffect } from "react";
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

interface ResourceSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceName: string;
  slotMinutes: number;
  bufferMinutes: number;
  onSubmit: (settings: { slotMinutes: number; bufferMinutes: number }) => void;
}

export function ResourceSettingsDialog({
  open,
  onOpenChange,
  resourceName,
  slotMinutes,
  bufferMinutes,
  onSubmit,
}: ResourceSettingsDialogProps) {
  const [slot, setSlot] = useState(slotMinutes);
  const [buffer, setBuffer] = useState(bufferMinutes);

  useEffect(() => {
    setSlot(slotMinutes);
    setBuffer(bufferMinutes);
  }, [slotMinutes, bufferMinutes]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (slot < 1) return;
    if (buffer < 0) return;
    onSubmit({ slotMinutes: slot, bufferMinutes: buffer });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Settings for &ldquo;{resourceName}&rdquo;</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="slot-minutes">Slot Duration (minutes)</Label>
            <Input
              id="slot-minutes"
              type="number"
              min={1}
              value={slot}
              onChange={(e) => setSlot(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="buffer-minutes">Buffer Time (minutes)</Label>
            <Input
              id="buffer-minutes"
              type="number"
              min={0}
              value={buffer}
              onChange={(e) => setBuffer(Number(e.target.value))}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={slot < 1}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
