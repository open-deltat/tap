import type { Offer, Resource, Tenant } from '@tap/core';
import { ulid } from 'ulid';
import {
	initializeContext,
	offerRepository,
	resourceRepository,
	tenantRepository,
} from '../services/context';

let contextInitialized = false;

const ensureContextInitialized = async () => {
	if (!contextInitialized) {
		await initializeContext();
		contextInitialized = true;
	}
};

export const createTestTenant = async (slug?: string): Promise<Tenant> => {
	await ensureContextInitialized();
	const uniqueSlug = slug || `test-tenant-${ulid()}`;
	const existing = await tenantRepository.getBySlug(uniqueSlug);
	if (existing) {
		return existing;
	}
	const tenant: Tenant = {
		id: ulid(),
		name: `Test Tenant ${uniqueSlug}`,
		slug: uniqueSlug,
	};
	try {
		await tenantRepository.create(tenant);
	} catch (error) {
		const existing = await tenantRepository.getBySlug(uniqueSlug);
		if (existing) {
			return existing;
		}
		throw error;
	}
	return tenant;
};

export const createTestResource = async (
	tenant: Tenant,
	slug?: string,
): Promise<Resource> => {
	await ensureContextInitialized();
	const uniqueSlug = slug || `test-resource-${ulid()}`;
	const existing = await resourceRepository.getBySlug(tenant.slug, uniqueSlug);
	if (existing) {
		return existing;
	}
	const resource: Resource = {
		id: ulid(),
		tenantId: tenant.id,
		name: `Test Resource ${uniqueSlug}`,
		slug: uniqueSlug,
		timezone: 'UTC',
		slotMinutes: '15',
		horizonDays: 90,
		requiresPayment: false,
	};
	try {
		await resourceRepository.create(resource);
	} catch (error) {
		const existing = await resourceRepository.getBySlug(
			tenant.slug,
			uniqueSlug,
		);
		if (existing) {
			return existing;
		}
		throw error;
	}
	return resource;
};

export const createTestOffer = async (
	tenant: Tenant,
	resource: Resource,
): Promise<Offer> => {
	await ensureContextInitialized();
	const offer: Offer = {
		id: ulid(),
		tenantId: tenant.id,
		resourceId: resource.id,
		daysOfWeek: [1, 2, 3, 4, 5],
		startTime: '09:00',
		endTime: '17:00',
		currency: 'USD',
	};
	await offerRepository.create(offer);
	return offer;
};

export const cleanupTestData = async (): Promise<void> => {
	// In a real scenario, you'd clean up test data
	// For now, tests can use unique slugs to avoid conflicts
};
