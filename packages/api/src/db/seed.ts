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

	await db.insert(offers).values({
		id: ulid(),
		tenantId,
		resourceId,
		type: 'weekly',
		config: {
			daysOfWeek: [1, 2, 3, 4, 5],
			startTime: '09:00',
			endTime: '17:00',
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
	console.log('  API Key: demo-api-key');

	return { tenantId, resourceId, apiKeyId };
};
