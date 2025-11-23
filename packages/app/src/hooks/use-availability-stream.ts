'use client';

import type { LedgerEvent } from '@tap/core';
import type {
	AvailabilityDeltaPayload,
	AvailabilityWsServerMessage,
} from '@tap/protocol';
import { useEffect, useRef, useState } from 'react';

type UseAvailabilityStreamOptions = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
	enabled: boolean;
	onDelta?: (event: LedgerEvent) => void;
	onConnect?: () => void;
	onDisconnect?: () => void;
};

export const useAvailabilityStream = ({
	apiBaseUrl,
	tenantSlug,
	resourceSlug,
	enabled,
	onDelta,
	onConnect,
	onDisconnect,
}: UseAvailabilityStreamOptions) => {
	const [isConnected, setIsConnected] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);
	const onDeltaRef = useRef(onDelta);
	const onConnectRef = useRef(onConnect);
	const onDisconnectRef = useRef(onDisconnect);

	useEffect(() => {
		onDeltaRef.current = onDelta;
		onConnectRef.current = onConnect;
		onDisconnectRef.current = onDisconnect;
	}, [onDelta, onConnect, onDisconnect]);

	useEffect(() => {
		if (!enabled) {
			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
				setIsConnected(false);
				onDisconnectRef.current?.();
			}
			return;
		}

		const wsUrl = `${apiBaseUrl.replace(/^http/, 'ws')}/availability-ws`;
		const ws = new WebSocket(wsUrl);
		wsRef.current = ws;

		ws.onopen = () => {
			console.log('[AvailStream] Connected');
			setIsConnected(true);
			onConnectRef.current?.();
			// Subscribe
			ws.send(
				JSON.stringify({
					type: 'stream.subscribe',
					tenantId: tenantSlug,
					resourceId: resourceSlug,
				}),
			);
		};

		ws.onmessage = (event) => {
			console.log('[AvailStream] Message:', event.data);
			try {
				const msg = JSON.parse(event.data) as AvailabilityWsServerMessage;
				if (msg.type === 'stream.delta') {
					const delta = msg.payload;
					// Map Protocol Delta to Core LedgerEvent (simplified for Client Store)
					const coreEvent = mapDeltaToLedgerEvent(msg.eventId, delta);
					if (coreEvent) {
						onDeltaRef.current?.(coreEvent as LedgerEvent);
					}
				}
			} catch (err) {
				console.error('[AvailStream] Error parsing message:', err);
			}
		};

		ws.onclose = () => {
			console.log('[AvailStream] Disconnected');
			setIsConnected(false);
			wsRef.current = null;
			onDisconnectRef.current?.();
		};

		return () => {
			ws.close();
		};
	}, [apiBaseUrl, tenantSlug, resourceSlug, enabled]);

	return { isConnected };
};

// Helper to map protocol delta to the shape expected by AvailabilityStore (LedgerEvent)
function mapDeltaToLedgerEvent(
	eventId: string,
	delta: AvailabilityDeltaPayload,
) {
	const base = {
		eventId,
		tenantId: delta.tenantId,
		resourceId: delta.resourceId,
		createdAt: Date.now(),
		version: 1,
	};

	if (
		delta.kind === 'HoldPlaced' ||
		delta.kind === 'HoldReleased' ||
		delta.kind === 'HoldExpired'
	) {
		return {
			...base,
			type: delta.kind,
			payload: {
				holdId: delta.holdId,
				startUnix: delta.startUnix,
				endUnix: delta.endUnix,
			},
		};
	}

	if (delta.kind === 'BookingConfirmed' || delta.kind === 'BookingCancelled') {
		return {
			...base,
			type: delta.kind,
			payload: {
				bookingId: delta.bookingId,
				start: delta.startUnix,
				end: delta.endUnix,
				holdId: delta.holdId,
			},
		};
	}

	return null;
}
