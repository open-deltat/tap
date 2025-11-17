#!/usr/bin/env bun

import type { Offer } from '@tap/core';
import { ulid } from 'ulid';
import {
	initializeContext,
	offerRepository,
	resourceRepository,
	tenantRepository,
} from '../services/context';

const seed = async (): Promise<void> => {
	await initializeContext();

	const tenantSlug = 'demo-tenant';
	const resourceSlug = 'demo-resource';

	let tenant = await tenantRepository.getBySlug(tenantSlug);
	if (!tenant) {
		tenant = {
			id: ulid(),
			name: 'Demo Tenant',
			slug: tenantSlug,
		};
		await tenantRepository.create(tenant);
		console.log(`✅ Created tenant: ${tenantSlug}`);
	} else {
		console.log(`ℹ️  Tenant already exists: ${tenantSlug}`);
	}

	let resource = await resourceRepository.getBySlug(tenantSlug, resourceSlug);
	if (!resource || resource.tenantId !== tenant.id) {
		resource = {
			id: ulid(),
			tenantId: tenant.id,
			name: 'Demo Resource',
			slug: resourceSlug,
			timezone: 'UTC',
			slotMinutes: '15',
			horizonDays: 90,
			requiresPayment: false,
		};
		await resourceRepository.create(resource);
		console.log(`✅ Created resource: ${resourceSlug}`);
	} else {
		console.log(`ℹ️  Resource already exists: ${resourceSlug}`);
	}

	const existingOffers = await offerRepository.getByResourceId(resource.id);
	if (existingOffers.length === 0) {
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
		console.log(`✅ Created default offer (Mon-Fri 9-5)`);
	} else {
		console.log(`ℹ️  Offers already exist for resource`);
	}

	console.log('\n✨ Seed completed!');
	console.log(`\n📋 Demo data:`);
	console.log(`   Tenant: ${tenantSlug}`);
	console.log(`   Resource: ${resourceSlug}`);
	console.log(`   URL: /v1/public/${tenantSlug}/${resourceSlug}/availability`);
};

seed()
	.then(() => {
		process.exit(0);
	})
	.catch((error) => {
		console.error('❌ Seed failed:', error);
		process.exit(1);
	});
