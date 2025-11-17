import type { LogLevel, TAPError, TAPLogEvent } from './types';

export type CreateLogEventOptions = {
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
	error?: TAPError;
	extra?: Record<string, unknown>;
};

export function createLogEvent(options: CreateLogEventOptions): TAPLogEvent {
	const event: TAPLogEvent = {
		timestamp: new Date().toISOString(),
		level: options.level,
		msg: options.msg,
		correlationId: options.correlationId,
	};

	if (options.tenantId !== undefined) {
		event.tenantId = options.tenantId;
	}
	if (options.resourceId !== undefined) {
		event.resourceId = options.resourceId;
	}
	if (options.bookingId !== undefined) {
		event.bookingId = options.bookingId;
	}
	if (options.holdId !== undefined) {
		event.holdId = options.holdId;
	}
	if (options.clientId !== undefined) {
		event.clientId = options.clientId;
	}
	if (options.endpoint !== undefined) {
		event.endpoint = options.endpoint;
	}
	if (options.method !== undefined) {
		event.method = options.method;
	}
	if (options.ip !== undefined) {
		event.ip = options.ip;
	}
	if (options.extra !== undefined) {
		event.extra = options.extra;
	}

	if (options.error) {
		event.errorValue = options.error.errorValue;
		event.errorCategory = options.error.category;
		event.httpStatus = options.error.httpStatus;

		if (
			options.error.cause instanceof Error &&
			options.error.cause.stack !== undefined
		) {
			event.stack = options.error.cause.stack;
		}
	}

	return event;
}
