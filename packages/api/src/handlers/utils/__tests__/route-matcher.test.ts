import { expect, test } from 'bun:test';
import { matchRoute } from '../route-matcher';

test('matchRoute matches simple path', () => {
	const result = matchRoute('/v1/public/test/book', '/v1/public/test/book');
	expect(result).toEqual({});
});

test('matchRoute extracts single parameter', () => {
	const result = matchRoute('/v1/public/demo/book', '/v1/public/:slug/book');
	expect(result).toEqual({ slug: 'demo' });
});

test('matchRoute extracts multiple parameters', () => {
	const result = matchRoute(
		'/v1/public/demo-tenant/demo-resource/book',
		'/v1/public/:tenantSlug/:resourceSlug/book',
	);
	expect(result).toEqual({
		tenantSlug: 'demo-tenant',
		resourceSlug: 'demo-resource',
	});
});

test('matchRoute returns null for mismatched path', () => {
	const result = matchRoute('/v1/public/test', '/v1/public/:slug/book');
	expect(result).toBeNull();
});

test('matchRoute returns null for different literal segments', () => {
	const result = matchRoute('/v1/private/test', '/v1/public/:slug');
	expect(result).toBeNull();
});

test('matchRoute handles empty path', () => {
	const result = matchRoute('', '');
	expect(result).toEqual({});
});

test('matchRoute handles root path', () => {
	const result = matchRoute('/', '/');
	expect(result).toEqual({});
});

test('matchRoute extracts parameter with holdId', () => {
	const result = matchRoute(
		'/v1/public/tenant/resource/hold/hold123',
		'/v1/public/:tenantSlug/:resourceSlug/hold/:holdId',
	);
	expect(result).toEqual({
		tenantSlug: 'tenant',
		resourceSlug: 'resource',
		holdId: 'hold123',
	});
});

test('matchRoute handles trailing slashes', () => {
	const result = matchRoute('/v1/public/test/', '/v1/public/:slug');
	expect(result).toEqual({ slug: 'test' });
});

test('matchRoute handles multiple consecutive parameters', () => {
	const result = matchRoute('/a/b/c', '/:x/:y/:z');
	expect(result).toEqual({ x: 'a', y: 'b', z: 'c' });
});




