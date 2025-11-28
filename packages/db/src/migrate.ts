import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate as drizzleMigrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema';

const getConnectionString = () => {
	const connString =
		process.env.DATABASE_URL ||
		process.env.POSTGRES_URL ||
		'postgresql://tap:tap@localhost:5432/tap';

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
