import { expect, test } from 'bun:test';
import { ULIDSchema } from '@tap/protocol';
import { ulid } from 'ulid';

test('validates valid ULID', () => {
	const validUlid = ulid();
	const result = ULIDSchema.safeParse(validUlid);
	expect(result.success).toBeTrue();
});

test('rejects invalid ULID format', () => {
	const invalidUlid = 'not-a-ulid';
	const result = ULIDSchema.safeParse(invalidUlid);
	expect(result.success).toBeFalse();
});

test('rejects ULID with wrong length', () => {
	const shortUlid = '01ARZ3NDEKTSV4RRFFQ69G5FA';
	const result = ULIDSchema.safeParse(shortUlid);
	expect(result.success).toBeFalse();
});
