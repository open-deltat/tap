'use client';

import { HoldManager } from '@tap/client';
import { useCallback, useEffect, useMemo, useState } from 'react';

type UseHoldStreamOptions = {
	apiBaseUrl: string;
	tenantSlug: string;
	resourceSlug: string;
};

export const useHoldStream = ({
	apiBaseUrl,
	tenantSlug,
	resourceSlug,
}: UseHoldStreamOptions) => {
	const manager = useMemo(
		() =>
			new HoldManager({
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
			},
		});

		return () => {
			manager.disconnect();
		};
	}, [manager]);

	const placeHold = useCallback(
		async (slot: { slotId: string }) => {
			return await manager.placeHold(slot.slotId);
		},
		[manager],
	);

	const releaseHold = useCallback(
		(holdId: string) => {
			manager.releaseHold(holdId);
		},
		[manager],
	);

	return {
		sessionId: state.sessionId,
		placeHold,
		releaseHold,
	};
};
