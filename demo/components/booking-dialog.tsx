"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface BookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceName: string;
  start: number;
  end: number;
  label: string;
  onLabelChange: (label: string) => void;
  onConfirm: () => void;
}

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BookingDialog({
  open,
  onOpenChange,
  resourceName,
  start,
  end,
  label,
  onLabelChange,
  onConfirm,
}: BookingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Book time slot</DialogTitle>
          <DialogDescription>
            Confirm booking for &ldquo;{resourceName}&rdquo;
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Start</span>
              <span className="font-medium">{formatDateTime(start)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">End</span>
              <span className="font-medium">{formatDateTime(end)}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="booking-label">Name / Label (optional)</Label>
            <Input
              id="booking-label"
              placeholder="e.g. Team meeting, John Smith"
              value={label}
              onChange={(e) => onLabelChange(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Confirm Booking</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CancelBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceName: string;
  start: number;
  end: number;
  onConfirm: () => void;
}

export function CancelBookingDialog({
  open,
  onOpenChange,
  resourceName,
  start,
  end,
  onConfirm,
}: CancelBookingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel booking</DialogTitle>
          <DialogDescription>
            Remove booking for &ldquo;{resourceName}&rdquo;?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Start</span>
            <span className="font-medium">{formatDateTime(start)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">End</span>
            <span className="font-medium">{formatDateTime(end)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Cancel Booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
