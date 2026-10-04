// scripts/check-google-oauth-readiness.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkConfiguration, checkPublicPages } from './check-google-oauth-readiness.mjs';

test('diagnostics never disclose supplied secrets or account allowlists', () => {
	const secret = 'private-secret-sentinel-that-must-not-appear';
	const env = Object.fromEntries(
		[
			'PUBLIC_GOOGLE_CLIENT_ID',
			'PRIVATE_GOOGLE_CLIENT_ID',
			'PRIVATE_GOOGLE_CLIENT_SECRET',
			'PRIVATE_GOOGLE_CALENDAR_CLIENT_ID',
			'PRIVATE_GOOGLE_CALENDAR_CLIENT_SECRET',
			'PRIVATE_GMAIL_READ_CLIENT_ID',
			'PRIVATE_GMAIL_READ_CLIENT_SECRET',
			'PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1',
			'PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1',
			'PRIVATE_MULTI_CALENDAR_CONNECTIONS_USER_IDS'
		].map((key) => [key, secret])
	);
	const checks = checkConfiguration(env);
	assert.equal(JSON.stringify(checks).includes(secret), false);
	assert.equal(checks.find((check) => check.name.includes('three distinct')).status, 'fail');
});

test('missing keys and mismatched sign-in clients fail without treating wildcard rollout as enabled', () => {
	const checks = checkConfiguration({
		PUBLIC_GOOGLE_CLIENT_ID: 'one',
		PRIVATE_GOOGLE_CLIENT_ID: 'two',
		PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED: 'true',
		PRIVATE_MULTI_CALENDAR_CONNECTIONS_USER_IDS: '*'
	});
	assert.equal(checks.find((check) => check.name.includes('IDs match')).status, 'fail');
	assert.equal(checks.find((check) => check.name.includes('rollout')).status, 'review');
	assert.equal(checks.find((check) => check.name.includes('GMAIL_TOKEN')).status, 'fail');
});

test('public checks never follow redirects, forward credentials, or retain page contents', async () => {
	const requests = [];
	const pages = await checkPublicPages(async (url, options) => {
		requests.push({ url, options });
		return new Response('page-content-sentinel', {
			status: url.endsWith('/privacy') ? 302 : 200
		});
	});
	assert.equal(requests.length, 4);
	for (const { url, options } of requests) {
		assert.equal(new URL(url).origin, 'https://build-os.com');
		assert.equal(options.redirect, 'manual');
		assert.equal(options.headers, undefined);
	}
	assert.equal(pages.find((page) => page.url.endsWith('/privacy')).status, 'fail');
	assert.equal(JSON.stringify(pages).includes('page-content-sentinel'), false);
});

test('network errors are failures and do not leak error payloads', async () => {
	const pages = await checkPublicPages(async () => {
		throw new Error('sensitive-request-sentinel');
	});
	assert.ok(pages.every((page) => page.status === 'fail'));
	assert.equal(JSON.stringify(pages).includes('sensitive-request-sentinel'), false);
});
