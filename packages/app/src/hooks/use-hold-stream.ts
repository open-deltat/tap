import { useEffect, useRef, useState, useCallback } from 'react';
import { createTapClient, type TapClient, type HoldRequest } from '@tap/ws-client';
import type { LedgerEvent } from '@tap/core';

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
    onEvent
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
            setIsConnected(false);
            return;
        }

        // Only connect if cursor is provided (or explicit '0' logic handled upstream)
        // Actually EnhancedCalendar passes cursor when available.
        // If cursor is missing, we might want to wait?
        // But hold-stream needs to be open for Holds even if cursor is missing?
        // But we merged them.
        // API handles undefined cursor (starts from 0/LATEST).
        // We should connect even if cursor is null/undefined if we want to place holds?
        // Yes.

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
            debug: process.env.NODE_ENV === 'development'
        });

        client.connect();
        clientRef.current = client;

        return () => {
            client.disconnect();
            clientRef.current = null;
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
