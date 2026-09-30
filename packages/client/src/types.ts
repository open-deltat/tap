/** All times are Unix milliseconds. Intervals are half-open [start, end). */

export interface Resource {
  id: string;
  parentId: string | null;
  name: string | null;
  capacity: number;
  bufferAfter: number | null;
}

export interface Rule {
  id: string;
  resourceId: string;
  start: number;
  end: number;
  blocking: boolean;
}

export interface Booking {
  id: string;
  resourceId: string;
  start: number;
  end: number;
  label: string | null;
}

export interface Hold {
  id: string;
  resourceId: string;
  start: number;
  end: number;
  expiresAt: number;
}

export interface AvailabilitySlot {
  start: number;
  end: number;
}

export type DayName = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

/**
 * Notification events from deltat's LISTEN/NOTIFY.
 * Matches deltat's Rust `Event` enum serialized via serde_json (externally tagged).
 * Wire format uses snake_case, preserved here to avoid transformation overhead.
 */
export type DeltaTEvent =
  | {
      ResourceCreated: {
        id: string;
        parent_id: string | null;
        name: string | null;
        capacity: number;
        buffer_after: number | null;
      };
    }
  | {
      /**
       * A partial update: a field is null when the UPDATE did not mention that column (the server
       * serializes absent fields as JSON null, so every key is always present). For the nullable
       * columns (name, buffer_after) the wire cannot distinguish "unchanged" from "set to NULL";
       * re-read the resource when that difference matters.
       */
      ResourceUpdated: {
        id: string;
        name: string | null;
        capacity: number | null;
        buffer_after: number | null;
      };
    }
  | { ResourceDeleted: { id: string } }
  | {
      RuleAdded: {
        id: string;
        resource_id: string;
        span: { start: number; end: number };
        blocking: boolean;
      };
    }
  | {
      RuleUpdated: {
        id: string;
        resource_id: string;
        span: { start: number; end: number };
        blocking: boolean;
      };
    }
  | { RuleRemoved: { id: string; resource_id: string } }
  | {
      HoldPlaced: {
        id: string;
        resource_id: string;
        span: { start: number; end: number };
        expires_at: number;
      };
    }
  | {
      /**
       * `span`, `reason` and `booking_id` come from kernels that describe an ending (deltat#42);
       * older kernels send only the ids. `committed` means a `BookingConfirmed` for `booking_id`
       * follows: the time did not become free.
       */
      HoldReleased: {
        id: string;
        resource_id: string;
        span?: { start: number; end: number };
        reason?: "released" | "expired" | "committed";
        booking_id?: string;
      };
    }
  | {
      BookingConfirmed: {
        id: string;
        resource_id: string;
        span: { start: number; end: number };
        label: string | null;
      };
    }
  /** `span` comes from kernels that describe an ending (deltat#42); older kernels send only the ids. */
  | { BookingCancelled: { id: string; resource_id: string; span?: { start: number; end: number } } }
  /**
   * Not a change: this subscriber fell behind and `missed` notifications were dropped (deltat#42).
   * Whatever the subscriber knows about the calendar may be stale; re-read it.
   */
  | { Lagged: { missed: number } };
