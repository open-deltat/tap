'use client';

import { AvailabilityStreamManager } from '@open-tap/client';
import type { LedgerEvent } from '@open-tap/core';
import { useEffect, useMemo, useRef, useState } from 'react';

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
	const onDeltaRef = useRef(onDelta);
	const onConnectRef = useRef(onConnect);
	const onDisconnectRef = useRef(onDisconnect);

	useEffect(() => {
		onDeltaRef.current = onDelta;
		onConnectRef.current = onConnect;
		onDisconnectRef.current = onDisconnect;
	}, [onDelta, onConnect, onDisconnect]);

	const manager = useMemo(
		() =>
			new AvailabilityStreamManager({
				apiBaseUrl,
				tenantSlug,
				resourceSlug,
			}),
		[apiBaseUrl, tenantSlug, resourceSlug],
	);

	const [state, setState] = useState(() => manager.getState());

	useEffect(() => {
		manager.setCallbacks({
			onStateChange: (newState) => {
				setState(newState);
				if (newState.isConnected) {
					onConnectRef.current?.();
				} else {
					onDisconnectRef.current?.();
				}
			},
			onDelta: (event) => {
				onDeltaRef.current?.(event);
			},
		});
	}, [manager]);

	useEffect(() => {
		manager.connect(enabled);
		return () => {
			manager.disconnect();
		};
	}, [manager, enabled]);

	return { isConnected: state.isConnected };
};
