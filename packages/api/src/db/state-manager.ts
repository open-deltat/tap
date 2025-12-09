import type { BookingInfo, InventoryState } from '@open-tap/core';
import {
	type BookingId,
	bookingId,
	type HoldId,
	holdId,
	type ResourceId,
	resourceId,
	type SessionId,
	sessionId,
	type TenantId,
	tenantId,
} from '@open-tap/protocol';
import { and, eq, gt } from 'drizzle-orm';
import type { SqliteDatabase } from './index';
import type { BookingRepository, HoldRepository } from './repositories';
import { createBookingRepository, createHoldRepository } from './repositories';
import { bookings, holds } from './schema';

const BOOKING_STATUS = ['CONFIRMED', 'CANCELLED'] as const;
type BookingStatus = (typeof BOOKING_STATUS)[number];
const isBookingStatus = (value: string): value is BookingStatus => {
	for (const status of BOOKING_STATUS) {
		if (status === value) return true;
	}
	return false;
};

export type DbStateManager = {
	getState: (tid: TenantId, rid: ResourceId) => Promise<InventoryState>;
	getHoldById: (hid: HoldId) => Promise<{
		tenantId: TenantId;
		resourceId: ResourceId;
		sessionId: SessionId;
		startUnix: number;
		endUnix: number;
		expiresAt: number;
	} | null>;
	getHoldsBySession: (sid: SessionId) => Promise<
		Array<{
			holdId: HoldId;
			tenantId: TenantId;
			resourceId: ResourceId;
			startUnix: number;
			endUnix: number;
			expiresAt: number;
		}>
	>;
	getBookingById: (bid: BookingId) => Promise<BookingInfo | null>;
	holdRepository: HoldRepository;
	bookingRepository: BookingRepository;
};

export const createDbStateManager = (db: SqliteDatabase): DbStateManager => {
	const holdRepo = createHoldRepository(db);
	const bookingRepo = createBookingRepository(db);

	return {
		getState: async (tid, rid) => {
			const now = Date.now();

			const [bookingRows, holdRows] = await Promise.all([
				db
					.select()
					.from(bookings)
					.where(
						and(
							eq(bookings.tenantId, tid),
							eq(bookings.resourceId, rid),
							eq(bookings.status, 'CONFIRMED'),
						),
					),
				db
					.select()
					.from(holds)
					.where(
						and(
							eq(holds.tenantId, tid),
							eq(holds.resourceId, rid),
							gt(holds.expiresAt, now),
						),
					),
			]);

			return {
				booked: bookingRows.map((row) => ({
					start: row.start,
					end: row.end,
					value: 1,
				})),
				held: holdRows.map((row) => ({
					start: row.startUnix,
					end: row.endUnix,
					value: 1,
				})),
			};
		},
		getHoldById: async (hid) => {
			const [row] = await db
				.select()
				.from(holds)
				.where(eq(holds.id, hid))
				.limit(1);
			if (!row) return null;
			return {
				tenantId: tenantId(row.tenantId),
				resourceId: resourceId(row.resourceId),
				sessionId: sessionId(row.sessionId),
				startUnix: row.startUnix,
				endUnix: row.endUnix,
				expiresAt: row.expiresAt,
			};
		},
		getHoldsBySession: async (sid) => {
			const rows = await db
				.select()
				.from(holds)
				.where(eq(holds.sessionId, sid));
			return rows.map((row) => ({
				holdId: holdId(row.id),
				tenantId: tenantId(row.tenantId),
				resourceId: resourceId(row.resourceId),
				startUnix: row.startUnix,
				endUnix: row.endUnix,
				expiresAt: row.expiresAt,
			}));
		},
		getBookingById: async (bid) => {
			const [row] = await db
				.select()
				.from(bookings)
				.where(eq(bookings.id, bid))
				.limit(1);
			if (!row) return null;
			if (!isBookingStatus(row.status)) return null;
			return {
				id: bookingId(row.id),
				tenantId: tenantId(row.tenantId),
				resourceId: resourceId(row.resourceId),
				start: row.start,
				end: row.end,
				status: row.status,
			};
		},
		holdRepository: holdRepo,
		bookingRepository: bookingRepo,
	};
};
