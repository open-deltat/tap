import { ulid } from 'ulid';
import type { SqliteDatabase } from './index';
import { apiKeys, offers, resources, tenants } from './schema';

export const seedDatabase = async (db: SqliteDatabase) => {
	const tenantId = ulid();
	const resourceId = ulid();
	const apiKeyId = ulid();

	await db.insert(tenants).values({
		id: tenantId,
		name: 'Demo Tenant',
		slug: 'demo',
	});

	await db.insert(resources).values({
		id: resourceId,
		tenantId,
		name: 'Demo Resource',
		slug: 'demo-resource',
		timezone: 'UTC',
		slotMinutes: '30',
		horizonDays: 90,
		requiresPayment: false,
		disabled: false,
	});

	const offerId = ulid();
	await db.insert(offers).values({
		id: offerId,
		tenantId,
		resourceId,
		type: 'weekly',
		config: {
			daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
			startTime: '00:00',
			endTime: '23:59',
		},
		currency: 'USD',
		bufferBeforeMinutes: 0,
		bufferAfterMinutes: 0,
	});

	const keyHash = Bun.hash('demo-api-key').toString(16);
	await db.insert(apiKeys).values({
		id: apiKeyId,
		tenantId,
		name: 'Demo API Key',
		keyHash,
		keyPrefix: 'demo',
		scopes: ['read', 'hold', 'book', 'cancel', 'manage'],
	});

	console.log('Database seeded successfully');
	console.log(`  Tenant ID: ${tenantId}`);
	console.log(`  Resource ID: ${resourceId}`);
	console.log(`  Offer ID: ${offerId}`);
	console.log('  Offer: 7 days/week, 00:00-23:59 (all day)');
	console.log('  API Key: demo-api-key');

	return { tenantId, resourceId, offerId, apiKeyId };
};
