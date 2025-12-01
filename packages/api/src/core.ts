import { createInventory, type Inventory, type Offer } from '@tap/core';
import {
	createDatabase,
	createDbStateManager,
	createOfferRepository,
} from '@tap/db';
import type { ResourceId, TenantId } from '@tap/protocol';

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

export { offerRepository };
