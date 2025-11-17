import { expect, test } from 'bun:test';
import { createMutex } from './mutex';

test('mutex serializes concurrent operations', async () => {
	const mutex = createMutex();
	const results: number[] = [];

	const operation1 = async () => {
		const release = await mutex('test-key');
		await new Promise((resolve) => setTimeout(resolve, 10));
		results.push(1);
		release();
	};

	const operation2 = async () => {
		const release = await mutex('test-key');
		await new Promise((resolve) => setTimeout(resolve, 5));
		results.push(2);
		release();
	};

	await Promise.all([operation1(), operation2()]);

	expect(results).toEqual([1, 2]);
});

test('mutex allows parallel operations on different keys', async () => {
	const mutex = createMutex();
	const results: string[] = [];

	const operation1 = async () => {
		const release = await mutex('key1');
		await new Promise((resolve) => setTimeout(resolve, 10));
		results.push('key1');
		release();
	};

	const operation2 = async () => {
		const release = await mutex('key2');
		await new Promise((resolve) => setTimeout(resolve, 5));
		results.push('key2');
		release();
	};

	await Promise.all([operation1(), operation2()]);

	expect(results.sort()).toEqual(['key1', 'key2']);
});

test('mutex handles rapid sequential operations', async () => {
	const mutex = createMutex();
	const results: number[] = [];

	for (let i = 0; i < 5; i++) {
		const release = await mutex('rapid-key');
		results.push(i);
		release();
	}

	expect(results).toEqual([0, 1, 2, 3, 4]);
});
