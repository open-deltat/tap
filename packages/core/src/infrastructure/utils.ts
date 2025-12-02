import {
	type BookingId,
	bookingId,
	type EventId,
	eventId,
	type HoldId,
	holdId,
	type SessionId,
	sessionId,
} from '@tap/protocol';
import { ulid } from 'ulid';

export const DEFAULT_HOLD_EXPIRATION_MS = 5 * 60 * 1000;
export const DEFAULT_BOOKING_HOLD_EXPIRATION_MS = 60 * 1000;
export const DEFAULT_SLOT_DURATION_MS = 15 * 60 * 1000;

export const createSessionId = (): SessionId => sessionId(`session_${ulid()}`);
export const createEventId = (): EventId => eventId(ulid());
export const createBookingId = (): BookingId => bookingId(ulid());
export const createHoldId = (): HoldId => holdId(ulid());

export const calculateHoldExpiration = (
	now = Date.now(),
	durationMs = DEFAULT_HOLD_EXPIRATION_MS,
): number => now + durationMs;
