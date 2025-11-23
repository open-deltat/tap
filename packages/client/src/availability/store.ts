import type { LedgerEvent } from '@tap/core';
import { applyEventToSlots, type TimeRange } from './operations';

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

	public setSnapshot(slots: TimeRange[], cursor: string | null) {
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

		const prevCount = this.slots.length;
		this.slots = applyEventToSlots(this.slots, event);

		if (this.slots.length !== prevCount) {
			this.addLog(`Slots updated: ${prevCount} -> ${this.slots.length}`);
		}
	}
}
