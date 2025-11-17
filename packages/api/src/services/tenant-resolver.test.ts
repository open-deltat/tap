import { expect, test } from 'bun:test';
import type { TenantId } from '@tap/core';
import { ulid } from 'ulid';
import { createTenantResolver } from './tenant-resolver';

test('resolveBySlug returns null for unregistered tenant', async () => {
	const resolver = createTenantResolver();
	const result = await resolver.resolveBySlug('unknown');
	expect(result).toBeNull();
});

test('register and resolveBySlug work correctly', async () => {
	const resolver = createTenantResolver();
	const tenantId = ulid() as TenantId;
	const slug = 'test-tenant';

	resolver.register(slug, tenantId);

	const result = await resolver.resolveBySlug(slug);
	expect(result).toBe(tenantId);
});

test('resolveBySlug returns null for different slug', async () => {
	const resolver = createTenantResolver();
	const tenantId = ulid() as TenantId;

	resolver.register('tenant-1', tenantId);

	const result = await resolver.resolveBySlug('tenant-2');
	expect(result).toBeNull();
});

test('register overwrites existing slug', async () => {
	const resolver = createTenantResolver();
	const tenantId1 = ulid() as TenantId;
	const tenantId2 = ulid() as TenantId;
	const slug = 'same-slug';

	resolver.register(slug, tenantId1);
	expect(await resolver.resolveBySlug(slug)).toBe(tenantId1);

	resolver.register(slug, tenantId2);
	expect(await resolver.resolveBySlug(slug)).toBe(tenantId2);
});

test('multiple tenants can be registered', async () => {
	const resolver = createTenantResolver();
	const tenantId1 = ulid() as TenantId;
	const tenantId2 = ulid() as TenantId;

	resolver.register('tenant-1', tenantId1);
	resolver.register('tenant-2', tenantId2);

	expect(await resolver.resolveBySlug('tenant-1')).toBe(tenantId1);
	expect(await resolver.resolveBySlug('tenant-2')).toBe(tenantId2);
});
