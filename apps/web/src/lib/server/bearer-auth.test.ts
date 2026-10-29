// apps/web/src/lib/server/bearer-auth.test.ts
import { describe, expect, it } from 'vitest';
import { readUnverifiedJwtExpiry, readUserBearerToken } from './bearer-auth';

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = `${encode({ alg: 'ES256' })}.${encode({ sub: 'user', exp: 1_900_000_000 })}.c2ln`;

function request(authorization?: string) {
	return new Request('https://build-os.com/api/today', {
		headers: authorization ? { authorization } : {}
	});
}

describe('readUserBearerToken', () => {
	it('returns a JWT bearer token', () => {
		expect(readUserBearerToken(request(`Bearer ${jwt}`))).toBe(jwt);
	});

	it('accepts a lowercase scheme and surrounding whitespace', () => {
		expect(readUserBearerToken(request(`bearer   ${jwt}  `))).toBe(jwt);
	});

	it('ignores requests without an Authorization header', () => {
		expect(readUserBearerToken(request())).toBeNull();
	});

	it.each([
		['agent caller token', 'Bearer boca_live_abcdef0123456789'],
		['legacy agent token', 'Bearer bo_abcdef0123456789'],
		['basic auth', 'Basic dXNlcjpwYXNz'],
		['empty bearer', 'Bearer '],
		['two segments', 'Bearer aaa.bbb'],
		['four segments', 'Bearer aaa.bbb.ccc.ddd'],
		['non-base64url characters', 'Bearer aaa.b+b.ccc']
	])('leaves %s to the cookie path and its own route (%s)', (_label, header) => {
		expect(readUserBearerToken(request(header))).toBeNull();
	});
});

describe('readUnverifiedJwtExpiry', () => {
	it('reads exp from the payload', () => {
		expect(readUnverifiedJwtExpiry(jwt)).toBe(1_900_000_000);
	});

	it.each([
		['missing exp', `${encode({})}.${encode({ sub: 'user' })}.c2ln`],
		['non-numeric exp', `${encode({})}.${encode({ exp: 'soon' })}.c2ln`],
		['malformed payload', 'a.!!!.c'],
		['not a jwt', 'boca_token']
	])('returns null for %s', (_label, token) => {
		expect(readUnverifiedJwtExpiry(token)).toBeNull();
	});
});
