import type { LedgerEvent } from '@tap/core';
import type { AvailabilitySlot } from '@tap/protocol';
import { AvailabilityClient } from './client';
import { getDayRange, getMonthGridRange } from './operations';
import { AvailabilityStore } from './store';

export type AvailabilityManagerOptions = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
	durationMs?: number;
	fromHour?: number;
	toHour?: number;
	timezone?: string;
};

export type AvailabilityManagerState = {
	slots: AvailabilitySlot[];
	cursor: string | null;
	isLoading: boolean;
	error: Error | null;
	availableDays: Set<string>;
};

export type AvailabilityManagerCallbacks = {
	onStateChange?: (state: AvailabilityManagerState) => void;
};

export class AvailabilityManager {
	private client: AvailabilityClient;
	private store: AvailabilityStore;
	private callbacks: AvailabilityManagerCallbacks = {};
	private state: AvailabilityManagerState = {
		slots: [],
		cursor: null,
		isLoading: false,
		error: null,
		availableDays: new Set(),
	};

	constructor(private options: AvailabilityManagerOptions) {
		this.client = new AvailabilityClient(
			options.apiBaseUrl,
			options.tenantSlug,
			options.resourceSlug,
		);
		this.store = new AvailabilityStore();
	}

	setCallbacks(callbacks: AvailabilityManagerCallbacks): void {
		this.callbacks = callbacks;
	}

	getState(): AvailabilityManagerState {
		return { ...this.state };
	}

	private updateState(updates: Partial<AvailabilityManagerState>): void {
		this.state = { ...this.state, ...updates };
		this.callbacks.onStateChange?.(this.state);
	}

	async fetchAvailability(date: Date): Promise<void> {
		this.updateState({ isLoading: true, error: null });

		try {
			const range = getDayRange(
				date,
				this.options.timezone,
				this.options.fromHour ?? 0,
				this.options.toHour ?? 24,
			);

			const result = await this.client.getAvailability({
				from: range.from,
				to: range.to,
				slotDurationMs: this.options.durationMs ?? 60 * 60000,
			});

			this.store.setSnapshot(result.freeSlots, result.asOfEventId);
			const snapshot = this.store.getSnapshot();
			this.updateState({
				slots: snapshot.slots as AvailabilitySlot[],
				cursor: snapshot.cursor,
				isLoading: false,
			});
		} catch (err) {
			this.updateState({
				error: err instanceof Error ? err : new Error('Unknown error'),
				isLoading: false,
			});
		}
	}

	async refreshMonth(date: Date): Promise<void> {
		try {
			const range = getMonthGridRange(date);

			const result = await this.client.getAvailability({
				from: range.from,
				to: range.to,
				slotDurationMs: this.options.durationMs ?? 60 * 60000,
			});

			const days = this.client.extractAvailableDays(
				result.freeSlots,
				this.options.timezone,
			);
			this.updateState({ availableDays: days, error: null });
		} catch (e) {
			const error = e instanceof Error ? e : new Error('Unknown error');
			console.error('Failed to fetch month availability', error);
			this.updateState({ error });
		}
	}

	applyDelta(event: LedgerEvent): void {
		this.store.applyEvent(event);
		const snapshot = this.store.getSnapshot();
		this.updateState({
			slots: snapshot.slots as AvailabilitySlot[],
			cursor: snapshot.cursor,
		});
	}

	async refresh(selectedDate: Date | undefined): Promise<void> {
		if (selectedDate) {
			await this.fetchAvailability(selectedDate);
		}
	}
}
