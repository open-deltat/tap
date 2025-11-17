import { ulid } from 'ulid';
import { ERROR_META } from './error-meta';
import type { ErrorValue } from './error-values';
import type { TAPError } from './types';

export type CreateErrorContext = {
	correlationId: string;
	tenantId?: string;
	resourceId?: string;
	bookingId?: string;
	holdId?: string;
	details?: Record<string, unknown>;
};

export type CreateErrorOptions = {
	override?: Partial<Pick<TAPError, 'httpStatus' | 'category'>>;
	cause?: unknown;
};

export function createError(
	errorValue: ErrorValue,
	message: string,
	context: CreateErrorContext,
	options?: CreateErrorOptions,
): TAPError {
	const meta = ERROR_META[errorValue];
	if (!meta) {
		throw new Error(`Unknown error value: ${errorValue}`);
	}

	const error: TAPError = {
		errorValue,
		category: options?.override?.category ?? meta.category,
		httpStatus: options?.override?.httpStatus ?? meta.httpStatus,
		message,
		correlationId: context.correlationId,
	};

	if (context.tenantId !== undefined) {
		error.tenantId = context.tenantId;
	}
	if (context.resourceId !== undefined) {
		error.resourceId = context.resourceId;
	}
	if (context.bookingId !== undefined) {
		error.bookingId = context.bookingId;
	}
	if (context.holdId !== undefined) {
		error.holdId = context.holdId;
	}
	if (context.details !== undefined) {
		error.details = context.details;
	}
	if (options?.cause !== undefined) {
		error.cause = options.cause;
	}

	return error;
}

export function createCorrelationId(): string {
	return ulid();
}
