import type { Allocator, EventStore, Resource } from '@tap/core';
import { createAllocator, isWithinHorizon, replayEvents } from '@tap/core';
import {
	type BookingRepository,
	createBookingRepository,
	createDatabase,
	createHoldRepository,
	createOfferRepository,
	createPostgresEventStore,
	createResourceRepository,
	createTenantRepository,
	type HoldRepository,
	type OfferRepository,
	type ResourceRepository,
	type TenantRepository,
} from '@tap/db';

const connectionString =
	process.env.DATABASE_URL ||
	process.env.POSTGRES_URL ||
	'postgresql://tap:tap@localhost:5432/tap';

const db = createDatabase(connectionString);
const eventStore: EventStore = createPostgresEventStore(connectionString);
const allocator: Allocator = createAllocator();

export const tenantRepository: TenantRepository = createTenantRepository(db);
export const resourceRepository: ResourceRepository =
	createResourceRepository(db);
export const offerRepository: OfferRepository = createOfferRepository(db);
export const bookingRepository: BookingRepository = createBookingRepository(db);
export const holdRepository: HoldRepository = createHoldRepository(db);

export const initializeContext = async (): Promise<void> => {
	const events = await eventStore.getAll();
	await replayEvents(allocator, events);
};

export const getEventStore = (): EventStore => eventStore;
export const getAllocator = (): Allocator => allocator;

export const validateHorizon = (
	day: string,
	resource: Resource,
): { valid: boolean; error?: string } => {
	if (!isWithinHorizon(day, resource.horizonDays)) {
		return {
			valid: false,
			error: `Booking date exceeds horizon limit of ${resource.horizonDays} days`,
		};
	}
	return { valid: true };
};
