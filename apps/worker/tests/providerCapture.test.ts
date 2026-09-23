// apps/worker/tests/providerCapture.test.ts
import { describe, expect, it, vi } from 'vitest';
import { AgenticChatOpenRouterClient } from '../src/workers/agentic-chat/provider/openrouter-client';
import type { AgenticChatTurnProviderClientEventV1 } from '../src/workers/agentic-chat/provider/contracts';
import { AgenticChatPendingEffectsRegistry } from '../src/workers/agentic-chat/pendingEffects';
import { createProviderCapture, providerCallTiming } from './helpers/providerCapture';

/** The paid pilot's capture must observe calls without changing or prolonging them. */

const MODEL = 'deepseek/deepseek-v4.1-flash';
const encoder = new TextEncoder();

function frames(): string[] {
	return [
		JSON.stringify({
			id: 'g',
			model: MODEL,
			provider: 'Together',
			choices: [{ delta: { content: '{"analyst":' } }]
		}),
		JSON.stringify({
			id: 'g',
			model: MODEL,
			choices: [{ delta: { content: '"a","reviewer":"b"}' } }]
		}),
		JSON.stringify({
			id: 'g',
			model: MODEL,
			choices: [{ delta: {}, finish_reason: 'stop', native_finish_reason: 'stop' }],
			usage: {
				prompt_tokens: 1_000,
				completion_tokens: 300,
				total_tokens: 1_300,
				cost: 0.0004,
				completion_tokens_details: { reasoning_tokens: 120 },
				prompt_tokens_details: { cached_tokens: 0 }
			}
		}),
		'[DONE]'
	];
}

function sseResponse(body: ReadableStream<Uint8Array> | string): Response {
	return new Response(body, {
		status: 200,
		headers: { 'content-type': 'text/event-stream', 'x-openrouter-provider': 'Together' }
	});
}

function input(signal = new AbortController().signal) {
	return {
		messages: [
			{ role: 'system', content: 'Rules\n\nROLE: Planner\nPlan it.' },
			{ role: 'user', content: 'Evidence' }
		] as const,
		tools: [],
		toolChoice: 'none' as const,
		userId: '10000000-0000-4000-8000-000000000001',
		sessionId: '20000000-0000-4000-8000-000000000002',
		turnRunId: '30000000-0000-4000-8000-000000000003',
		streamRunId: 'stream-run-1',
		clientTurnId: 'client-turn-1',
		contextType: 'project',
		entityId: 'project-1',
		projectId: 'project-1',
		queueJobId: '40000000-0000-4000-8000-000000000004',
		processingToken: '50000000-0000-4000-8000-000000000005',
		executionGeneration: 1,
		providerRound: 'initial' as const,
		logicalProviderRound: 1,
		passRole: 'acting' as const,
		signal
	};
}

function client(fetchImpl: typeof fetch) {
	return new AgenticChatOpenRouterClient(
		{
			usage: { observe: vi.fn(async () => undefined) },
			pendingEffects: new AgenticChatPendingEffectsRegistry()
		},
		{
			routes: [
				{
					id: 'openrouter',
					kind: 'openrouter',
					baseUrl: 'https://openrouter.example/api/v1',
					apiKey: 'provider-secret',
					model: MODEL,
					fallbackModels: []
				}
			],
			httpReferer: 'https://build-os.com',
			appName: 'BuildOS test',
			fetchImpl,
			requestTimeoutMs: 10_000,
			responseHeadersTimeoutMs: 1_000
		}
	);
}

async function collect(stream: AsyncIterable<AgenticChatTurnProviderClientEventV1>) {
	const events: AgenticChatTurnProviderClientEventV1[] = [];
	for await (const event of stream) events.push(event);
	return events;
}

