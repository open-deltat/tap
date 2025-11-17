import type { CreateErrorContext, CreateErrorOptions } from './create-error';
import { createError } from './create-error';
import type { ErrorValue } from './error-values';
import { ERROR_VALUES } from './error-values';
import type { TAPError } from './types';

export function makeClientValidationError(
	errorValue: ErrorValue,
	message: string,
	context: CreateErrorContext,
	options?: CreateErrorOptions,
): TAPError {
	return createError(errorValue, message, context, {
		...options,
		override: {
			...options?.override,
			category: 'CLIENT_VALIDATION',
		},
	});
}

export function makeClientConflictError(
	errorValue: ErrorValue,
	message: string,
	context: CreateErrorContext,
	options?: CreateErrorOptions,
): TAPError {
	return createError(errorValue, message, context, {
		...options,
		override: {
			...options?.override,
			category: 'CLIENT_CONFLICT',
		},
	});
}

export function makeAuthError(
	errorValue: ErrorValue,
	message: string,
	context: CreateErrorContext,
	options?: CreateErrorOptions,
): TAPError {
	return createError(errorValue, message, context, {
		...options,
		override: {
			...options?.override,
			category: 'AUTH',
		},
	});
}

export function makeRateLimitError(
	errorValue: ErrorValue,
	message: string,
	context: CreateErrorContext,
	options?: CreateErrorOptions,
): TAPError {
	return createError(errorValue, message, context, {
		...options,
		override: {
			...options?.override,
			category: 'RATE_LIMIT',
		},
	});
}

export function makeServerError(
	errorValue: ErrorValue,
	message: string,
	context: CreateErrorContext,
	options?: CreateErrorOptions,
): TAPError {
	return createError(errorValue, message, context, {
		...options,
		override: {
			...options?.override,
			category: 'SERVER',
		},
	});
}

export function makeInternalInvariantError(
	errorValue: ErrorValue,
	message: string,
	context: CreateErrorContext,
	options?: CreateErrorOptions,
): TAPError {
	return createError(errorValue, message, context, {
		...options,
		override: {
			...options?.override,
			category: 'INTERNAL_INVARIANT',
		},
	});
}

export const commonErrors = {
	invalidInput: (message: string, context: CreateErrorContext) =>
		makeClientValidationError(ERROR_VALUES.TAP_INVALID_INPUT, message, context),
	resourceNotFound: (context: CreateErrorContext) =>
		makeClientValidationError(
			ERROR_VALUES.TAP_RESOURCE_NOT_FOUND,
			'Resource not found',
			context,
		),
	tenantNotFound: (context: CreateErrorContext) =>
		makeClientValidationError(
			ERROR_VALUES.TAP_TENANT_NOT_FOUND,
			'Tenant not found',
			context,
		),
	slotUnavailable: (context: CreateErrorContext) =>
		makeClientConflictError(
			ERROR_VALUES.TAP_SLOT_UNAVAILABLE,
			'Requested time range is no longer available',
			context,
		),
	holdNotFound: (context: CreateErrorContext) =>
		makeClientConflictError(
			ERROR_VALUES.TAP_HOLD_NOT_FOUND,
			'Hold not found',
			context,
		),
	holdExpired: (context: CreateErrorContext) =>
		makeClientConflictError(
			ERROR_VALUES.TAP_HOLD_EXPIRED,
			'Hold has expired',
			context,
		),
	bookingNotFound: (context: CreateErrorContext) =>
		makeClientConflictError(
			ERROR_VALUES.TAP_BOOKING_NOT_FOUND,
			'Booking not found',
			context,
		),
	concurrencyConflict: (message: string, context: CreateErrorContext) =>
		makeServerError(ERROR_VALUES.TAP_CONCURRENCY_CONFLICT, message, context),
	storageFailure: (message: string, context: CreateErrorContext) =>
		makeServerError(ERROR_VALUES.TAP_STORAGE_FAILURE, message, context),
	internalError: (message: string, context: CreateErrorContext) =>
		makeServerError(ERROR_VALUES.TAP_INTERNAL_ERROR, message, context),
	invariantViolation: (message: string, context: CreateErrorContext) =>
		makeInternalInvariantError(
			ERROR_VALUES.TAP_INVARIANT_VIOLATION,
			message,
			context,
		),
};
