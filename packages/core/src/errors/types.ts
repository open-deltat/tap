import type { ErrorValue } from '@open-tap/protocol';

export type ErrorCategory =
	| 'CLIENT_VALIDATION'
	| 'CLIENT_CONFLICT'
	| 'AUTH'
	| 'RATE_LIMIT'
	| 'INTEGRATION'
	| 'SERVER'
	| 'INTERNAL_INVARIANT';

export type TAPLogContext = {
	correlationId: string;
	tenantId?: string;
	resourceId?: string;
	bookingId?: string;
	holdId?: string;
	endpoint?: string;
	method?: string;
	errorValue?: ErrorValue;
	errorCategory?: ErrorCategory;
	httpStatus?: number;
};
