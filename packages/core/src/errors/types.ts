import type { ErrorValue } from '@tap/protocol';

export type ErrorCategory =
	| 'CLIENT_VALIDATION'
	| 'CLIENT_CONFLICT'
	| 'AUTH'
	| 'RATE_LIMIT'
	| 'INTEGRATION'
	| 'SERVER'
	| 'INTERNAL_INVARIANT';

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
