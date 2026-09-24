// packages/shared-agent-ops/src/email/gmail-gateway-infrastructure.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	mapWithConcurrency,
	parseMultipartHttpResponse,
	readJsonBounded,
	readTextBounded
} from './gmail-gateway-infrastructure';

function policy(emptyBody: () => unknown = () => null) {
	return {
		emptyBody,
		responseTooLargeError: () => new Error('too large'),
		invalidJsonError: () => new Error('invalid json')
	};
}

describe('readJsonBounded', () => {
	it('parses JSON and delegates empty-body behavior to the gateway policy', async () => {
		await expect(readJsonBounded(new Response('{"ok":true}'), 100, policy())).resolves.toEqual({
			ok: true
		});

		const emptyBody = vi.fn(() => ({ source: 'policy' }));
		await expect(readJsonBounded(new Response(null), 100, policy(emptyBody))).resolves.toEqual({
			source: 'policy'
		});
		expect(emptyBody).toHaveBeenCalledOnce();
	});

	it('rejects an oversized content-length before reading the body', async () => {
		const response = new Response('{"ok":true}', {
			headers: { 'content-length': '101' }
		});
		await expect(readJsonBounded(response, 100, policy())).rejects.toThrow('too large');
	});

	it('cancels a streaming body once the byte limit is exceeded', async () => {
		const cancel = vi.fn();
		const response = new Response(
			new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('123456'));
				},
				cancel
			})
		);

		await expect(readJsonBounded(response, 5, policy())).rejects.toThrow('too large');
		expect(cancel).toHaveBeenCalledOnce();
	});

	it('uses the gateway policy for invalid JSON errors', async () => {
		await expect(readJsonBounded(new Response('{oops'), 100, policy())).rejects.toThrow(
			'invalid json'
		);
	});
});

describe('readTextBounded', () => {
	it('reads text and refuses a body over the byte limit', async () => {
		await expect(
			readTextBounded(new Response('hello'), 100, () => new Error('big'))
		).resolves.toBe('hello');
		await expect(
			readTextBounded(new Response('123456'), 5, () => new Error('big'))
		).rejects.toThrow('big');
	});
});

describe('parseMultipartHttpResponse', () => {
	it('splits a Google batch response into content ids, statuses, and bodies', () => {
		const body = [
			'--batch_x',
			'Content-Type: application/http',
			'Content-ID: <response-m0>',
			'',
			'HTTP/1.1 200 OK',
			'Content-Type: application/json; charset=UTF-8',
			'',
			'{',
			'  "id": "a"',
			'}',
			'',
			'--batch_x',
			'Content-Type: application/http',
			'Content-ID: <response-m1>',
			'',
			'HTTP/1.1 429 Too Many Requests',
			'',
			'{"error":{}}',
			'--batch_x--',
			''
		].join('\r\n');

		expect(parseMultipartHttpResponse(body, 'batch_x')).toEqual([
			{ contentId: 'm0', status: 200, body: '{\r\n  "id": "a"\r\n}' },
			{ contentId: 'm1', status: 429, body: '{"error":{}}' }
		]);
	});

	it('reports a malformed part without a status instead of throwing', () => {
		const body = '--b\r\nContent-ID: <response-m0>\r\n\r\nnot http\r\n--b--';
		expect(parseMultipartHttpResponse(body, 'b')).toEqual([
			{ contentId: 'm0', status: null, body: '' }
		]);
	});
});

describe('mapWithConcurrency', () => {
	it('preserves result order while respecting the concurrency ceiling', async () => {
		let active = 0;
		let maximumActive = 0;
		const results = await mapWithConcurrency([20, 5, 10], 2, async (delay) => {
			active += 1;
			maximumActive = Math.max(maximumActive, active);
			await new Promise((resolve) => setTimeout(resolve, delay));
			active -= 1;
			return delay / 5;
		});

		expect(results).toEqual([4, 1, 2]);
		expect(maximumActive).toBe(2);
	});

	it('stops scheduling new work after an abort while allowing in-flight work to settle', async () => {
		const controller = new AbortController();
		let started = 0;
		const results = await mapWithConcurrency(
			[0, 1, 2, 3],
			2,
			async (value) => {
				started += 1;
				if (started === 2) controller.abort();
				await Promise.resolve();
				return value;
			},
			{ signal: controller.signal }
		);

		expect(started).toBe(2);
		expect(results.slice(0, 2)).toEqual([0, 1]);
		expect(2 in results).toBe(false);
	});

	it('rejects invalid concurrency limits', async () => {
		await expect(mapWithConcurrency([], 0, async () => null)).rejects.toThrow(
			'positive integer'
		);
	});
});
