import { describe, expect, it } from 'bun:test';
import type {
	BookingId,
	HoldId,
	ResourceId,
	SessionId,
	TenantId,
} from '@open-tap/protocol';
import type { InventoryState } from '../inventory-types';
import { createBookingManager } from './manager';

const TENANT_ID = 'tenant-test' as TenantId;
const RESOURCE_ID = 'resource-test' as ResourceId;
const SESSION_ID = 'session-test' as SessionId;
const HOLD_ID = 'hold-test' as HoldId;
const BOOKING_ID = 'booking-test' as BookingId;

const createEmptyState = (): InventoryState => ({
	booked: [],
	held: [],
});

const createMockDependencies = () => {
	const holds = new Map<
		HoldId,
		{
			tenantId: TenantId;
			resourceId: ResourceId;
			sessionId: SessionId;
			startUnix: number;
			endUnix: number;
			expiresAt: number;
		}
	>();

	const bookings = new Map<
		BookingId,
		{
			id: BookingId;
			tenantId: TenantId;
			resourceId: ResourceId;
			holdId?: HoldId;
			start: number;
			end: number;
			status: 'CONFIRMED' | 'CANCELLED';
			paymentStatus: 'NONE' | 'PENDING' | 'PAID';
			customerName?: string;
			customerEmail?: string;
			customerPhone?: string;
		}
	>();

	let inventoryState = createEmptyState();

	return {
		holds,
		bookings,
		setInventoryState: (state: InventoryState) => {
			inventoryState = state;
		},
		addHold: (
			holdId: HoldId,
			data: {
				tenantId: TenantId;
				resourceId: ResourceId;
				sessionId: SessionId;
				startUnix: number;
				endUnix: number;
				expiresAt: number;
			},
		) => {
			holds.set(holdId, data);
		},
		deps: {
			getState: async (_tenantId: TenantId, _resourceId: ResourceId) =>
				inventoryState,
			getHoldById: async (holdId: HoldId) => holds.get(holdId) ?? null,
			holdRepository: {
				delete: async (id: HoldId) => {
					holds.delete(id);
				},
			},
			bookingRepository: {
				create: async (booking: {
					id: BookingId;
					tenantId: TenantId;
					resourceId: ResourceId;
					holdId?: HoldId;
					start: number;
					end: number;
					status: 'CONFIRMED' | 'CANCELLED';
					paymentStatus: 'NONE' | 'PENDING' | 'PAID';
					customerName?: string;
					customerEmail?: string;
					customerPhone?: string;
				}) => {
					bookings.set(booking.id, booking);
				},
				update: async (
					id: BookingId,
					updates: Partial<{ status: 'CONFIRMED' | 'CANCELLED' }>,
				) => {
					const existing = bookings.get(id);
					if (existing && updates.status) {
						bookings.set(id, { ...existing, status: updates.status });
					}
				},
			},
			withLock: async (_key: string) => () => {},
		},
	};
};

