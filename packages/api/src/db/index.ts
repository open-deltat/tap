import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';

export type SqliteDatabase = ReturnType<typeof createDatabase>;

export const createDatabase = (dbPath: string = ':memory:') => {
	const sqlite = new Database(dbPath);
	sqlite.exec('PRAGMA journal_mode = WAL;');
	sqlite.exec('PRAGMA foreign_keys = ON;');
	return drizzle(sqlite, { schema });
};

export const initializeSchema = (db: SqliteDatabase) => {
	const sqlite = (db as ReturnType<typeof drizzle>).$client as Database;
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS tenants (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			slug TEXT NOT NULL UNIQUE,
			created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
		);

		CREATE TABLE IF NOT EXISTS resources (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL REFERENCES tenants(id),
			parent_id TEXT,
			name TEXT NOT NULL,
			slug TEXT NOT NULL,
			timezone TEXT NOT NULL,
			slot_minutes TEXT NOT NULL,
			horizon_days INTEGER NOT NULL DEFAULT 90,
			requires_payment INTEGER NOT NULL DEFAULT 0,
			disabled INTEGER NOT NULL DEFAULT 0,
			metadata TEXT,
			created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
		);

		CREATE TABLE IF NOT EXISTS offers (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL REFERENCES tenants(id),
			resource_id TEXT NOT NULL REFERENCES resources(id),
			type TEXT NOT NULL,
			config TEXT NOT NULL,
			timezone TEXT,
			price_cents INTEGER,
			currency TEXT NOT NULL DEFAULT 'USD',
			buffer_before_minutes INTEGER NOT NULL DEFAULT 0,
			buffer_after_minutes INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
		);

		CREATE TABLE IF NOT EXISTS bookings (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL REFERENCES tenants(id),
			resource_id TEXT NOT NULL REFERENCES resources(id),
			hold_id TEXT,
			start INTEGER NOT NULL,
			end INTEGER NOT NULL,
			status TEXT NOT NULL DEFAULT 'CONFIRMED',
			payment_status TEXT NOT NULL DEFAULT 'NONE',
			payment_provider TEXT,
			payment_ref TEXT,
			customer_name TEXT,
			customer_email TEXT,
			customer_phone TEXT,
			external_ref TEXT,
			client_ref TEXT,
			created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
		);

		CREATE TABLE IF NOT EXISTS holds (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL REFERENCES tenants(id),
			resource_id TEXT NOT NULL REFERENCES resources(id),
			session_id TEXT NOT NULL,
			start_unix INTEGER NOT NULL,
			end_unix INTEGER NOT NULL,
			expires_at INTEGER NOT NULL,
			client_ref TEXT,
			created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
		);

		CREATE TABLE IF NOT EXISTS api_keys (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL REFERENCES tenants(id),
			name TEXT NOT NULL,
			key_hash TEXT NOT NULL,
			key_prefix TEXT NOT NULL,
			scopes TEXT NOT NULL,
			expires_at INTEGER,
			last_used_at INTEGER,
			created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
		);

		CREATE INDEX IF NOT EXISTS idx_resources_tenant ON resources(tenant_id);
		CREATE INDEX IF NOT EXISTS idx_offers_resource ON offers(resource_id);
		CREATE INDEX IF NOT EXISTS idx_bookings_resource ON bookings(resource_id);
		CREATE INDEX IF NOT EXISTS idx_bookings_hold ON bookings(hold_id);
		CREATE INDEX IF NOT EXISTS idx_holds_session ON holds(session_id);
		CREATE INDEX IF NOT EXISTS idx_holds_expires ON holds(expires_at);
		CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
	`);
};

export * from './repositories';
export * from './schema';
export * from './state-manager';
