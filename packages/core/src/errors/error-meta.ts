import type { ErrorValue } from '@open-tap/protocol';
import type { ErrorCategory } from './types';

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
	TAP_BOOKING_ALREADY_CANCELLED: {
		category: 'CLIENT_CONFLICT',
		httpStatus: 409,
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
