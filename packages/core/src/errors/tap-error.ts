import type { APIErrorResponse, ErrorValue } from '@tap/protocol';
import { ERROR_META } from './error-meta';

export class TapError extends Error {
	public readonly code: ErrorValue;
	public readonly httpStatus: number;
	public readonly details?: Record<string, unknown>;
	public readonly correlationId: string;

	constructor(
		code: ErrorValue,
		message: string,
		details?: Record<string, unknown>,
		correlationId?: string,
	) {
		super(message);
		this.name = 'TapError';
		this.code = code;
		this.httpStatus = ERROR_META[code]?.httpStatus ?? 500;
		this.details = details;
		this.correlationId = correlationId ?? crypto.randomUUID();
	}

	public toJSON(): APIErrorResponse {
		return {
			error: {
				value: this.code,
				httpStatus: this.httpStatus,
				message: this.message,
				correlationId: this.correlationId,
				...(this.details ? { details: this.details } : {}),
			},
		};
	}

	public toResponse(): Response {
		return new Response(JSON.stringify(this.toJSON()), {
			status: this.httpStatus,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	}
}
