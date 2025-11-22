import type { ErrorValue } from '@tap/protocol';
import { ERROR_VALUES } from '@tap/protocol'; // Assuming ERROR_VALUES object/map is available or we construct it
import type { ErrorCategory } from './types';

// If ERROR_VALUES from protocol is an array, we might need to map it.
// In protocol/src/schemas/values.ts it is an array `as const`.
// In core/src/domain/error-codes.ts we mapped it to an object.
// Let's use the object from core if available, or rebuild it.
// Actually, let's use the strings directly since they are typed.

// We need to satisfy Record<ErrorValue, ...>
// Since ErrorValue is a union of strings, we can just key off them.

// To make this safe, we need to ensure we cover all keys.
// The protocol exports ERROR_VALUES as an array.
// We can iterate or just define the object literals.

// Let's try to import the object version if we want runtime iteration,
// but for defining this map we just need the keys.

export const ERROR_META: Record<
	ErrorValue,
	{ category: ErrorCategory; httpStatus: number }
> = {
	TAP_INVALID_INPUT: {
		category: 'CLIENT_VALIDATION',
		httpStatus: 400,
	},
	TAP_RESOURCE_NOT_FOUND: {
		category: 'CLIENT_VALIDATION',
		httpStatus: 404,
	},
	TAP_TENANT_NOT_FOUND: {
		category: 'CLIENT_VALIDATION',
		httpStatus: 404,
	},
	TAP_SLOT_UNAVAILABLE: {
		category: 'CLIENT_CONFLICT',
		httpStatus: 409,
	},
	TAP_HOLD_NOT_FOUND: {
		category: 'CLIENT_CONFLICT',
		httpStatus: 404,
	},
	TAP_HOLD_EXPIRED: {
		category: 'CLIENT_CONFLICT',
		httpStatus: 409,
	},
	TAP_BOOKING_NOT_FOUND: {
		category: 'CLIENT_CONFLICT',
		httpStatus: 404,
	},
	TAP_RATE_LIMIT_EXCEEDED: {
		category: 'RATE_LIMIT',
		httpStatus: 429,
	},
	TAP_QUOTA_EXCEEDED: {
		category: 'RATE_LIMIT',
		httpStatus: 429,
	},
	TAP_UNAUTHENTICATED: {
		category: 'AUTH',
		httpStatus: 401,
	},
	TAP_UNAUTHORIZED: {
		category: 'AUTH',
		httpStatus: 403,
	},
	TAP_CONCURRENCY_CONFLICT: {
		category: 'SERVER',
		httpStatus: 409,
	},
	TAP_STORAGE_FAILURE: {
		category: 'SERVER',
		httpStatus: 503,
	},
	TAP_INTERNAL_ERROR: {
		category: 'SERVER',
		httpStatus: 500,
	},
	TAP_INVARIANT_VIOLATION: {
		category: 'INTERNAL_INVARIANT',
		httpStatus: 500,
	},
};
