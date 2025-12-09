import type { LedgerEvent } from '@open-tap/core';
import { AvailabilityWebSocketClient } from './websocket-client';

export type AvailabilityStreamManagerOptions = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
};

export type AvailabilityStreamManagerState = {
	isConnected: boolean;
};

export type AvailabilityStreamManagerCallbacks = {
	onStateChange?: (state: AvailabilityStreamManagerState) => void;
	onDelta?: (event: LedgerEvent) => void;
};

export class AvailabilityStreamManager {
	private client: AvailabilityWebSocketClient;
	private callbacks: AvailabilityStreamManagerCallbacks = {};
	private state: AvailabilityStreamManagerState = {
		isConnected: false,
	};

	constructor(options: AvailabilityStreamManagerOptions) {
		this.client = new AvailabilityWebSocketClient(options);
	}

	setCallbacks(callbacks: AvailabilityStreamManagerCallbacks): void {
		this.callbacks = callbacks;
	}

	getState(): AvailabilityStreamManagerState {
		return { ...this.state };
	}

	private updateState(updates: Partial<AvailabilityStreamManagerState>): void {
		this.state = { ...this.state, ...updates };
		this.callbacks.onStateChange?.(this.state);
	}

	connect(enabled: boolean): void {
		if (!enabled) {
			this.client.disconnect();
			this.updateState({ isConnected: false });
			return;
		}

		this.client.connect({
			onDelta: (event) => {
				this.callbacks.onDelta?.(event);
			},
			onConnect: () => {
				this.updateState({ isConnected: true });
			},
			onDisconnect: () => {
				this.updateState({ isConnected: false });
			},
			onError: (error) => {
				console.error('[AvailabilityStream] Connection error:', error.message);
			},
		});
	}

	disconnect(): void {
		this.client.disconnect();
		this.updateState({ isConnected: false });
	}
}
