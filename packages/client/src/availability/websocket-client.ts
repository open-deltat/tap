import type { LedgerEvent } from '@open-tap/core';
import {
	API_ROUTES,
	type AvailabilityDeltaPayload,
	type AvailabilityWsServerMessage,
} from '@open-tap/protocol';

export type AvailabilityWebSocketClientOptions = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
};

export type AvailabilityWebSocketCallbacks = {
	onDelta?: (event: LedgerEvent) => void;
	onConnect?: () => void;
	onDisconnect?: () => void;
	onError?: (error: Error) => void;
};

export class AvailabilityWebSocketClient {
	private ws: WebSocket | null = null;
	private callbacks: AvailabilityWebSocketCallbacks = {};
	private isConnected = false;

	constructor(private options: AvailabilityWebSocketClientOptions) {}

	connect(callbacks: AvailabilityWebSocketCallbacks = {}): void {
		if (
			this.ws &&
			(this.ws.readyState === WebSocket.OPEN ||
				this.ws.readyState === WebSocket.CONNECTING)
		) {
			this.callbacks = callbacks;
			return;
		}

		this.cleanup();
		this.callbacks = callbacks;

		const { apiBaseUrl, tenantSlug, resourceSlug } = this.options;
		const wsUrl = `${apiBaseUrl.replace(/^http/, 'ws')}${API_ROUTES.AVAILABILITY_WS}`;

		let ws: WebSocket;
		try {
			ws = new WebSocket(wsUrl);
			this.ws = ws;
		} catch (error) {
			this.callbacks.onError?.(
				error instanceof Error
					? error
					: new Error('Failed to create WebSocket'),
			);
			return;
		}

		ws.onopen = () => {
			this.isConnected = true;
			this.callbacks.onConnect?.();
			ws.send(
				JSON.stringify({
					type: 'stream.subscribe',
					tenantId: tenantSlug,
					resourceId: resourceSlug,
				}),
			);
		};

		ws.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data) as AvailabilityWsServerMessage;

				if (message.type === 'stream.hello') return;
				if (message.type === 'stream.error') {
					this.callbacks.onError?.(new Error(message.message));
					return;
				}
				if (message.type === 'stream.delta') {
					const ledgerEvent = this.mapDeltaToLedgerEvent(
						message.eventId,
						message.payload,
					);
					if (ledgerEvent) this.callbacks.onDelta?.(ledgerEvent);
				}
			} catch (err) {
				this.callbacks.onError?.(
					err instanceof Error ? err : new Error('Failed to parse message'),
				);
			}
		};

		ws.onclose = () => {
			this.isConnected = false;
			this.ws = null;
			this.callbacks.onDisconnect?.();
		};

		ws.onerror = () => {};
	}

	disconnect(): void {
		this.cleanup();
	}

	getIsConnected(): boolean {
		return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
	}

	private cleanup(): void {
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
		this.isConnected = false;
	}

	private mapDeltaToLedgerEvent(
		eventId: string,
		delta: AvailabilityDeltaPayload,
	): LedgerEvent | null {
		const base = {
			eventId,
			tenantId: delta.tenantId,
			resourceId: delta.resourceId,
			createdAt: Date.now(),
			version: 1 as const,
		};

		if (delta.kind === 'HoldPlaced' && delta.holdId) {
			return {
				...base,
				type: 'HoldPlaced' as const,
				payload: {
					holdId: delta.holdId,
					startUnix: delta.startUnix,
					endUnix: delta.endUnix,
					expiresAt: Date.now() + 60000,
				},
			};
		}

		if (delta.kind === 'HoldReleased' && delta.holdId) {
			return {
				...base,
				type: 'HoldReleased' as const,
				payload: {
					holdId: delta.holdId,
					startUnix: delta.startUnix,
					endUnix: delta.endUnix,
				},
			};
		}

		if (delta.kind === 'HoldExpired' && delta.holdId) {
			return {
				...base,
				type: 'HoldExpired' as const,
				payload: {
					holdId: delta.holdId,
					startUnix: delta.startUnix,
					endUnix: delta.endUnix,
				},
			};
		}

		if (delta.kind === 'BookingConfirmed' && delta.bookingId && delta.holdId) {
			return {
				...base,
				type: 'BookingConfirmed' as const,
				payload: {
					bookingId: delta.bookingId,
					holdId: delta.holdId,
					start: delta.startUnix,
					end: delta.endUnix,
				},
			};
		}

		if (delta.kind === 'BookingCancelled' && delta.bookingId) {
			return {
				...base,
				type: 'BookingCancelled' as const,
				payload: {
					bookingId: delta.bookingId,
					start: delta.startUnix,
					end: delta.endUnix,
				},
			};
		}

		return null;
	}
}
