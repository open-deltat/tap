import type { LedgerEvent } from '@tap/core';
import { ulid } from 'ulid';

export type TapClientOptions = {
	baseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
	cursor?: string;
	onEvent?: (event: LedgerEvent) => void;
	onSessionId?: (sessionId: string) => void;
	onError?: (error: Error) => void;
	onConnect?: () => void;
	onDisconnect?: () => void;
	debug?: boolean;
};

export type HoldRequest = {
	day: string;
	startMinute: number;
	endMinute: number;
};

export type TapClient = {
	connect: () => void;
	disconnect: () => void;
	placeHold: (req: HoldRequest) => Promise<string>;
	releaseHold: (holdId: string) => Promise<void>;
	isConnected: () => boolean;
};

export const createTapClient = (options: TapClientOptions): TapClient => {
	let ws: WebSocket | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let isExplicitlyDisconnected = false;
	const pendingRequests = new Map<
		string,
		{ resolve: (val: unknown) => void; reject: (err: unknown) => void }
	>();

	const log = (...args: unknown[]) => {
		if (options.debug) console.log('[TapClient]', ...args);
	};

	const connect = () => {
		if (isExplicitlyDisconnected || ws) return;

		const protocol = options.baseUrl.startsWith('https') ? 'wss' : 'ws';
		const host = options.baseUrl.replace(/^https?:\/\//, '');
		let url = `${protocol}://${host}/v1/hold-stream?tenantSlug=${options.tenantSlug}&resourceSlug=${options.resourceSlug}`;
		if (options.cursor) {
			url += `&cursor=${options.cursor}`;
		}

		log('Connecting to', url);
		ws = new WebSocket(url);

		ws.onopen = () => {
			log('Connected');
			options.onConnect?.();
		};

		ws.onclose = () => {
			log('Closed');
			ws = null;
			options.onDisconnect?.();

			// Reject pending requests
			for (const [_, { reject }] of pendingRequests) {
				reject(new Error('Connection closed'));
			}
			pendingRequests.clear();

			if (!isExplicitlyDisconnected) {
				log('Reconnecting in 1s...');
				reconnectTimer = setTimeout(connect, 1000);
			}
		};

		ws.onerror = (event) => {
			log('Error', event);
			options.onError?.(new Error('WebSocket error'));
		};

		ws.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);

				switch (data.type) {
					case 'session.hello':
						options.onSessionId?.(data.sessionId);
						if (data.cursor) {
							// Optional: notify cursor update?
						}
						break;
					case 'delta':
						options.onEvent?.(data.event);
						break;
					case 'hold.confirmed': {
						const req = pendingRequests.get(data.requestId);
						if (req) {
							req.resolve(data.holdId);
							pendingRequests.delete(data.requestId);
						}
						break;
					}
					case 'hold.released': {
						// We don't strictly wait for release confirmation usually, but we can.
						// Since releaseHold uses one-way send mostly in UI?
						// Or we can resolve a promise.
						// We'll support promise if requestId matches.
						if (data.requestId) {
							const req = pendingRequests.get(data.requestId);
							if (req) {
								req.resolve(undefined);
								pendingRequests.delete(data.requestId);
							}
						}
						// Also it might be an event? No, hold.released is response.
						// Delta event 'HoldReleased' comes separately.
						break;
					}
					case 'error': {
						if (data.requestId) {
							const req = pendingRequests.get(data.requestId);
							if (req) {
								req.reject(new Error(data.message || 'Unknown error'));
								pendingRequests.delete(data.requestId);
							}
						} else {
							options.onError?.(
								new Error(data.message || 'Unknown server error'),
							);
						}
						break;
					}
				}
			} catch (err) {
				log('Message parse error', err);
			}
		};
	};

	const disconnect = () => {
		isExplicitlyDisconnected = true;
		if (reconnectTimer) clearTimeout(reconnectTimer);
		ws?.close();
		ws = null;
	};

	// biome-ignore lint/suspicious/noExplicitAny: Payload spread requires any or strictly typed object
	const send = (type: string, payload: any): Promise<any> => {
		return new Promise((resolve, reject) => {
			if (!ws || ws.readyState !== WebSocket.OPEN) {
				reject(new Error('Not connected'));
				return;
			}
			const requestId = ulid();
			pendingRequests.set(requestId, { resolve, reject });
			ws.send(JSON.stringify({ type, requestId, ...payload }));

			// Timeout?
			setTimeout(() => {
				if (pendingRequests.has(requestId)) {
					pendingRequests.get(requestId)?.reject(new Error('Timeout'));
					pendingRequests.delete(requestId);
				}
			}, 5000);
		});
	};

	const placeHold = (req: HoldRequest): Promise<string> => {
		return send('hold.request', req);
	};

	const releaseHold = (holdId: string): Promise<void> => {
		return send('hold.release', { holdId });
	};

	return {
		connect,
		disconnect,
		placeHold,
		releaseHold,
		isConnected: () => ws?.readyState === WebSocket.OPEN,
	};
};
