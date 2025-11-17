import { expect, test } from 'bun:test';
import { ulid } from 'ulid';
import { ResourceSchema, TenantSchema } from './schemas';

test('validates Tenant schema', () => {
	const tenant = {
		id: ulid(),
		name: 'Test Tenant',
		slug: 'test-tenant',
	};

	const result = TenantSchema.safeParse(tenant);
	expect(result.success).toBeTrue();
});

test('rejects Tenant with short slug', () => {
	const tenant = {
		id: ulid(),
		name: 'Test Tenant',
		slug: 'ab',
	};

	const result = TenantSchema.safeParse(tenant);
	expect(result.success).toBeFalse();
});

test('validates Resource schema', () => {
	const resource = {
		id: ulid(),
		tenantId: ulid(),
		name: 'Test Resource',
		slug: 'test-resource',
		timezone: 'America/New_York',
		slotMinutes: '30' as const,
		horizonDays: 90,
		requiresPayment: false,
	};

	const result = ResourceSchema.safeParse(resource);
	expect(result.success).toBeTrue();
});

test('rejects Resource with invalid slotMinutes', () => {
	const resource = {
		id: ulid(),
		tenantId: ulid(),
		name: 'Test Resource',
		slug: 'test-resource',
		timezone: 'UTC',
		slotMinutes: '45' as any,
	};

	const result = ResourceSchema.safeParse(resource);
	expect(result.success).toBeFalse();
});

test('Resource schema applies defaults', () => {
	const resource = {
		id: ulid(),
		tenantId: ulid(),
		name: 'Test Resource',
		slug: 'test-resource',
		timezone: 'UTC',
		slotMinutes: '15' as const,
	};

	const result = ResourceSchema.safeParse(resource);
	expect(result.success).toBeTrue();
	if (result.success) {
		expect(result.data.horizonDays).toBe(90);
		expect(result.data.requiresPayment).toBe(false);
	}
});
