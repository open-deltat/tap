import { defineConfig } from 'drizzle-kit';

const connectionString =
	process.env.DATABASE_URL ||
	process.env.POSTGRES_URL ||
	'postgresql://tap:tap@localhost:5432/tap';

export default defineConfig({
	schema: './src/schema.ts',
	out: './src/migrations',
	dialect: 'postgresql',
	dbCredentials: {
		url: connectionString,
	},
});
