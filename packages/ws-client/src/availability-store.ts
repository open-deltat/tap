import type { LedgerEvent } from '@tap/core';
import { parseDayToUnixStartOfDayUTC } from '@tap/core';

export type TimeSlot = { start: number; end: number };

export class AvailabilityStore {
	private slots: TimeSlot[] = [];
	private cursor: string | null = null;

	constructor(
		initialSlots: TimeSlot[] = [],
		initialCursor: string | null = null,
	) {
		this.slots = initialSlots;
		this.cursor = initialCursor;
	}

	public getSnapshot() {
		return {
			slots: [...this.slots],
			cursor: this.cursor,
		};
	}

	public setSnapshot(slots: TimeSlot[], cursor: string | null) {
		this.slots = slots;
		this.cursor = cursor;
	}

	public applyEvent(event: LedgerEvent): void {
		// Ignore events older than our snapshot
		if (this.cursor && event.eventId <= this.cursor) {
			return;
		}

		// Ideally we should track the latest cursor seen
		if (!this.cursor || event.eventId > this.cursor) {
			this.cursor = event.eventId;
		}

		const range = this.getEventTimeRange(event);
		if (!range) return;

		if (this.isBlocking(event)) {
			this.slots = this.subtractRange(this.slots, range.start, range.end);
		} else if (this.isReleasing(event)) {
			this.slots = this.addRange(this.slots, range.start, range.end);
		}
	}

	private getEventTimeRange(event: LedgerEvent): TimeSlot | null {
		if (
			event.type === 'HoldPlaced' ||
			event.type === 'HoldExpired' ||
			event.type === 'HoldReleased'
		) {
			if (
				!event.payload.day ||
				event.payload.startMinute === undefined ||
				event.payload.endMinute === undefined
			) {
				return null;
			}
			const dayStart = parseDayToUnixStartOfDayUTC(event.payload.day);
			return {
				start: dayStart + event.payload.startMinute * 60000,
				end: dayStart + event.payload.endMinute * 60000,
			};
		}
		if (
			event.type === 'BookingConfirmed' ||
			event.type === 'BookingCancelled'
		) {
			if (
				event.payload.start === undefined ||
				event.payload.end === undefined
			) {
				return null;
			}
			return {
				start: event.payload.start,
				end: event.payload.end,
			};
		}
		return null;
	}

	private isBlocking(event: LedgerEvent) {
		return event.type === 'HoldPlaced' || event.type === 'BookingConfirmed';
	}

	private isReleasing(event: LedgerEvent) {
		return (
			event.type === 'HoldExpired' ||
			event.type === 'HoldReleased' ||
			event.type === 'BookingCancelled'
		);
	}

	private subtractRange(
		slots: TimeSlot[],
		start: number,
		end: number,
	): TimeSlot[] {
		const result: TimeSlot[] = [];
		for (const slot of slots) {
			// Case 1: No overlap
			if (slot.end <= start || slot.start >= end) {
				result.push(slot);
				continue;
			}
			// Case 2: Overlap
			// Left part?
			if (slot.start < start) {
				result.push({ start: slot.start, end: start });
			}
			// Right part?
			if (slot.end > end) {
				result.push({ start: end, end: slot.end });
			}
		}
		return result;
	}

	private addRange(slots: TimeSlot[], start: number, end: number): TimeSlot[] {
		// Add range and merge overlapping/adjacent slots
		const newSlots = [...slots, { start, end }];
		newSlots.sort((a, b) => a.start - b.start);

		const result: TimeSlot[] = [];
		if (newSlots.length === 0) return result;

		const first = newSlots[0];
		if (!first) return result;

		let current = first;
		for (let i = 1; i < newSlots.length; i++) {
			const next = newSlots[i];
			if (!next) continue;

			if (next.start <= current.end) {
				// Merge
				current.end = Math.max(current.end, next.end);
			} else {
				result.push(current);
				current = next;
			}
		}
		result.push(current);
		return result;
	}
}
