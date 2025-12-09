import type { SessionCreateResponse } from '@open-tap/protocol';
import { createSession } from '../auth/session';

export const handleSessionCreate = (): Response => {
	const session = createSession();

	const response: SessionCreateResponse = {
		sessionId: session.sessionId,
		expiresAt: session.expiresAt,
	};

	return Response.json(response, { status: 201 });
};
