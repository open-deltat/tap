import type { ErrorValue } from './error-values';

export type { ErrorValue };

export type ErrorCategory =
	| 'CLIENT_VALIDATION'
	| 'CLIENT_CONFLICT'
	| 'AUTH'
	| 'RATE_LIMIT'
	| 'INTEGRATION'
	| 'SERVER'
	| 'INTERNAL_INVARIANT';

export type TAPError = {
	errorValue: ErrorValue;
	category: ErrorCategory;
	httpStatus: number;
	message: string;
	details?: Record<string, unknown>;
	correlationId: string;
	tenantId?: string;
	resourceId?: string;
	bookingId?: string;
	holdId?: string;
	cause?: unknown;
};

export type APIErrorResponse = {
	error: {
		value: ErrorValue;
		httpStatus: number;
		message: string;
		correlationId: string;
		details?: Record<string, unknown>;
	};
};

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export type TAPLogEvent = {
	timestamp: string;
	level: LogLevel;
	msg: string;
	correlationId: string;
	tenantId?: string;
	resourceId?: string;
	bookingId?: string;
	holdId?: string;
	clientId?: string;
	endpoint?: string;
	method?: string;
	ip?: string;
	errorValue?: ErrorValue;
	errorCategory?: ErrorCategory;
	httpStatus?: number;
	stack?: string;
	extra?: Record<string, unknown>;
};
