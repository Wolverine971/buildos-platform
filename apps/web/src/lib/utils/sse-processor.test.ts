// apps/web/src/lib/utils/sse-processor.test.ts
import { describe, expect, it, vi } from 'vitest';
import { SSEProcessor } from './sse-processor';

function buildSseResponse(events: unknown[]): Response {
	const encoder = new TextEncoder();
	const payload = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
	return new Response(
		new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(payload));
				controller.close();
			}
		})
	);
}

function buildRawSseResponse(chunks: string[]): Response {
	const encoder = new TextEncoder();
	return new Response(
		new ReadableStream({
			start(controller) {
				for (const chunk of chunks) {
					controller.enqueue(encoder.encode(chunk));
				}
				controller.close();
			}
		})
	);
}

describe('SSEProcessor', () => {
	it('passes V2 agent events through the progress callback', async () => {
		const onProgress = vi.fn();

		await SSEProcessor.processStream(
			buildSseResponse([
				{ type: 'session', session: { id: 'session-1' } },
				{ type: 'context_usage', usage: { status: 'near_limit', usagePercent: 82 } },
				{
					type: 'timing',
					timing: { request_started_at: '2026-03-12T00:00:00.000Z', phases: {} }
				},
				{ type: 'context_shift', context_shift: { new_context: 'project' } },
				{ type: 'operation', operation: { type: 'tool', message: 'ran op' } },
				{ type: 'done', finished_reason: 'stop' }
			]),
			{ onProgress }
		);

		expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ type: 'session' }));
		expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ type: 'context_usage' }));
		expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ type: 'timing' }));
		expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ type: 'context_shift' }));
		expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ type: 'operation' }));
		expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ type: 'done' }));
	});

	it('routes error events to the error callback', async () => {
		const onError = vi.fn();

		await SSEProcessor.processStream(buildSseResponse([{ type: 'error', error: 'boom' }]), {
			onError
		});

		expect(onError).toHaveBeenCalledWith('boom');
	});

	it('parses CRLF-delimited event blocks and data fields without a space', async () => {
		const onProgress = vi.fn();
		const onComplete = vi.fn();
		const onStatus = vi.fn();
		const payload = [
			'event: message_start\r\n',
			`data:${JSON.stringify({ type: 'progress', progress: 1 })}\r\n\r\n`,
			'data: {"type":\r\n',
			'data: "done","complete":true}\r\n\r\n',
			'data: [DONE]\r\n\r\n'
		];

		await SSEProcessor.processStream(buildRawSseResponse(payload), {
			onComplete,
			onProgress,
			onStatus
		});

		expect(onStatus).toHaveBeenCalledWith('message_start');
		expect(onProgress).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'progress', progress: 1 })
		);
		expect(onComplete).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'done', complete: true })
		);
	});
});
