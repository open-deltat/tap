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

export interface Schedule {
  id: string;
  resourceId: string;
  days: DayName[];
  startTime: string;
  endTime: string;
  utcOffsetMinutes: number;
}

/**
 * Notification events from deltat's LISTEN/NOTIFY.
 * Matches deltat's Rust `Event` enum serialized via serde_json (externally tagged).
 * Wire format uses snake_case — preserved here to avoid transformation overhead.
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
      ResourceUpdated: {
        id: string;
        name: string | null;
        capacity: number;
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
  | { HoldReleased: { id: string; resource_id: string } }
  | {
      BookingConfirmed: {
        id: string;
        resource_id: string;
        span: { start: number; end: number };
        label: string | null;
      };
    }
  | { BookingCancelled: { id: string; resource_id: string } }
  | {
      ScheduleSet: {
        id: string;
        resource_id: string;
        days_of_week: number;
        start_minutes: number;
        end_minutes: number;
        utc_offset_minutes: number;
      };
    }
  | { ScheduleRemoved: { resource_id: string } };
