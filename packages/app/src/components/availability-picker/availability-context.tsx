'use client';

import * as React from 'react';
import type { AvailabilitySlot } from './hooks/use-availability';

export type AvailabilityContextValue = {
	selectedDate: Date | undefined;
	setSelectedDate: (date: Date | undefined) => void;
	timezone: string;
	setTimezone: (tz: string) => void;
	slots: {
		start: number;
		end: number;
		available: boolean;
		isReleased?: boolean;
	}[];
	isLoading: boolean;
	error: Error | null;
	availableDays: Set<string>;
	refreshMonth: (date: Date) => Promise<void>;
	onSlotSelect: (slot: AvailabilitySlot) => void;
	formatTime: (date: Date | number) => string;
	formatDate: (date: Date | number) => string;
};

export const AvailabilityContext = React.createContext<
	AvailabilityContextValue | undefined
>(undefined);

export const useAvailabilityContext = () => {
	const context = React.useContext(AvailabilityContext);
	if (!context) {
		throw new Error(
			'useAvailabilityContext must be used within an AvailabilityProvider',
		);
	}
	return context;
};
