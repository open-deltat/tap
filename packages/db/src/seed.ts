#!/usr/bin/env bun

import { createDatabase } from './repositories';
import { resources, tenants } from './schema';

const getConnectionString = (): string => {
	return (
		process.env.DATABASE_URL ||
		process.env.POSTGRES_URL ||
		'postgresql://tap:tap@localhost:5432/tap'
	);
};

const seed = async (): Promise<void> => {
	const connString = getConnectionString();
	const db = createDatabase(connString);

	try {
		console.log('🌱 Seeding database...');

		// Create tenant
		const tenantId = '01AN4Z07BY79KA1307SR9X4MV3';
		const tenantSlug = 'demo-tenant';

		try {
			await db.insert(tenants).values({
				id: tenantId,
				name: 'Demo Tenant',
				slug: tenantSlug,
			});
			console.log('✅ Tenant created:', tenantId);
		} catch (error: unknown) {
			if (
				error &&
				typeof error === 'object' &&
				'code' in error &&
				error.code === '23505' // Unique violation
			) {
				console.log('ℹ️  Tenant already exists:', tenantId);
			} else {
				throw error;
			}
		}

		// Create resource
		const resourceId = '01AN4Z07BY79KA1307SR9X4MV4';
		const resourceSlug = 'demo-resource';

		try {
			await db.insert(resources).values({
				id: resourceId,
				tenantId: tenantId,
				name: 'Demo Resource',
				slug: resourceSlug,
				timezone: 'UTC',
				slotMinutes: '60',
				horizonDays: 90,
				requiresPayment: false,
			});
			console.log('✅ Resource created:', resourceId);
		} catch (error: unknown) {
			if (
				error &&
				typeof error === 'object' &&
				'code' in error &&
				error.code === '23505' // Unique violation
			) {
				console.log('ℹ️  Resource already exists:', resourceId);
			} else {
				throw error;
			}
		}

		console.log('\n✨ Seeding completed!');
	} catch (error) {
		console.error('❌ Seeding failed:', error);
		throw error;
	}
};

if (import.meta.main) {
	seed()
		.then(() => process.exit(0))
		.catch((error) => {
			console.error(error);
			process.exit(1);
		});
}

export { seed };
