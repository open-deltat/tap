import type { APIErrorResponse, ErrorValue } from '@open-tap/protocol';
import type { ZodFormattedError } from 'zod';
import { ERROR_META } from './error-meta';

/** Error details can be a Zod validation error or custom object */
export type TapErrorDetails =
	| ZodFormattedError<unknown>
	| Record<string, unknown>;

export class TapError extends Error {
	public readonly code: ErrorValue;
	public readonly httpStatus: number;
	public readonly details: TapErrorDetails | undefined;
	public readonly correlationId: string;

	constructor(
		code: ErrorValue,
		message: string,
		details?: TapErrorDetails,
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
