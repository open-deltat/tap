import {
	createInventory,
	type HoldExpiredEvent,
	type Inventory,
	type Offer,
} from '@tap/core';
import {
	createDatabase,
	createDbStateManager,
	createOfferRepository,
} from '@tap/db';
import {
	type AvailabilityDeltaPayload,
	type AvailabilityWsServerMessage,
	createAvailabilityTopic,
	type ResourceId,
	type TenantId,
} from '@tap/protocol';
import { serverContext } from './server-context';

const connectionString =
	process.env.DATABASE_URL ||
	process.env.POSTGRES_URL ||
	'postgresql://tap:tap@localhost:5432/tap';

const db = createDatabase(connectionString);
const offerRepository = createOfferRepository(db);

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

// Hold expiry scheduler - runs every 30 seconds
const HOLD_EXPIRY_INTERVAL_MS = 30_000;

const broadcastHoldExpired = (event: HoldExpiredEvent) => {
	const server = serverContext.getServer();
	if (!server) return;

	const topic = createAvailabilityTopic(event.tenantId, event.resourceId);
	const payload: AvailabilityDeltaPayload = {
		kind: 'HoldExpired',
		slotId: `${new Date(event.payload.startUnix).toISOString()}_${new Date(event.payload.endUnix).toISOString()}`,
		resourceId: event.resourceId,
		tenantId: event.tenantId,
		startUnix: event.payload.startUnix,
		endUnix: event.payload.endUnix,
		holdId: event.payload.holdId,
	};
	const message: AvailabilityWsServerMessage = {
		type: 'stream.delta',
		payload,
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

// Start the scheduler
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

// Cleanup on process exit
process.on('beforeExit', () => {
	clearInterval(expiryInterval);
});

export { offerRepository };
