#!/usr/bin/env bun

import postgres from 'postgres';
import { migrate } from './migrate';

const getConnectionString = (): string => {
	return (
		process.env.DATABASE_URL ||
		process.env.POSTGRES_URL ||
		'postgresql://tap:tap@localhost:5432/tap'
	);
};

const reset = async (): Promise<void> => {
	const connString = getConnectionString();
	const client = postgres(connString, { max: 1 });

	try {
		console.log('🗑️  Clearing database...');
		await client.unsafe(`
			TRUNCATE TABLE
				bookings,
				holds,
				offers,
				resources,
				tenants,
				ledger_events
			RESTART IDENTITY CASCADE;
		`);
		console.log('✅ Database cleared');

		console.log('🔄 Running migrations...');
		await migrate(connString);

		console.log('\n✨ Database reset completed!');
	} catch (error) {
		console.error('❌ Reset failed:', error);
		throw error;
	} finally {
		await client.end();
	}
};

if (import.meta.main) {
	reset()
		.then(() => process.exit(0))
		.catch((error) => {
			console.error(error);
			process.exit(1);
		});
}
