import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate as drizzleMigrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema';

const getConnectionString = () => {
	const connString =
		process.env.DATABASE_URL ||
		process.env.POSTGRES_URL ||
		'postgres://postgres:u1y8TpeBLfdIVjycOu6wZxKRJaYz2mCOk7hmgV07n42rnfdwbqpe8A9khHeNCQ7A@142.132.169.70:4653/postgres';

	return connString;
};

export const migrate = async (connectionString?: string) => {
	const connString = connectionString || getConnectionString();
	const client = postgres(connString, { max: 1 });
	const db = drizzle(client, { schema });

	try {
		const migrationsFolder = join(import.meta.dir, 'migrations');
		await drizzleMigrate(db, { migrationsFolder });
		console.log('✅ Migration completed');
	} catch (error) {
		console.error('❌ Migration failed:', error);
		throw error;
	} finally {
		await client.end();
	}
};

if (import.meta.main) {
	migrate()
		.then(() => process.exit(0))
		.catch(() => process.exit(1));
}
