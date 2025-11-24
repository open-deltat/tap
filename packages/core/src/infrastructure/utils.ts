import type {
	BookingId,
	Cursor,
	EventId,
	HoldId,
	SessionId,
} from '@tap/protocol';
import { ulid } from 'ulid';

/**
 * Generate a new session ID
 */
export function createSessionId(): SessionId {
	return `session_${ulid()}` as SessionId;
}

/**
 * Generate a new event ID (for cursors/responses)
 */
export function createEventId(): EventId {
	return ulid() as EventId;
}

/**
 * Generate a new booking ID
 */
export function createBookingId(): BookingId {
	return ulid() as BookingId;
}

/**
 * Generate a new hold ID
 */
export function createHoldId(): HoldId {
	return ulid() as HoldId;
}

/**
 * Generate a cursor (currently just an event ID)
 */
export function createCursor(): Cursor {
	return ulid() as Cursor;
}

/**
 * Default hold expiration time in milliseconds
 */
export const DEFAULT_HOLD_EXPIRATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Default hold expiration for booking flow in milliseconds
 */
export const DEFAULT_BOOKING_HOLD_EXPIRATION_MS = 60 * 1000; // 1 minute

/**
 * Default slot duration in milliseconds
 */
export const DEFAULT_SLOT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Calculate hold expiration timestamp
 */
export function calculateHoldExpiration(
	now: number = Date.now(),
	durationMs: number = DEFAULT_HOLD_EXPIRATION_MS,
): number {
	return now + durationMs;
}
