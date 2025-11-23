import type { LedgerEvent } from '@tap/core';
import type { TimeSlot } from '../types';

export class AvailabilityStore {
	private slots: TimeSlot[] = [];
	private cursor: string | null = null;
	private logs: string[] = [];

	constructor(
		initialSlots: TimeSlot[] = [],
		initialCursor: string | null = null,
	) {
		this.slots = initialSlots;
		this.cursor = initialCursor;
		this.addLog('Store initialized');
	}

	public getSnapshot() {
		return {
			slots: [...this.slots],
			cursor: this.cursor,
		};
	}

	public getLogs() {
		return [...this.logs];
	}

	private addLog(msg: string) {
		this.logs.unshift(`[${new Date().toISOString()}] ${msg}`);
		if (this.logs.length > 100) this.logs.pop();
	}

	public setSnapshot(slots: TimeSlot[], cursor: string | null) {
		this.slots = slots;
		this.cursor = cursor;
		this.addLog(`Snapshot set: ${slots.length} slots, cursor: ${cursor}`);
	}

	public applyEvent(event: LedgerEvent): void {
		this.addLog(`Received event ${event.type} (${event.eventId})`);

		// Ignore events older than our snapshot
		if (this.cursor && (event.eventId as string) <= this.cursor) {
			this.addLog(
				`Ignored old event ${event.eventId} (cursor: ${this.cursor})`,
			);
			return;
		}

		// Ideally we should track the latest cursor seen
		if (!this.cursor || (event.eventId as string) > this.cursor) {
			this.cursor = event.eventId as string;
		}

		const range = this.getEventTimeRange(event);
		if (!range) {
			this.addLog(`Could not determine range for event ${event.type}`);
			return;
		}

		const prevCount = this.slots.length;
		if (this.isBlocking(event)) {
			this.slots = this.subtractRange(this.slots, range.start, range.end);
			this.addLog(
				`Blocked range ${new Date(range.start).toISOString()} - ${new Date(range.end).toISOString()}. Slots: ${prevCount} -> ${this.slots.length}`,
			);
		} else if (this.isReleasing(event)) {
			this.slots = this.addRange(this.slots, range.start, range.end);
			this.addLog(
				`Released range ${new Date(range.start).toISOString()} - ${new Date(range.end).toISOString()}. Slots: ${prevCount} -> ${this.slots.length}`,
			);
		} else {
			this.addLog(`Event ${event.type} produced no action.`);
		}
	}

	private getEventTimeRange(event: LedgerEvent): TimeSlot | null {
		if (
			event.type === 'HoldPlaced' ||
			event.type === 'HoldExpired' ||
			event.type === 'HoldReleased'
		) {
			if (
				event.payload.startUnix === undefined ||
				event.payload.endUnix === undefined
			) {
				return null;
			}
			return {
				start: event.payload.startUnix,
				end: event.payload.endUnix,
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

		let current = { ...first }; // Copy to avoid mutation issues
		for (let i = 1; i < newSlots.length; i++) {
			const next = newSlots[i];
			if (!next) continue;

			// If next starts within or immediately after current (mergable)
			// Be careful with adjacency.
			// If current is [10:00, 11:00] and next is [11:00, 12:00], they should merge.
			if (next.start <= current.end) {
				// Merge
				current.end = Math.max(current.end, next.end);
			} else {
				// Gap found, push current and start new
				result.push(current);
				current = { ...next };
			}
		}
		result.push(current);
		return result;
	}
}
