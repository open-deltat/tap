import { beforeAll, expect, test } from 'bun:test';
import type { BookingId, ResourceId, TenantId } from '@tap/core';
import { createAllocator, createInMemoryEventStore } from '@tap/core';
import {
	commonErrors,
	createCorrelationId,
	createError,
	ERROR_VALUES,
	toAPIErrorResponse,
} from '@tap/errors';
import { ulid } from 'ulid';
import { registerResource, registerTenant } from './public';

const allocator = createAllocator();
const eventStore = createInMemoryEventStore();

const tenantId = ulid() as TenantId;
const resourceId = ulid() as ResourceId;

beforeAll(() => {
	registerTenant('test-tenant', tenantId);
	registerResource('test-tenant', 'test-resource', resourceId, tenantId);
});

test('TAP_INVALID_INPUT returned for missing required fields', async () => {
	const correlationId = createCorrelationId();
	const error = commonErrors.invalidInput('Missing required fields', {
		correlationId,
	});

	const response = toAPIErrorResponse(error);
	expect(response.error.value).toBe(ERROR_VALUES.TAP_INVALID_INPUT);
	expect(response.error.httpStatus).toBe(400);
});

test('TAP_SLOT_UNAVAILABLE returned when slot is already booked', async () => {
	const day = '2025-12-25';
	const startMinute = 600;
	const endMinute = 660;

	const holdResult1 = await allocator.placeHold({
		tenantId,
		resourceId,
		day,
		startMinute,
		endMinute,
		expiresAt: Date.now() + 60_000,
	});

	expect(holdResult1.success).toBe(true);
	if (holdResult1.success) {
		await eventStore.append(holdResult1.event);

		const bookingId = ulid() as BookingId;
		const dayStart = new Date(day).setHours(0, 0, 0, 0);
		const start = dayStart + startMinute * 60 * 1000;
		const end = dayStart + endMinute * 60 * 1000;

		const confirmEvent = await allocator.confirmBooking({
			tenantId,
			resourceId,
			holdId: holdResult1.holdId,
			bookingId,
			start,
			end,
		});

		expect(confirmEvent).not.toBeNull();
		if (confirmEvent) {
			await eventStore.append(confirmEvent);
		}
	}

	const holdResult2 = await allocator.placeHold({
		tenantId,
		resourceId,
		day,
		startMinute,
		endMinute,
		expiresAt: Date.now() + 60_000,
	});

	expect(holdResult2.success).toBe(false);

	const correlationId = createCorrelationId();
	const error = commonErrors.slotUnavailable({
		correlationId,
		tenantId,
		resourceId,
		details: { day, startMinute, endMinute },
	});

	const response = toAPIErrorResponse(error);
	expect(response.error.value).toBe(ERROR_VALUES.TAP_SLOT_UNAVAILABLE);
	expect(response.error.httpStatus).toBe(409);
});

test('TAP_HOLD_EXPIRED returned when hold has expired', async () => {
	const day = '2025-12-26';
	const startMinute = 600;
	const endMinute = 660;

	const holdResult = await allocator.placeHold({
		tenantId,
		resourceId,
		day,
		startMinute,
		endMinute,
		expiresAt: Date.now() - 1000,
	});

	expect(holdResult.success).toBe(true);
	if (holdResult.success) {
		await eventStore.append(holdResult.event);

		allocator.expireHolds(Date.now());

		const bookingId = ulid() as BookingId;
		const dayStart = new Date(day).setHours(0, 0, 0, 0);
		const start = dayStart + startMinute * 60 * 1000;
		const end = dayStart + endMinute * 60 * 1000;

		const confirmEvent = await allocator.confirmBooking({
			tenantId,
			resourceId,
			holdId: holdResult.holdId,
			bookingId,
			start,
			end,
		});

		expect(confirmEvent).toBeNull();

		const correlationId = createCorrelationId();
		const error = commonErrors.holdExpired({
			correlationId,
			tenantId,
			resourceId,
			holdId: holdResult.holdId,
		});

		const response = toAPIErrorResponse(error);
		expect(response.error.value).toBe(ERROR_VALUES.TAP_HOLD_EXPIRED);
		expect(response.error.httpStatus).toBe(409);
	}
});

test('TAP_HOLD_NOT_FOUND returned when confirming non-existent hold', async () => {
	const fakeHoldId = ulid() as any;
	const bookingId = ulid() as BookingId;
	const day = '2025-12-27';
	const dayStart = new Date(day).setHours(0, 0, 0, 0);
	const start = dayStart + 600 * 60 * 1000;
	const end = dayStart + 660 * 60 * 1000;

	const confirmEvent = await allocator.confirmBooking({
		tenantId,
		resourceId,
		holdId: fakeHoldId,
		bookingId,
		start,
		end,
	});

	expect(confirmEvent).toBeNull();

	const correlationId = createCorrelationId();
	const error = commonErrors.holdNotFound({
		correlationId,
		tenantId,
		resourceId,
		holdId: fakeHoldId,
	});

	const response = toAPIErrorResponse(error);
	expect(response.error.value).toBe(ERROR_VALUES.TAP_HOLD_NOT_FOUND);
	expect(response.error.httpStatus).toBe(404);
});

