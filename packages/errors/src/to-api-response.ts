import type { APIErrorResponse, TAPError } from './types';

export function toAPIErrorResponse(error: TAPError): APIErrorResponse {
	const response: APIErrorResponse = {
		error: {
			value: error.errorValue,
			httpStatus: error.httpStatus,
			message: error.message,
			correlationId: error.correlationId,
		},
	};

	if (error.details !== undefined) {
		response.error.details = error.details;
	}

	return response;
}
