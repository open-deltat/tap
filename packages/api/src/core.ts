import {
	createInventory,
	type HoldExpiredEvent,
	type Inventory,
	type Offer,
} from '@open-tap/core';
import {
	type AvailabilityWsServerMessage,
	createAvailabilityTopic,
	createSlotId,
	type ResourceId,
	type TenantId,
} from '@open-tap/protocol';
import { setApiKeyLookup } from './auth';
import {
	createApiKeyRepository,
	createBookingRepository,
	createDatabase,
	createDbStateManager,
	createHoldRepository,
	createOfferRepository,
	createResourceRepository,
	createTenantRepository,
	initializeSchema,
	type SqliteDatabase,
} from './db';
import { seedDatabase } from './db/seed';
import { serverContext } from './server-context';

const DB_PATH = process.env.TAP_DB_PATH || './data/tap.sqlite';

const initializeDatabase = (): SqliteDatabase => {
	const dbDir = DB_PATH.substring(0, DB_PATH.lastIndexOf('/'));
	if (dbDir && dbDir !== '.') {
		try {
			Bun.spawnSync(['mkdir', '-p', dbDir]);
		} catch {
			// ignore if directory exists
		}
	}

	const db = createDatabase(DB_PATH);
	initializeSchema(db);
	return db;
};

const db = initializeDatabase();

const tenantRepository = createTenantRepository(db);
const resourceRepository = createResourceRepository(db);
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

export const ensureSeeded = async () => {
	const existingTenant = await tenantRepository.getBySlug('demo');
	if (!existingTenant) {
		console.log('[startup] No data found, seeding database...');
		await seedDatabase(db);
	}
};

export {
	apiKeyRepository,
	bookingRepository,
	holdRepository,
	offerRepository,
	tenantRepository,
	resourceRepository,
	db,
};