test('TAP_RESOURCE_NOT_FOUND returned for unknown resource', async () => {
	const correlationId = createCorrelationId();
	const error = commonErrors.resourceNotFound({
		correlationId,
		tenantId,
	});

	const response = toAPIErrorResponse(error);
	expect(response.error.value).toBe(ERROR_VALUES.TAP_RESOURCE_NOT_FOUND);
	expect(response.error.httpStatus).toBe(404);
});

test('TAP_TENANT_NOT_FOUND returned for unknown tenant', async () => {
	const correlationId = createCorrelationId();
	const error = commonErrors.tenantNotFound({
		correlationId,
	});

	const response = toAPIErrorResponse(error);
	expect(response.error.value).toBe(ERROR_VALUES.TAP_TENANT_NOT_FOUND);
	expect(response.error.httpStatus).toBe(404);
});

test('TAP_CONCURRENCY_CONFLICT returned when race condition detected', async () => {
	const correlationId = createCorrelationId();
	const error = commonErrors.concurrencyConflict(
		'Concurrent modification detected while confirming booking',
		{
			correlationId,
			tenantId,
			resourceId,
			details: { operation: 'confirmBooking' },
		},
	);

	const response = toAPIErrorResponse(error);
	expect(response.error.value).toBe(ERROR_VALUES.TAP_CONCURRENCY_CONFLICT);
	expect(response.error.httpStatus).toBe(409);
});

test('TAP_BOOKING_NOT_FOUND returned for unknown booking', async () => {
	const correlationId = createCorrelationId();
	const error = commonErrors.bookingNotFound({
		correlationId,
		tenantId,
		resourceId,
		bookingId: ulid() as any,
	});

	const response = toAPIErrorResponse(error);
	expect(response.error.value).toBe(ERROR_VALUES.TAP_BOOKING_NOT_FOUND);
	expect(response.error.httpStatus).toBe(404);
});

test('TAP_RATE_LIMIT_EXCEEDED has correct structure', async () => {
	const correlationId = createCorrelationId();
	const error = createError(
		ERROR_VALUES.TAP_RATE_LIMIT_EXCEEDED,
		'Rate limit exceeded',
		{ correlationId },
	);

	const response = toAPIErrorResponse(error);
	expect(response.error.value).toBe(ERROR_VALUES.TAP_RATE_LIMIT_EXCEEDED);
	expect(response.error.httpStatus).toBe(429);
});

test('TAP_QUOTA_EXCEEDED has correct structure', async () => {
	const correlationId = createCorrelationId();
	const error = createError(ERROR_VALUES.TAP_QUOTA_EXCEEDED, 'Quota exceeded', {
		correlationId,
	});

	const response = toAPIErrorResponse(error);
	expect(response.error.value).toBe(ERROR_VALUES.TAP_QUOTA_EXCEEDED);
	expect(response.error.httpStatus).toBe(429);
});

test('TAP_UNAUTHENTICATED has correct structure', async () => {
	const correlationId = createCorrelationId();
	const error = createError(
		ERROR_VALUES.TAP_UNAUTHENTICATED,
		'Authentication required',
		{ correlationId },
	);

	const response = toAPIErrorResponse(error);
	expect(response.error.value).toBe(ERROR_VALUES.TAP_UNAUTHENTICATED);
	expect(response.error.httpStatus).toBe(401);
});

test('TAP_UNAUTHORIZED has correct structure', async () => {
	const correlationId = createCorrelationId();
	const error = createError(
		ERROR_VALUES.TAP_UNAUTHORIZED,
		'Insufficient permissions',
		{ correlationId },
	);

	const response = toAPIErrorResponse(error);
	expect(response.error.value).toBe(ERROR_VALUES.TAP_UNAUTHORIZED);
	expect(response.error.httpStatus).toBe(403);
});

test('TAP_STORAGE_FAILURE has correct structure', async () => {
	const correlationId = createCorrelationId();
	const error = commonErrors.storageFailure('Database connection failed', {
		correlationId,
	});

	const response = toAPIErrorResponse(error);
	expect(response.error.value).toBe(ERROR_VALUES.TAP_STORAGE_FAILURE);
	expect(response.error.httpStatus).toBe(503);
});

test('TAP_INTERNAL_ERROR has correct structure', async () => {
	const correlationId = createCorrelationId();
	const error = commonErrors.internalError('Unexpected error occurred', {
		correlationId,
	});

	const response = toAPIErrorResponse(error);
	expect(response.error.value).toBe(ERROR_VALUES.TAP_INTERNAL_ERROR);
	expect(response.error.httpStatus).toBe(500);
});

test('TAP_INVARIANT_VIOLATION has correct structure', async () => {
	const correlationId = createCorrelationId();
	const error = commonErrors.invariantViolation('Bitmap state inconsistent', {
		correlationId,
	});

	const response = toAPIErrorResponse(error);
	expect(response.error.value).toBe(ERROR_VALUES.TAP_INVARIANT_VIOLATION);
	expect(response.error.httpStatus).toBe(500);
});
