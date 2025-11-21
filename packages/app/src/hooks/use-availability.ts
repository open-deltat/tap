'use client';

import { useCallback, useEffect, useState } from 'react';
import { mergeAvailability, type TimeSlot } from '@tap/ws-client';
import type { LedgerEvent } from '@tap/core';
import { toISODateString } from '@/lib/timezone';

export type AvailabilitySlot = {
    start: number;
    end: number;
};

export type UseAvailabilityOptions = {
    apiBaseUrl: string;
    tenantSlug: string;
    resourceSlug: string;
    selectedDate: Date | undefined;
    durationMinutes?: number;
    slotResolutionMinutes?: number; // Kept for compatibility but unused for logic
    fromHour?: number; // Backend handles? No, backend takes from/to date.
    toHour?: number;
};

export type UseAvailabilityResult = {
    slots: AvailabilitySlot[];
    isLoading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
    applyDelta: (event: LedgerEvent) => void;
    cursor: string | null;
};

export const useAvailability = (
    options: UseAvailabilityOptions,
): UseAvailabilityResult => {
    const {
        apiBaseUrl,
        tenantSlug,
        resourceSlug,
        selectedDate,
        durationMinutes = 60,
        fromHour = 0,
        toHour = 24,
    } = options;

    const [baseSlots, setBaseSlots] = useState<AvailabilitySlot[]>([]);
    const [currentSlots, setCurrentSlots] = useState<AvailabilitySlot[]>([]);
    const [events, setEvents] = useState<LedgerEvent[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const fetchAvailability = useCallback(
        async (date: Date) => {
            setIsLoading(true);
            setError(null);

            try {
                const fromDate = new Date(date);
                fromDate.setHours(fromHour, 0, 0, 0);
                const toDate = new Date(date);
                toDate.setHours(toHour, 0, 0, 0);

                const fromISO = toISODateString(fromDate);
                const toISO = toISODateString(toDate);

                const url = `${apiBaseUrl}/v1/public/${tenantSlug}/${resourceSlug}/availability?from=${fromISO}&to=${toISO}&durationMinutes=${durationMinutes}`;

                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });

                if (!response.ok) {
                    let errorMessage = `Failed to fetch availability: ${response.status} ${response.statusText}`;
                    try {
                        const errorData = await response.json();
                        errorMessage = errorData.error || errorMessage;
                    } catch {}
                    throw new Error(errorMessage);
                }

                const data = (await response.json()) as {
                    slots: Array<{ start: number; end: number }>;
                    asOfEventId: string;
                };

                setBaseSlots(data.slots);
                setCursor(data.asOfEventId);
                // Keep events that are newer than the snapshot to avoid race conditions
                setEvents((prev) => {
                    if (!data.asOfEventId) return prev;
                    return prev.filter((e) => e.eventId > data.asOfEventId);
                });

            } catch (err) {
                setError(err instanceof Error ? err : new Error('Unknown error'));
            } finally {
                setIsLoading(false);
            }
        },
        [
            apiBaseUrl,
            tenantSlug,
            resourceSlug,
            durationMinutes,
            fromHour,
            toHour,
        ],
    );

    const refresh = useCallback(async () => {
        if (selectedDate) {
            await fetchAvailability(selectedDate);
        }
    }, [selectedDate, fetchAvailability]);

    useEffect(() => {
        if (selectedDate) {
            fetchAvailability(selectedDate);
        }
    }, [selectedDate, fetchAvailability]);

    const applyDelta = useCallback(
        (event: LedgerEvent) => {
            console.log('[useAvailability] Applying Delta:', event);
            setEvents((prev) => {
                if (prev.find((e) => e.eventId === event.eventId)) return prev;
                return [...prev, event];
            });
        },
        [],
    );

    useEffect(() => {
        if (baseSlots.length === 0 && events.length === 0) {
             setCurrentSlots([]);
             return;
        }

        // Use mergeAvailability from stream-client
        // It expects slots with start/end.
        const merged = mergeAvailability(baseSlots, events, cursor);
        setCurrentSlots(merged);
    }, [baseSlots, events, cursor]);

    return {
        slots: currentSlots,
        isLoading,
        error,
        refresh,
        applyDelta,
        cursor,
    };
};
