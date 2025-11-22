import type { APIErrorResponse } from '@tap/core'; // Using the schema-derived type if available, or local definition
import { ERROR_META } from './error-meta';
import type { ErrorValue } from './error-values';

// If APIErrorResponse is not exported from core/protocol fully, we might need to ensure it is.
// Previously in core/protocol.ts we exported APIErrorResponse.

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
		// Fallback to 500 if not found in meta (shouldn't happen with strict types)
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
