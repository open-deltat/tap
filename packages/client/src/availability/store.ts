import type { LedgerEvent } from '@tap/core';
import { applyEventToSlots, type TimeRange } from './operations';

const MAX_LOG_ENTRIES = 100;

export class AvailabilityStore {
	private slots: TimeRange[] = [];
	private cursor: string | null = null;
	private logs: string[] = [];

	constructor(
		initialSlots: TimeRange[] = [],
		initialCursor: string | null = null,
	) {
		this.slots = initialSlots;
		this.cursor = initialCursor;
		this.addLog('Store initialized');
	}

	getSnapshot() {
		return { slots: [...this.slots], cursor: this.cursor };
	}

	getLogs() {
		return [...this.logs];
	}

	private addLog(message: string) {
		this.logs.unshift(`[${new Date().toISOString()}] ${message}`);
		if (this.logs.length > MAX_LOG_ENTRIES) this.logs.pop();
	}

	setSnapshot(slots: TimeRange[], cursor: string | null) {
		this.slots = slots;
		this.cursor = cursor;
		this.addLog(`Snapshot set: ${slots.length} slots, cursor: ${cursor}`);
	}

	applyEvent(event: LedgerEvent): void {
		this.addLog(`Received event ${event.type} (${event.eventId})`);

		if (this.cursor && (event.eventId as string) <= this.cursor) {
			this.addLog(
				`Ignored old event ${event.eventId} (cursor: ${this.cursor})`,
			);
			return;
		}

		if (!this.cursor || (event.eventId as string) > this.cursor) {
			this.cursor = event.eventId as string;
		}

		const previousSlotCount = this.slots.length;
		this.slots = applyEventToSlots(this.slots, event);

		if (this.slots.length !== previousSlotCount) {
			this.addLog(
				`Slots updated: ${previousSlotCount} -> ${this.slots.length}`,
			);
		}
	}
}
