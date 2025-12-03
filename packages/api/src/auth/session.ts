import { ulid } from 'ulid';

const SESSION_TTL_MS = 60 * 60 * 1000;

const sessions = new Map<string, { expiresAt: number }>();

export const createSession = (): { sessionId: string; expiresAt: number } => {
	const sessionId = `sess_${ulid()}`;
	const expiresAt = Date.now() + SESSION_TTL_MS;

	sessions.set(sessionId, { expiresAt });

	return { sessionId, expiresAt };
};

export const validateSession = (sessionId: string): boolean => {
	const session = sessions.get(sessionId);
	if (!session) {
		return false;
	}
	if (session.expiresAt < Date.now()) {
		sessions.delete(sessionId);
		return false;
	}
	return true;
};

export const deleteSession = (sessionId: string): void => {
	sessions.delete(sessionId);
};

setInterval(() => {
	const now = Date.now();
	for (const [id, session] of sessions) {
		if (session.expiresAt < now) {
			sessions.delete(id);
		}
	}
}, 60_000);
