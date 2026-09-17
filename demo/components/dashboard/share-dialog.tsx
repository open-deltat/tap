"use client";

import { Share2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@open-deltat/examples/components/ui/dialog";
import { Button } from "@open-deltat/examples/components/ui/button";
import { CopyLink } from "@/components/dashboard/copy-link";

// The booking link is copied once and then rarely again, so it lives behind a button, not a card.
export function ShareDialog({ path }: { path: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2 />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Booking link</DialogTitle>
          <DialogDescription>
            Share this link or point an AI agent at it. Anyone can book on this calendar.
          </DialogDescription>
        </DialogHeader>
        <CopyLink path={path} />
      </DialogContent>
    </Dialog>
  );
}
