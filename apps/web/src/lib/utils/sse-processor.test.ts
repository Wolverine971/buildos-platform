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

describe('SSEProcessor', () => {
	it('passes V2 agent events through the progress callback', async () => {
		const onProgress = vi.fn();

		await SSEProcessor.processStream(
			buildSseResponse([
				{ type: 'session', session: { id: 'session-1' } },
				{ type: 'context_usage', usage: { status: 'near_limit', usagePercent: 82 } },
				{ type: 'context_shift', context_shift: { new_context: 'project' } },
				{ type: 'operation', operation: { type: 'tool', message: 'ran op' } },
				{ type: 'done', finished_reason: 'stop' }
			]),
			{ onProgress }
		);

		expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ type: 'session' }));
		expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ type: 'context_usage' }));
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
});
