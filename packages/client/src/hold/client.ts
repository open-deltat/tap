import { API_ROUTES, type HoldWsServerMessage } from '@open-tap/protocol';

export type HoldClientOptions = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
};

export type PlaceHoldResult = {
	holdId: string;
	sessionId: string;
};

export class HoldClient {
	private ws: WebSocket | null = null;
	private sessionId: string | null = null;

	constructor(private options: HoldClientOptions) {}

	async placeHold(slotId: string): Promise<PlaceHoldResult> {
		this.cleanup();

		const { apiBaseUrl, tenantSlug, resourceSlug } = this.options;
		const wsUrl =
			apiBaseUrl.replace(/^http/, 'ws') +
			`${API_ROUTES.HOLD_WS}?tenantId=${encodeURIComponent(tenantSlug)}&resourceId=${encodeURIComponent(resourceSlug)}&slotId=${encodeURIComponent(slotId)}`;

		return new Promise((resolve, reject) => {
			const ws = new WebSocket(wsUrl);
			this.ws = ws;

			let holdId: string | null = null;
			let sessionId: string | null = null;

			const tryResolve = () => {
				if (holdId && sessionId) {
					clearTimeout(timeout);
					resolve({
						holdId,
						sessionId,
					});
				}
			};

			const timeout = setTimeout(() => {
				if (this.ws === ws) {
					this.cleanup();
					reject(new Error('Hold request timed out'));
				}
			}, 5000);

			ws.onmessage = (event) => {
				try {
					const msg = JSON.parse(event.data) as HoldWsServerMessage;

					if (msg.type === 'hold.session.hello') {
						sessionId = msg.sessionId;
						this.sessionId = sessionId;
						tryResolve();
					} else if (msg.type === 'hold.confirmed') {
						holdId = msg.holdId;
						tryResolve();
					} else if (msg.type === 'hold.error') {
						clearTimeout(timeout);
						this.cleanup();
						reject(new Error(msg.message));
					}
				} catch (err) {
					clearTimeout(timeout);
					this.cleanup();
					reject(
						err instanceof Error ? err : new Error('Failed to parse message'),
					);
				}
			};

			ws.onclose = (event) => {
				if (this.ws === ws) {
					this.ws = null;
					this.sessionId = null;
				}
				if (!holdId || !sessionId) {
					clearTimeout(timeout);
					reject(
						new Error(
							`WebSocket closed before hold confirmed: ${event.code} ${event.reason || ''}`,
						),
					);
				}
			};

			ws.onerror = () => {
				clearTimeout(timeout);
				this.cleanup();
				reject(new Error('WebSocket connection error'));
			};
		});
	}

	releaseHold(holdId: string): void {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify({ type: 'hold.release', holdId }));
		}
	}

	disconnect(): void {
		this.cleanup();
	}

	private cleanup(): void {
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
		this.sessionId = null;
	}

	getSessionId(): string | null {
		return this.sessionId;
	}
}