describe('provider capture (paid-harness diagnostics)', () => {
	it('passes a real client stream through unchanged and records text, usage and timing', async () => {
		const base = vi.fn(async () =>
			sseResponse(
				frames()
					.map((frame) => `data: ${frame}\n\n`)
					.join('')
			)
		);
		const capture = createProviderCapture(base as unknown as typeof fetch);
		const events = await collect(client(capture.fetchImpl).stream(input()));
		await capture.settled(1_000);

		expect(
			events
				.filter((e) => e.type === 'text')
				.map((e) => (e as { content: string }).content)
				.join('')
		).toBe('{"analyst":"a","reviewer":"b"}');
		expect(events.at(-1)).toMatchObject({ type: 'done' });
		const [call] = capture.calls;
		expect(call).toMatchObject({
			httpStatus: 200,
			provider: 'Together',
			modelUsed: MODEL,
			finishReason: 'stop',
			text: '{"analyst":"a","reviewer":"b"}',
			error: null,
			usage: { completionTokens: 300, reasoningTokens: 120, costUsd: 0.0004 }
		});
		expect(call!.request.role).toBe('Planner');
		// The dispatch join key: the bytes the client actually sent.
		const sent = (base.mock.calls[0] as unknown as [string, RequestInit])[1].body as string;
		expect(call!.requestBytes).toBe(Buffer.byteLength(sent, 'utf8'));
		expect(providerCallTiming(call!)).toMatchObject({
			completionTokens: 300,
			visibleTokens: 180
		});
		expect(call!.endedAtMs).not.toBeNull();
	});

	it('cancels the provider stream when the client stops reading, so nothing keeps generating', async () => {
		let sourceCancelled = false;
		const source = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode(`data: ${frames()[0]}\n\n`));
				// Never closes on its own: only a cancel ends it.
			},
			cancel() {
				sourceCancelled = true;
			}
		});
		const capture = createProviderCapture((async () =>
			sseResponse(source)) as unknown as typeof fetch);
		const response = await capture.fetchImpl(
			'https://openrouter.example/api/v1/chat/completions',
			{
				method: 'POST',
				body: '{}'
			}
		);
		const reader = response.body!.getReader();
		await reader.read();
		await reader.cancel('done early');
		await capture.settled(1_000);

		expect(sourceCancelled).toBe(true);
		expect(capture.calls[0]!.error).toMatch(/^client_cancelled/);
		expect(capture.calls[0]!.text).toBe('{"analyst":');
	});

	it('treats a cancel after the finish frame as a completion', async () => {
		const source = new ReadableStream<Uint8Array>({
			start(controller) {
				for (const frame of frames())
					controller.enqueue(encoder.encode(`data: ${frame}\n\n`));
				// End-of-stream never arrives before the client's cancel.
			}
		});
		const capture = createProviderCapture((async () =>
			sseResponse(source)) as unknown as typeof fetch);
		const response = await capture.fetchImpl(
			'https://openrouter.example/api/v1/chat/completions',
			{ method: 'POST', body: '{}' }
		);
		const reader = response.body!.getReader();
		for (let i = 0; i < 4; i += 1) await reader.read();
		await reader.cancel();
		await capture.settled(1_000);

		expect(capture.calls[0]).toMatchObject({ finishReason: 'stop', error: null });
	});

	it('keeps a provider error body', async () => {
		const capture = createProviderCapture(
			(async () =>
				new Response(JSON.stringify({ error: { message: 'No endpoints found' } }), {
					status: 404,
					headers: { 'content-type': 'application/json' }
				})) as unknown as typeof fetch
		);
		const response = await capture.fetchImpl(
			'https://openrouter.example/api/v1/chat/completions',
			{
				method: 'POST',
				body: '{}'
			}
		);
		await response.text();
		await capture.settled(1_000);

		expect(capture.calls[0]).toMatchObject({ httpStatus: 404 });
		expect(capture.calls[0]!.error).toContain('http_404');
		expect(capture.calls[0]!.error).toContain('No endpoints found');
	});

	it('bounds settled() when a stream is never read to the end', async () => {
		const capture = createProviderCapture((async () =>
			sseResponse(
				new ReadableStream<Uint8Array>({ start() {} })
			)) as unknown as typeof fetch);
		await capture.fetchImpl('https://openrouter.example/api/v1/chat/completions', {
			method: 'POST',
			body: '{}'
		});
		const started = Date.now();
		await capture.settled(50);
		expect(Date.now() - started).toBeLessThan(1_000);
	});
});
