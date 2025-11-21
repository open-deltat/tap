import { describe, expect, test, beforeEach, mock } from 'bun:test';

global.fetch = mock(() =>
	Promise.resolve({
		ok: true,
		json: async () => ({
			slots: [{ start: Date.now(), end: Date.now() + 3600000 }],
			asOfEventId: 'event_123',
		}),
		status: 200,
	} as Response),
) as typeof fetch;

describe('useAvailability', () => {
	beforeEach(() => {
		(global.fetch as unknown as ReturnType<typeof mock>).mockClear();
	});

	test('fetchAvailability makes correct API call', async () => {
		const apiBaseUrl = 'http://localhost:3001';
		const tenantSlug = 'test-tenant';
		const resourceSlug = 'test-resource';
		const selectedDate = new Date('2025-01-15T10:00:00Z');

		(global.fetch as unknown as ReturnType<typeof mock>).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				slots: [{ start: Date.now(), end: Date.now() + 3600000 }],
				asOfEventId: 'event_123',
			}),
			status: 200,
		} as Response);

		(global.fetch as unknown as ReturnType<typeof mock>).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				events: [{ eventId: 'event_123' }],
			}),
			status: 200,
		} as Response);

		const url = `${apiBaseUrl}/v1/public/${tenantSlug}/${resourceSlug}/availability?from=2025-01-15T00:00:00.000Z&to=2025-01-15T24:00:00.000Z&durationMinutes=60`;

		const response = await fetch(url);
		const data = await response.json();

		expect(response.ok).toBe(true);
		expect(data.slots).toBeDefined();
		expect(Array.isArray(data.slots)).toBe(true);
	});

	test('handles API errors correctly', async () => {
		(global.fetch as unknown as ReturnType<typeof mock>).mockResolvedValueOnce({
			ok: false,
			status: 404,
			statusText: 'Not Found',
			json: async () => ({ error: 'Resource not found' }),
		} as Response);

		try {
			const response = await fetch(
				'http://localhost:3001/v1/public/test-tenant/test-resource/availability?from=2025-01-15&to=2025-01-15&durationMinutes=60',
			);
			expect(response.ok).toBe(false);
			expect(response.status).toBe(404);
		} catch (error) {
			expect(error).toBeInstanceOf(Error);
		}
	});

	test('applies delta events correctly', () => {
		const { applyBookingEvent } = require('../../lib/availability-state');
		const state = new Map();

		const holdPlacedEvent = {
			eventId: 'event_1',
			type: 'HoldPlaced' as const,
			payload: {
				day: '2025-01-15',
				startMinute: 600,
				endMinute: 660,
				holdId: 'hold_123',
				expiresAt: Date.now() + 30000,
			},
		};

		applyBookingEvent(state, holdPlacedEvent);

		const dayState = state.get('2025-01-15');
		expect(dayState).toBeDefined();
		expect(dayState?.held.has(600)).toBe(true);
		expect(dayState?.held.has(659)).toBe(true);
		expect(dayState?.holdMetadata.get('hold_123')).toBeDefined();
	});
});

