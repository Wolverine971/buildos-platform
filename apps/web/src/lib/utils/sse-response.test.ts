// apps/web/src/lib/utils/sse-response.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SSEResponse } from './sse-response';

describe('SSEResponse', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

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

	it('emits sanitized SSE comment frames', async () => {
		const stream = new TransformStream();
		const writer = stream.writable.getWriter();
		const encoder = new TextEncoder();
		const response = new Response(stream.readable);
		const bodyPromise = response.text();

		await SSEResponse.sendComment(writer, encoder, 'ping\ndata: injected\0tail');
		await writer.close();

		await expect(bodyPromise).resolves.toBe(': ping data: injected tail\n\n');
	});

	it('emits chat heartbeat comments on the configured interval', async () => {
		vi.useFakeTimers();
		const chatStream = SSEResponse.createChatStream({ heartbeatIntervalMs: 25 });
		const reader = chatStream.response.body?.getReader();
		if (!reader) throw new Error('Expected chat stream response body');

		try {
			const readPromise = reader.read();
			await vi.advanceTimersByTimeAsync(25);
			const chunk = await readPromise;

			expect(chunk.done).toBe(false);
			expect(new TextDecoder().decode(chunk.value)).toBe(': ping\n\n');
		} finally {
			await chatStream.close();
			reader.releaseLock();
		}
	});

	it('stops chat heartbeat comments when the stream closes', async () => {
		vi.useFakeTimers();
		const chatStream = SSEResponse.createChatStream({ heartbeatIntervalMs: 25 });
		const bodyPromise = chatStream.response.text();

		await chatStream.close();
		await vi.advanceTimersByTimeAsync(100);

		await expect(bodyPromise).resolves.toBe('');
	});
});
