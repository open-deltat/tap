'use client';

import { HoldClient } from '@tap/client';
import { useCallback, useEffect, useRef, useState } from 'react';

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
	const [sessionId, setSessionId] = useState<string | null>(null);
	const clientRef = useRef<HoldClient | null>(null);

	// Recreate client if config changes, but generally this shouldn't change often in a session
	useEffect(() => {
		clientRef.current = new HoldClient({
			apiBaseUrl,
			tenantSlug,
			resourceSlug,
		});
		return () => {
			clientRef.current?.disconnect();
		};
	}, [apiBaseUrl, tenantSlug, resourceSlug]);

	const placeHold = useCallback(async (slot: { slotId: string }) => {
		if (!clientRef.current) throw new Error('Client not initialized');
		const result = await clientRef.current.placeHold(slot.slotId);
		setSessionId(result.sessionId);
		return result.holdId;
	}, []);

	const releaseHold = useCallback((holdId: string) => {
		if (clientRef.current) {
			clientRef.current.releaseHold(holdId);
			// Session ID might remain until we explicitly clear or disconnect,
			// but for this flow it usually clears on disconnect or new hold.
		}
	}, []);

	return {
		sessionId,
		placeHold,
		releaseHold,
	};
};
