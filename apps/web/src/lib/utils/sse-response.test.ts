// apps/web/src/lib/utils/sse-response.test.ts
import { describe, expect, it } from 'vitest';
import { SSEResponse } from './sse-response';

describe('SSEResponse', () => {
	it('emits sanitized id and event fields', async () => {
		const stream = new TransformStream();
		const writer = stream.writable.getWriter();
		const encoder = new TextEncoder();
		const response = new Response(stream.readable);
		const bodyPromise = response.text();

		await SSEResponse.sendMessage(
			writer,
			encoder,
			{ ok: true },
			'status\nbad',
			'id-1\nretry: 1\rdata: injected\0tail'
		);
		await writer.close();

		const body = await bodyPromise;
		expect(body.split('\n').slice(0, 3)).toEqual([
			'id: id-1 retry: 1 data: injected tail',
			'event: status bad',
			'data: {"ok":true}'
		]);
		expect(body).not.toContain('\nretry: 1\n');
	});
});
