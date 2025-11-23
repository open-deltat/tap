import { API_ROUTES, type HoldWsServerMessage } from '@tap/protocol';

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
			`${API_ROUTES.HOLD_WS}?tenantId=${tenantSlug}&resourceId=${resourceSlug}&slotId=${slotId}`;

		return new Promise((resolve, reject) => {
			const ws = new WebSocket(wsUrl);
			this.ws = ws;

			// Safety timeout
			const timeout = setTimeout(() => {
				if (this.ws === ws) {
					this.cleanup();
					reject(new Error('Hold request timed out'));
				}
			}, 5000);

			ws.onopen = () => {
				// Connection established
			};

			ws.onmessage = (event) => {
				try {
					const msg = JSON.parse(event.data) as HoldWsServerMessage;

					if (msg.type === 'hold.session.hello') {
						this.sessionId = msg.sessionId;
					} else if (msg.type === 'hold.confirmed') {
						clearTimeout(timeout);
						if (this.sessionId) {
							resolve({
								holdId: msg.holdId,
								sessionId: this.sessionId,
							});
						} else {
							// Should technically have session ID by now or very soon
							// But for safety, we might wait or just resolve if we have it.
							// The protocol usually sends hello immediately.
						}
					} else if (msg.type === 'hold.error') {
						clearTimeout(timeout);
						this.cleanup();
						reject(new Error(msg.message));
					}
				} catch (err) {
					console.error('Hold WS parse error', err);
				}
			};

			ws.onclose = () => {
				if (this.ws === ws) {
					this.ws = null;
					this.sessionId = null;
				}
			};

			ws.onerror = () => {
				// Error handling usually falls through to close or timeout
			};
		});
	}

	releaseHold(holdId: string): void {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(
				JSON.stringify({
					type: 'hold.release',
					holdId,
				}),
			);
			// We effectively consider it released/closed locally
			// The server will close the connection.
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
