import type { InventoryState } from '@tap/core';
import type { HoldId, ResourceId, SessionId, TenantId } from '@tap/protocol';
import { and, eq, gt } from 'drizzle-orm';
import type {
	BookingRepository,
	Database,
	HoldRepository,
} from './repositories';
import { createBookingRepository, createHoldRepository } from './repositories';
import { bookings, holds } from './schema';

export type DbStateManager = {
	getState: (
		tenantId: TenantId,
		resourceId: ResourceId,
	) => Promise<InventoryState>;
	getHoldById: (holdId: HoldId) => Promise<{
		tenantId: TenantId;
		resourceId: ResourceId;
		sessionId: SessionId;
		startUnix: number;
		endUnix: number;
		expiresAt: number;
	} | null>;
	getHoldsBySession: (sessionId: SessionId) => Promise<
		Array<{
			holdId: HoldId;
			tenantId: TenantId;
			resourceId: ResourceId;
			startUnix: number;
			endUnix: number;
			expiresAt: number;
		}>
	>;
	holdRepository: HoldRepository;
	bookingRepository: BookingRepository;
};

export const createDbStateManager = (db: Database): DbStateManager => {
	const holdRepository = createHoldRepository(db);
	const bookingRepository = createBookingRepository(db);

	return {
		getState: async (tenantId: TenantId, resourceId: ResourceId) => {
			try {
				const now = Date.now();

				const [bookingRows, holdRows] = await Promise.all([
					db
						.select()
						.from(bookings)
						.where(
							and(
								eq(bookings.tenantId, tenantId),
								eq(bookings.resourceId, resourceId),
								eq(bookings.status, 'CONFIRMED'),
							),
						),
					db
						.select()
						.from(holds)
						.where(
							and(
								eq(holds.tenantId, tenantId),
								eq(holds.resourceId, resourceId),
								gt(holds.expiresAt, now),
							),
						),
				]);

				const booked = bookingRows.map((row) => ({
					start: row.start,
					end: row.end,
					value: 1,
				}));

				const held = holdRows.map((row) => ({
					start: row.startUnix,
					end: row.endUnix,
					value: 1,
				}));

				return {
					booked,
					held,
				};
			} catch (error) {
				console.error('[DbStateManager] Error getting state:', error);
				throw error;
			}
		},
		getHoldById: async (holdId: HoldId) => {
			const row = await db
				.select()
				.from(holds)
				.where(eq(holds.id, holdId))
				.limit(1);
			if (!row[0]) return null;
			return {
				tenantId: row[0].tenantId as TenantId,
				resourceId: row[0].resourceId as ResourceId,
				sessionId: row[0].sessionId as SessionId,
				startUnix: row[0].startUnix,
				endUnix: row[0].endUnix,
				expiresAt: row[0].expiresAt,
			};
		},
		getHoldsBySession: async (sessionId: SessionId) => {
			const allHolds = await db
				.select()
				.from(holds)
				.where(eq(holds.sessionId, sessionId));
			return allHolds.map((row) => ({
				holdId: row.id as HoldId,
				tenantId: row.tenantId as TenantId,
				resourceId: row.resourceId as ResourceId,
				startUnix: row.startUnix,
				endUnix: row.endUnix,
				expiresAt: row.expiresAt,
			}));
		},
		holdRepository,
		bookingRepository,
	};
};
