import type { ErrorValue } from './error-values';
import { ERROR_VALUES } from './error-values';
import type { ErrorCategory } from './types';

export const ERROR_META: Record<
	ErrorValue,
	{ category: ErrorCategory; httpStatus: number }
> = {
	[ERROR_VALUES.TAP_INVALID_INPUT]: {
		category: 'CLIENT_VALIDATION',
		httpStatus: 400,
	},
	[ERROR_VALUES.TAP_RESOURCE_NOT_FOUND]: {
		category: 'CLIENT_VALIDATION',
		httpStatus: 404,
	},
	[ERROR_VALUES.TAP_TENANT_NOT_FOUND]: {
		category: 'CLIENT_VALIDATION',
		httpStatus: 404,
	},
	[ERROR_VALUES.TAP_SLOT_UNAVAILABLE]: {
		category: 'CLIENT_CONFLICT',
		httpStatus: 409,
	},
	[ERROR_VALUES.TAP_HOLD_NOT_FOUND]: {
		category: 'CLIENT_CONFLICT',
		httpStatus: 404,
	},
	[ERROR_VALUES.TAP_HOLD_EXPIRED]: {
		category: 'CLIENT_CONFLICT',
		httpStatus: 409,
	},
	[ERROR_VALUES.TAP_BOOKING_NOT_FOUND]: {
		category: 'CLIENT_CONFLICT',
		httpStatus: 404,
	},
	[ERROR_VALUES.TAP_RATE_LIMIT_EXCEEDED]: {
		category: 'RATE_LIMIT',
		httpStatus: 429,
	},
	[ERROR_VALUES.TAP_QUOTA_EXCEEDED]: {
		category: 'RATE_LIMIT',
		httpStatus: 429,
	},
	[ERROR_VALUES.TAP_UNAUTHENTICATED]: {
		category: 'AUTH',
		httpStatus: 401,
	},
	[ERROR_VALUES.TAP_UNAUTHORIZED]: {
		category: 'AUTH',
		httpStatus: 403,
	},
	[ERROR_VALUES.TAP_CONCURRENCY_CONFLICT]: {
		category: 'SERVER',
		httpStatus: 409,
	},
	[ERROR_VALUES.TAP_STORAGE_FAILURE]: {
		category: 'SERVER',
		httpStatus: 503,
	},
	[ERROR_VALUES.TAP_INTERNAL_ERROR]: {
		category: 'SERVER',
		httpStatus: 500,
	},
	[ERROR_VALUES.TAP_INVARIANT_VIOLATION]: {
		category: 'INTERNAL_INVARIANT',
		httpStatus: 500,
	},
};
