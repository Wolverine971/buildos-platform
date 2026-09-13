// scripts/agentic/preflight.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import reference from './reference-data.json';
import {
	prepareGateDatabase,
	assertGateCalendarConfiguration,
	assertGateCalendarConnection
} from './preflight';

test('seeds reference data idempotently and validates it through the real RPC contract', async () => {
	const calls: Array<{ path: string; body: unknown }> = [];
	const request = (async (url: string, init: RequestInit) => {
		const path = new URL(url).pathname;
		const body = init.body ? JSON.parse(String(init.body)) : undefined;
		calls.push({ path, body });
		const result = body
			? path.endsWith('validate_facet_values')
				? []
				: null
			: path.endsWith('onto_facet_definitions')
				? reference.definitions
				: reference.values;
		return new Response(JSON.stringify(result));
	}) as typeof fetch;
	const env = {
		AGENTIC_GATE_DATABASE_ISOLATED: 'true',
		PUBLIC_SUPABASE_URL: 'https://qa.invalid',
		PRIVATE_SUPABASE_SERVICE_KEY: 'test'
	};
	assert.equal((await prepareGateDatabase(env, request)).values, 20);
	assert.equal(calls.length, 5);
	assert.deepEqual(calls[4]?.body, {
		p_scope: 'project',
		p_facets: { context: 'client', scale: 'small', stage: 'planning' }
	});
	await assert.rejects(
		prepareGateDatabase({ ...env, AGENTIC_GATE_DATABASE_ISOLATED: 'false' }, request),
		/isolated/
	);
	assert.equal(calls.length, 5);
});

test('does not call a schema-only or disconnected calendar setup a passing preflight', () => {
	assert.throws(() => assertGateCalendarConfiguration({}), /calendar setup incomplete/);
	const env = {
		PRIVATE_GOOGLE_CALENDAR_CLIENT_ID: 'calendar-client',
		PRIVATE_GOOGLE_CALENDAR_CLIENT_SECRET: 'test',
		PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1: 'a'.repeat(32)
	};
	assert.doesNotThrow(() => assertGateCalendarConfiguration(env));
	assert.throws(
		() =>
			assertGateCalendarConfiguration({
				...env,
				PRIVATE_GOOGLE_CLIENT_ID: 'calendar-client'
			}),
		/dedicated/
	);
});

test('requires the source-aware Calendar flow for the exact gate user even with saved sources', async () => {
	const userId = 'b0bd7204-7eda-4c6c-b8f8-1a6c0f70560f';
	const request = (async (url: string) => {
		const table = new URL(url).pathname.split('/').at(-1);
		return Response.json([{ id: table === 'users' ? userId : 'saved-calendar-row' }]);
	}) as typeof fetch;
	const env = {
		AGENTIC_GATE_DATABASE_ISOLATED: 'true',
		PUBLIC_SUPABASE_URL: 'https://qa.invalid',
		PRIVATE_SUPABASE_SERVICE_KEY: 'test',
		AGENTIC_TEST_USER_EMAIL: 'qa@example.com',
		PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED: 'true',
		PRIVATE_MULTI_CALENDAR_CONNECTIONS_USER_IDS: userId
	};
	for (const overrides of [
		{ PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED: 'false' },
		{ PRIVATE_MULTI_CALENDAR_CONNECTIONS_USER_IDS: '' },
		{ PRIVATE_MULTI_CALENDAR_CONNECTIONS_USER_IDS: '*' },
		{ PRIVATE_MULTI_CALENDAR_CONNECTIONS_USER_IDS: 'another-user' }
	]) {
		await assert.rejects(
			assertGateCalendarConnection({ ...env, ...overrides }, request),
			/PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED=true/
		);
	}
	await assert.doesNotReject(assertGateCalendarConnection(env, request));
});
