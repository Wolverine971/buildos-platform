// scripts/agentic/http-trace.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateHttpTraceFetch } from './http-trace.mjs';

test('records gateway timing while preserving the exact response and unread body', async () => {
	const traces = [];
	let clock = 0;
	let call;
	const response = new Response('private document body', {
		headers: {
			'x-envoy-upstream-service-time': '105',
			'x-envoy-attempt-count': '1',
			'sb-request-id': 'request-123',
			'set-cookie': 'private-cookie'
		}
	});
	const fetch = createGateHttpTraceFetch(
		async (...args) => {
			call = args;
			clock = 157;
			return response;
		},
		{ origin: 'https://qa.example', emit: (t) => traces.push(t), now: () => clock }
	);
	const url = 'https://qa.example/rest/v1/onto_documents?id=eq.private-id';
	const init = {
		method: 'POST',
		headers: { Authorization: 'Bearer private-token' },
		body: 'private-input'
	};
	assert.equal(await fetch(url, init), response);
	assert.deepEqual(call, [url, init]);
	assert.equal(response.bodyUsed, false);
	assert.equal(traces.length, 1);
	assert.equal(traces[0].endpoint, '/rest/v1/onto_documents');
	assert.equal(traces[0].responseHeadersMs, 157);
	assert.equal(traces[0].upstreamServiceMs, 105);
	assert.equal(traces[0].upstreamAttempts, 1);
	assert.equal(JSON.stringify(traces).includes('private'), false);
	assert.equal(await response.text(), 'private document body');
});

test('does not inspect bodies or log requests outside the isolated REST/auth surface', async () => {
	const traces = [];
	let calls = 0;
	const fetch = createGateHttpTraceFetch(
		async () => {
			calls++;
			return new Response(null);
		},
		{ origin: 'https://qa.example', emit: (t) => traces.push(t) }
	);
	await fetch('https://other.example/rest/v1/users');
	await fetch('https://qa.example/storage/v1/object/private-file');
	await fetch('/invalid-relative-url');
	assert.equal(calls, 3);
	assert.deepEqual(traces, []);
});

test('logging failure never alters response, cancellation, or rejection identity', async () => {
	const response = new Response(null);
	const options = {
		origin: 'https://qa.example',
		emit: () => {
			throw new Error('logger failed');
		}
	};
	const success = createGateHttpTraceFetch(async () => response, options);
	assert.equal(await success('https://qa.example/rest/v1/users'), response);
	const controller = new AbortController();
	controller.abort();
	const error = new Error('private request failure');
	const traces = [];
	const failing = createGateHttpTraceFetch(
		async (_url, init) => {
			assert.equal(init.signal, controller.signal);
			throw error;
		},
		{ ...options, emit: (t) => traces.push(t) }
	);
	await assert.rejects(
		failing('https://qa.example/rest/v1/users', { signal: controller.signal }),
		(e) => e === error
	);
	assert.equal(traces[0].outcome, 'aborted');
	assert.equal(JSON.stringify(traces).includes('private'), false);
	const silentFailing = createGateHttpTraceFetch(async () => {
		throw error;
	}, options);
	await assert.rejects(silentFailing('https://qa.example/rest/v1/users'), (e) => e === error);
});
