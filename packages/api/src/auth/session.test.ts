import { describe, expect, test } from 'bun:test';
import { createSession, deleteSession, validateSession } from './session';

describe('createSession', () => {
	test('creates session with valid format', () => {
		const session = createSession();
		expect(session.sessionId).toMatch(/^sess_[A-Z0-9]+$/);
	});

	test('creates session with future expiry', () => {
		const session = createSession();
		expect(session.expiresAt).toBeGreaterThan(Date.now());
	});

	test('creates unique session IDs', () => {
		const session1 = createSession();
		const session2 = createSession();
		expect(session1.sessionId).not.toBe(session2.sessionId);
	});

	test('expiry is approximately 1 hour in future', () => {
		const before = Date.now();
		const session = createSession();
		const after = Date.now();

		const oneHourMs = 60 * 60 * 1000;
		expect(session.expiresAt).toBeGreaterThanOrEqual(before + oneHourMs - 100);
		expect(session.expiresAt).toBeLessThanOrEqual(after + oneHourMs + 100);
	});
});

describe('validateSession', () => {
	test('validates newly created session', () => {
		const session = createSession();
		expect(validateSession(session.sessionId)).toBe(true);
	});

	test('rejects non-existent session', () => {
		expect(validateSession('sess_NONEXISTENT123')).toBe(false);
	});

	test('rejects empty session ID', () => {
		expect(validateSession('')).toBe(false);
	});

	test('rejects malformed session ID', () => {
		expect(validateSession('not_a_session')).toBe(false);
	});
});

describe('deleteSession', () => {
	test('deletes existing session', () => {
		const session = createSession();
		expect(validateSession(session.sessionId)).toBe(true);

		deleteSession(session.sessionId);
		expect(validateSession(session.sessionId)).toBe(false);
	});

	test('handles deleting non-existent session gracefully', () => {
		expect(() => deleteSession('sess_NONEXISTENT')).not.toThrow();
	});

	test('handles deleting same session twice', () => {
		const session = createSession();
		deleteSession(session.sessionId);
		expect(() => deleteSession(session.sessionId)).not.toThrow();
	});
});

describe('session lifecycle', () => {
	test('multiple sessions can coexist', () => {
		const sessions = Array.from({ length: 10 }, () => createSession());

		for (const session of sessions) {
			expect(validateSession(session.sessionId)).toBe(true);
		}
	});

	test('deleting one session does not affect others', () => {
		const session1 = createSession();
		const session2 = createSession();
		const session3 = createSession();

		deleteSession(session2.sessionId);

		expect(validateSession(session1.sessionId)).toBe(true);
		expect(validateSession(session2.sessionId)).toBe(false);
		expect(validateSession(session3.sessionId)).toBe(true);
	});
});
