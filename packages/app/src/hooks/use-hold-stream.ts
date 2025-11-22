'use client';

import type { HoldWsServerMessage } from '@tap/protocol';
import { useCallback, useRef, useState } from 'react';

type UseHoldStreamOptions = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
	enabled?: boolean; // Not strictly used as we connect on demand, but kept for compat
	cursor?: string | null;
	onEvent?: (event: unknown) => void; // Used for local optimistic updates if needed
};

export const useHoldStream = ({
	apiBaseUrl,
	tenantSlug,
	resourceSlug,
}: UseHoldStreamOptions) => {
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [isConnected, setIsConnected] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);

	const placeHold = useCallback(
		(slot: { slotId: string }) => {
			return new Promise<string>((resolve, reject) => {
				// Close existing
				if (wsRef.current) {
					wsRef.current.close();
				}

				const wsUrl =
					apiBaseUrl.replace(/^http/, 'ws') +
					`/hold-ws?tenantId=${tenantSlug}&resourceId=${resourceSlug}&slotId=${slot.slotId}`;
				const ws = new WebSocket(wsUrl);
				wsRef.current = ws;

				const timeout = setTimeout(() => {
					if (wsRef.current === ws) {
						ws.close();
						reject(new Error('Hold request timed out'));
					}
				}, 5000);

				ws.onopen = () => {
					setIsConnected(true);
				};

				ws.onmessage = (event) => {
					try {
						const msg = JSON.parse(event.data) as HoldWsServerMessage;
						if (msg.type === 'hold.session.hello') {
							setSessionId(msg.sessionId);
						} else if (msg.type === 'hold.confirmed') {
							clearTimeout(timeout);
							resolve(msg.holdId);
						} else if (msg.type === 'hold.error') {
							clearTimeout(timeout);
							reject(new Error(msg.message));
							ws.close();
						}
					} catch (err) {
						console.error('Hold WS parse error', err);
					}
				};

				ws.onclose = () => {
					setIsConnected(false);
					if (wsRef.current === ws) {
						wsRef.current = null;
						setSessionId(null);
					}
				};

				ws.onerror = () => {
					// Error usually follows close or precedes it
				};
			});
		},
		[apiBaseUrl, tenantSlug, resourceSlug],
	);

	const releaseHold = useCallback((holdId: string) => {
		if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
			wsRef.current.send(
				JSON.stringify({
					type: 'hold.release',
					holdId,
				}),
			);
			// We don't wait for confirmation, we just send and eventually close or get closed
			// Actually, let's close it ourselves to be sure, or wait for the server to close it?
			// The server closes on release.
		}
	}, []);

	return {
		sessionId,
		isConnected,
		placeHold,
		releaseHold,
	};
};
