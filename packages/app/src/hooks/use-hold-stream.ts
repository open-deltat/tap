import type { LedgerEvent } from '@tap/core';
import {
	createTapClient,
	type HoldRequest,
	type TapClient,
} from '@tap/ws-client';
import { useCallback, useEffect, useRef, useState } from 'react';

type UseHoldStreamOptions = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
	enabled: boolean;
	cursor?: string | null;
	onEvent?: (event: LedgerEvent) => void;
};

export const useHoldStream = ({
	apiBaseUrl,
	tenantSlug,
	resourceSlug,
	enabled,
	cursor,
	onEvent,
}: UseHoldStreamOptions) => {
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [isConnected, setIsConnected] = useState(false);
	const clientRef = useRef<TapClient | null>(null);
	const onEventRef = useRef(onEvent);

	useEffect(() => {
		onEventRef.current = onEvent;
	}, [onEvent]);

	useEffect(() => {
		if (!enabled) {
			clientRef.current?.disconnect();
			clientRef.current = null;
			// State will be updated via onDisconnect callback when client disconnects
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setIsConnected(false);
			return;
		}

		const client = createTapClient({
			baseUrl: apiBaseUrl,
			tenantSlug,
			resourceSlug,
			cursor: cursor || 'LATEST',
			onSessionId: setSessionId,
			onConnect: () => setIsConnected(true),
			onDisconnect: () => setIsConnected(false),
			onEvent: (event) => onEventRef.current?.(event),
			onError: (err) => console.error('Tap Stream Error:', err),
			debug: process.env.NODE_ENV === 'development',
		});

		client.connect();
		clientRef.current = client;

		return () => {
			client.disconnect();
			clientRef.current = null;
			setIsConnected(false);
		};
	}, [apiBaseUrl, tenantSlug, resourceSlug, enabled, cursor]);

	const placeHold = useCallback((req: HoldRequest) => {
		if (!clientRef.current) return Promise.reject(new Error('Not connected'));
		return clientRef.current.placeHold(req);
	}, []);

	const releaseHold = useCallback((holdId: string) => {
		if (!clientRef.current) return Promise.resolve();
		return clientRef.current.releaseHold(holdId);
	}, []);

	return { sessionId, isConnected, placeHold, releaseHold };
};
