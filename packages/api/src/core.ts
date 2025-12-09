import {
	createInventory,
	type HoldExpiredEvent,
	type Inventory,
	type Offer,
} from '@tap/core';
import {
	createApiKeyRepository,
	createBookingRepository,
	createDatabase,
	createDbStateManager,
	createHoldRepository,
	createOfferRepository,
} from '@tap/db';
import {
	type AvailabilityWsServerMessage,
	createAvailabilityTopic,
	createSlotId,
	type ResourceId,
	type TenantId,
} from '@tap/protocol';
import { setApiKeyLookup } from './auth';
import { serverContext } from './server-context';

const connectionString =
	process.env.DATABASE_URL ||
	process.env.POSTGRES_URL ||
	'postgresql://tap:tap@localhost:5432/tap';

const db = createDatabase(connectionString);
const offerRepository = createOfferRepository(db);
const bookingRepository = createBookingRepository(db);
const holdRepository = createHoldRepository(db);
const apiKeyRepository = createApiKeyRepository(db);

setApiKeyLookup({
	getByKeyHash: async (keyHash) => {
		const key = await apiKeyRepository.getByKeyHash(keyHash);
		if (!key) return null;
		return {
			id: key.id,
			tenantId: key.tenantId,
			scopes: key.scopes,
		};
	},
	updateLastUsed: (id) => apiKeyRepository.updateLastUsed(id),
});

const inventories = new Map<string, Inventory>();

export const getInventory = (
	tenantId: TenantId,
	resourceId: ResourceId,
): Inventory => {
	const key = `${tenantId}:${resourceId}`;
	let inventory = inventories.get(key);
	if (!inventory) {
		const dbStateManager = createDbStateManager(db);
		inventory = createInventory(dbStateManager);
		inventories.set(key, inventory);
	}
	return inventory;
};

export const getOffersForResource = async (
	resourceId: ResourceId,
): Promise<readonly Offer[]> => {
	return offerRepository.getByResourceId(resourceId);
};

const HOLD_EXPIRY_INTERVAL_MS = 30_000;

const broadcastHoldExpired = (event: HoldExpiredEvent) => {
	const server = serverContext.server;
	if (!server) return;

	const startUnix = event.payload.startUnix ?? event.createdAt;
	const endUnix = event.payload.endUnix ?? event.createdAt;

	const topic = createAvailabilityTopic(event.tenantId, event.resourceId);
	const message: AvailabilityWsServerMessage = {
		type: 'stream.delta',
		eventId: event.eventId,
		payload: {
			kind: 'HoldExpired',
			slotId: createSlotId(new Date(startUnix), new Date(endUnix)),
			resourceId: event.resourceId,
			tenantId: event.tenantId,
			startUnix,
			endUnix,
			holdId: event.payload.holdId,
		},
	};
	server.publish(topic, JSON.stringify(message));
};

export const runHoldExpiry = async (): Promise<number> => {
	let totalExpired = 0;
	const now = Date.now();

	for (const inventory of inventories.values()) {
		const expiredEvents = await inventory.expireHolds(now);
		for (const event of expiredEvents) {
			broadcastHoldExpired(event);
			totalExpired++;
		}
	}

	return totalExpired;
};

const expiryInterval = setInterval(async () => {
	try {
		const expired = await runHoldExpiry();
		if (expired > 0) {
			console.log(`[hold-expiry] Expired ${expired} holds`);
		}
	} catch (error) {
		console.error('[hold-expiry] Error:', error);
	}
}, HOLD_EXPIRY_INTERVAL_MS);

process.on('beforeExit', () => {
	clearInterval(expiryInterval);
});

export { apiKeyRepository, bookingRepository, holdRepository, offerRepository };
