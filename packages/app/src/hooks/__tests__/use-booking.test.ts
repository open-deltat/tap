import { beforeEach, describe, expect, mock, test } from 'bun:test';

global.fetch = mock(() =>
	Promise.resolve({
		ok: true,
		json: async () => ({ holdId: 'hold_123' }),
		status: 201,
	} as Response),
) as typeof fetch;

describe('useBooking API calls', () => {
	const apiBaseUrl = 'http://localhost:3001';
	const tenantSlug = 'test-tenant';
	const resourceSlug = 'test-resource';

	beforeEach(() => {
		(global.fetch as unknown as ReturnType<typeof mock>).mockClear();
	});

	test('placeHold makes correct API call', async () => {
		(global.fetch as unknown as ReturnType<typeof mock>).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ holdId: 'hold_123' }),
			status: 201,
		} as Response);

		const slot = { start: Date.now(), end: Date.now() + 3600000 };
		const response = await fetch(
			`${apiBaseUrl}/v1/public/${tenantSlug}/${resourceSlug}/hold`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ start: slot.start, end: slot.end }),
			},
		);

		expect(response.ok).toBe(true);
		const data = await response.json();
		expect(data.holdId).toBe('hold_123');
		expect(global.fetch).toHaveBeenCalledWith(
			`${apiBaseUrl}/v1/public/${tenantSlug}/${resourceSlug}/hold`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ start: slot.start, end: slot.end }),
			},
		);
	});

	test('placeHold handles API errors', async () => {
		(global.fetch as unknown as ReturnType<typeof mock>).mockResolvedValueOnce({
			ok: false,
			status: 409,
			statusText: 'Conflict',
			json: async () => ({ error: 'Slot not available' }),
		} as Response);

		const slot = { start: Date.now(), end: Date.now() + 3600000 };
		const response = await fetch(
			`${apiBaseUrl}/v1/public/${tenantSlug}/${resourceSlug}/hold`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ start: slot.start, end: slot.end }),
			},
		);

		expect(response.ok).toBe(false);
		expect(response.status).toBe(409);
		const errorData = await response.json();
		expect(errorData.error).toBe('Slot not available');
	});

	test('releaseHold makes correct API call', async () => {
		(global.fetch as unknown as ReturnType<typeof mock>).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ released: true }),
			status: 200,
		} as Response);

		const holdId = 'hold_123';
		const response = await fetch(
			`${apiBaseUrl}/v1/public/${tenantSlug}/${resourceSlug}/hold/${holdId}`,
			{
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
			},
		);

		expect(response.ok).toBe(true);
		const data = await response.json();
		expect(data.released).toBe(true);
		expect(global.fetch).toHaveBeenCalledWith(
			`${apiBaseUrl}/v1/public/${tenantSlug}/${resourceSlug}/hold/${holdId}`,
			{
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
			},
		);
	});

	test('releaseHold handles API errors', async () => {
		(global.fetch as unknown as ReturnType<typeof mock>).mockResolvedValueOnce({
			ok: false,
			status: 404,
			statusText: 'Not Found',
			json: async () => ({ error: 'Hold not found' }),
		} as Response);

		const response = await fetch(
			`${apiBaseUrl}/v1/public/${tenantSlug}/${resourceSlug}/hold/hold_123`,
			{
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
			},
		);

		expect(response.ok).toBe(false);
		expect(response.status).toBe(404);
		const errorData = await response.json();
		expect(errorData.error).toBe('Hold not found');
	});

	test('confirmBooking makes correct API call', async () => {
		(global.fetch as unknown as ReturnType<typeof mock>).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ bookingId: 'booking_123' }),
			status: 201,
		} as Response);

		const bookingData = {
			holdId: 'hold_123',
			customerName: 'John Doe',
			customerEmail: 'john@example.com',
		};

		const response = await fetch(
			`${apiBaseUrl}/v1/public/${tenantSlug}/${resourceSlug}/book`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(bookingData),
			},
		);

		expect(response.ok).toBe(true);
		const data = await response.json();
		expect(data.bookingId).toBe('booking_123');
		expect(global.fetch).toHaveBeenCalledWith(
			`${apiBaseUrl}/v1/public/${tenantSlug}/${resourceSlug}/book`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(bookingData),
			},
		);
	});

	test('confirmBooking includes optional customerPhone', async () => {
		(global.fetch as unknown as ReturnType<typeof mock>).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ bookingId: 'booking_123' }),
			status: 201,
		} as Response);

		const bookingData = {
			holdId: 'hold_123',
			customerName: 'John Doe',
			customerEmail: 'john@example.com',
			customerPhone: '+1234567890',
		};

		const response = await fetch(
			`${apiBaseUrl}/v1/public/${tenantSlug}/${resourceSlug}/book`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(bookingData),
			},
		);

		expect(response.ok).toBe(true);
		const data = await response.json();
		expect(data.bookingId).toBe('booking_123');
		expect(global.fetch).toHaveBeenCalledWith(
			`${apiBaseUrl}/v1/public/${tenantSlug}/${resourceSlug}/book`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(bookingData),
			},
		);
	});

	test('confirmBooking handles API errors', async () => {
		(global.fetch as unknown as ReturnType<typeof mock>).mockResolvedValueOnce({
			ok: false,
			status: 404,
			statusText: 'Not Found',
			json: async () => ({ error: 'Hold not found' }),
		} as Response);

		const response = await fetch(
			`${apiBaseUrl}/v1/public/${tenantSlug}/${resourceSlug}/book`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					holdId: 'hold_123',
					customerName: 'John Doe',
					customerEmail: 'john@example.com',
				}),
			},
		);

		expect(response.ok).toBe(false);
		expect(response.status).toBe(404);
		const errorData = await response.json();
		expect(errorData.error).toBe('Hold not found');
	});

	test('handles network errors gracefully', async () => {
		(global.fetch as unknown as ReturnType<typeof mock>).mockRejectedValueOnce(
			new Error('Network error'),
		);

		try {
			await fetch(
				`${apiBaseUrl}/v1/public/${tenantSlug}/${resourceSlug}/hold`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						start: Date.now(),
						end: Date.now() + 3600000,
					}),
				},
			);
			expect(false).toBe(true);
		} catch (error) {
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toBe('Network error');
		}
	});
});
