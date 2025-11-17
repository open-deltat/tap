'use client';

import { useEffect, useRef, useState } from 'react';
import { createStreamListener } from '../../../stream-client/src/listener';
import type { BookingEvent } from '../../../stream-client/src/types';

export type UseStreamListenerOptions = {
	apiBaseUrl: string;
	cursor: string | null;
	onEvent?: (event: BookingEvent) => void;
	onError?: (error: Error) => void;
	enabled?: boolean;
};

export const useStreamListener = (options: UseStreamListenerOptions) => {
	const { apiBaseUrl, cursor, onEvent, onError, enabled = true } = options;
	const listenerRef = useRef<ReturnType<typeof createStreamListener> | null>(
		null,
	);
	const [isConnected, setIsConnected] = useState(false);
	const [currentCursor, setCurrentCursor] = useState<string | null>(cursor);

	useEffect(() => {
		if (!enabled || !cursor) {
			return;
		}

		const listener = createStreamListener({
			baseUrl: apiBaseUrl,
			cursor,
			onEvent: (event) => {
				setCurrentCursor(event.eventId);
				onEvent?.(event);
			},
			onError: (error) => {
				onError?.(error);
			},
			onConnect: () => {
				setIsConnected(true);
			},
			onClose: () => {
				setIsConnected(false);
			},
		});

		listenerRef.current = listener;
		listener.start();

		return () => {
			listener.stop();
			listenerRef.current = null;
		};
	}, [apiBaseUrl, cursor, enabled, onEvent, onError]);

	return {
		isConnected,
		currentCursor,
	};
};