describe('BookingManager', () => {
	describe('confirmBooking', () => {
		it('confirms booking from valid hold', async () => {
			const { deps, addHold, holds, bookings } = createMockDependencies();
			const manager = createBookingManager(deps);

			const now = Date.now();
			addHold(HOLD_ID, {
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			const event = await manager.confirmBooking({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				holdId: HOLD_ID,
				sessionId: SESSION_ID,
				bookingId: BOOKING_ID,
				start: now,
				end: now + 15 * 60 * 1000,
			});

			expect(event).not.toBeNull();
			expect(event?.type).toBe('BookingConfirmed');
			expect(event?.payload.bookingId).toBe(BOOKING_ID);
			expect(event?.payload.holdId).toBe(HOLD_ID);

			expect(holds.has(HOLD_ID)).toBe(false);
			expect(bookings.has(BOOKING_ID)).toBe(true);
		});

		it('returns null for non-existent hold', async () => {
			const { deps } = createMockDependencies();
			const manager = createBookingManager(deps);

			const now = Date.now();
			const event = await manager.confirmBooking({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				holdId: 'non-existent' as HoldId,
				sessionId: SESSION_ID,
				bookingId: BOOKING_ID,
				start: now,
				end: now + 15 * 60 * 1000,
			});

			expect(event).toBeNull();
		});

		it('returns null for hold owned by different session', async () => {
			const { deps, addHold } = createMockDependencies();
			const manager = createBookingManager(deps);

			const now = Date.now();
			addHold(HOLD_ID, {
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: 'other-session' as SessionId,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			const event = await manager.confirmBooking({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				holdId: HOLD_ID,
				sessionId: SESSION_ID,
				bookingId: BOOKING_ID,
				start: now,
				end: now + 15 * 60 * 1000,
			});

			expect(event).toBeNull();
		});

		it('returns null when slot has overlapping booking', async () => {
			const { deps, addHold, setInventoryState } = createMockDependencies();
			const manager = createBookingManager(deps);

			const now = Date.now();
			addHold(HOLD_ID, {
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			setInventoryState({
				booked: [
					{
						start: now + 10 * 60 * 1000,
						end: now + 25 * 60 * 1000,
						value: 1,
					},
				],
				held: [
					{
						start: now,
						end: now + 15 * 60 * 1000,
						value: 1,
					},
				],
			});

			const event = await manager.confirmBooking({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				holdId: HOLD_ID,
				sessionId: SESSION_ID,
				bookingId: BOOKING_ID,
				start: now,
				end: now + 15 * 60 * 1000,
			});

			expect(event).toBeNull();
		});

		it('includes customer info in event when provided', async () => {
			const { deps, addHold } = createMockDependencies();
			const manager = createBookingManager(deps);

			const now = Date.now();
			addHold(HOLD_ID, {
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			const event = await manager.confirmBooking({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				holdId: HOLD_ID,
				sessionId: SESSION_ID,
				bookingId: BOOKING_ID,
				start: now,
				end: now + 15 * 60 * 1000,
				customerName: 'John Doe',
				customerEmail: 'john@example.com',
				customerPhone: '+1234567890',
			});

			expect(event).not.toBeNull();
			expect(event?.payload.customerName).toBe('John Doe');
			expect(event?.payload.customerEmail).toBe('john@example.com');
			expect(event?.payload.customerPhone).toBe('+1234567890');
		});

		it('includes payment info in event when provided', async () => {
			const { deps, addHold } = createMockDependencies();
			const manager = createBookingManager(deps);

			const now = Date.now();
			addHold(HOLD_ID, {
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			const event = await manager.confirmBooking({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				holdId: HOLD_ID,
				sessionId: SESSION_ID,
				bookingId: BOOKING_ID,
				start: now,
				end: now + 15 * 60 * 1000,
				paymentStatus: 'PAID',
				priceCents: 5000,
			});

			expect(event).not.toBeNull();
			expect(event?.payload.paymentStatus).toBe('PAID');
			expect(event?.payload.priceCents).toBe(5000);
		});

		it('stores booking in repository', async () => {
			const { deps, addHold, bookings } = createMockDependencies();
			const manager = createBookingManager(deps);

			const now = Date.now();
			addHold(HOLD_ID, {
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			await manager.confirmBooking({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				holdId: HOLD_ID,
				sessionId: SESSION_ID,
				bookingId: BOOKING_ID,
				start: now,
				end: now + 15 * 60 * 1000,
				customerName: 'Jane Doe',
			});

			const storedBooking = bookings.get(BOOKING_ID);
			expect(storedBooking).toBeDefined();
			expect(storedBooking?.tenantId).toBe(TENANT_ID);
			expect(storedBooking?.resourceId).toBe(RESOURCE_ID);
			expect(storedBooking?.holdId).toBe(HOLD_ID);
			expect(storedBooking?.status).toBe('CONFIRMED');
			expect(storedBooking?.customerName).toBe('Jane Doe');
		});
	});

	describe('cancelBooking', () => {
		it('cancels existing booking', async () => {
			const { deps, bookings } = createMockDependencies();
			const manager = createBookingManager(deps);

			const now = Date.now();
			bookings.set(BOOKING_ID, {
				id: BOOKING_ID,
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				start: now,
				end: now + 15 * 60 * 1000,
				status: 'CONFIRMED',
				paymentStatus: 'NONE',
			});

			const event = await manager.cancelBooking({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				bookingId: BOOKING_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
			});

			expect(event).not.toBeNull();
			expect(event?.type).toBe('BookingCancelled');
			expect(event?.payload.bookingId).toBe(BOOKING_ID);

			const updatedBooking = bookings.get(BOOKING_ID);
			expect(updatedBooking?.status).toBe('CANCELLED');
		});

		it('includes time range in cancellation event', async () => {
			const { deps, bookings } = createMockDependencies();
			const manager = createBookingManager(deps);

			const now = Date.now();
			const endTime = now + 15 * 60 * 1000;
			bookings.set(BOOKING_ID, {
				id: BOOKING_ID,
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				start: now,
				end: endTime,
				status: 'CONFIRMED',
				paymentStatus: 'NONE',
			});

			const event = await manager.cancelBooking({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				bookingId: BOOKING_ID,
				startUnix: now,
				endUnix: endTime,
			});

			expect(event?.payload.start).toBe(now);
			expect(event?.payload.end).toBe(endTime);
		});

		it('creates event with correct tenant and resource', async () => {
			const { deps, bookings } = createMockDependencies();
			const manager = createBookingManager(deps);

			const now = Date.now();
			bookings.set(BOOKING_ID, {
				id: BOOKING_ID,
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				start: now,
				end: now + 15 * 60 * 1000,
				status: 'CONFIRMED',
				paymentStatus: 'NONE',
			});

			const event = await manager.cancelBooking({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				bookingId: BOOKING_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
			});

			expect(event?.tenantId).toBe(TENANT_ID);
			expect(event?.resourceId).toBe(RESOURCE_ID);
		});
	});

	describe('edge cases', () => {
		it('handles booking with all optional fields', async () => {
			const { deps, addHold, bookings } = createMockDependencies();
			const manager = createBookingManager(deps);

			const now = Date.now();
			addHold(HOLD_ID, {
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			const event = await manager.confirmBooking({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				holdId: HOLD_ID,
				sessionId: SESSION_ID,
				bookingId: BOOKING_ID,
				start: now,
				end: now + 15 * 60 * 1000,
				customerName: 'Test User',
				customerEmail: 'test@test.com',
				customerPhone: '+1111111111',
				paymentStatus: 'PAID',
				priceCents: 10000,
			});

			expect(event).not.toBeNull();

			const storedBooking = bookings.get(BOOKING_ID);
			expect(storedBooking?.customerName).toBe('Test User');
			expect(storedBooking?.customerEmail).toBe('test@test.com');
			expect(storedBooking?.customerPhone).toBe('+1111111111');
			expect(storedBooking?.paymentStatus).toBe('PAID');
		});

		it('handles booking with no optional fields', async () => {
			const { deps, addHold, bookings } = createMockDependencies();
			const manager = createBookingManager(deps);

			const now = Date.now();
			addHold(HOLD_ID, {
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			const event = await manager.confirmBooking({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				holdId: HOLD_ID,
				sessionId: SESSION_ID,
				bookingId: BOOKING_ID,
				start: now,
				end: now + 15 * 60 * 1000,
			});

			expect(event).not.toBeNull();

			const storedBooking = bookings.get(BOOKING_ID);
			expect(storedBooking?.paymentStatus).toBe('NONE');
		});

		it('properly excludes own hold when checking for overlaps', async () => {
			const { deps, addHold, setInventoryState } = createMockDependencies();
			const manager = createBookingManager(deps);

			const now = Date.now();
			addHold(HOLD_ID, {
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				sessionId: SESSION_ID,
				startUnix: now,
				endUnix: now + 15 * 60 * 1000,
				expiresAt: now + 5 * 60 * 1000,
			});

			setInventoryState({
				booked: [],
				held: [
					{
						start: now,
						end: now + 15 * 60 * 1000,
						value: 1,
					},
				],
			});

			const event = await manager.confirmBooking({
				tenantId: TENANT_ID,
				resourceId: RESOURCE_ID,
				holdId: HOLD_ID,
				sessionId: SESSION_ID,
				bookingId: BOOKING_ID,
				start: now,
				end: now + 15 * 60 * 1000,
			});

			expect(event).not.toBeNull();
		});
	});
});
