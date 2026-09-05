// apps/worker/tests/agenticChatOpenRouterPromptDump.test.ts
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	AgenticChatOpenRouterClient,
	type AgenticChatProviderUsageObservationV1
} from '../src/workers/agentic-chat/provider/openrouter-client';
import type { AgenticChatTurnProviderClientPortV1 } from '../src/workers/agentic-chat/provider/contracts';
import {
	localPromptDumpsEnabled,
	startLocalPromptDump
} from '../src/workers/agentic-chat/promptDump';

const files = vi.hoisted(() => ({ directory: '' }));
vi.mock('../src/workers/agentic-chat/promptDump', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/workers/agentic-chat/promptDump')>();
	return {
		...actual,
		localPromptDumpsEnabled: vi.fn(() => true),
		startLocalPromptDump: vi.fn((identity, body) =>
			actual.startLocalPromptDump(identity, body, {
				directory: files.directory,
				env: { NODE_ENV: 'development', AGENTIC_CHAT_LOCAL_PROMPT_DUMPS: 'true' }
			})
		)
	};
});

beforeEach(() => {
	files.directory = mkdtempSync(join(tmpdir(), 'provider-dumps-'));
	vi.mocked(localPromptDumpsEnabled).mockReturnValue(true);
	vi.mocked(startLocalPromptDump).mockClear();
});
afterEach(() => {
	rmSync(files.directory, { recursive: true, force: true });
});

function input(): Parameters<AgenticChatTurnProviderClientPortV1['stream']>[0] {
	return {
		messages: [
			{ role: 'system', content: 'Actual system prompt' },
			{ role: 'user', content: 'User request' }
		],
		tools: [],
		toolChoice: 'none',
		userId: 'user-1',
		sessionId: 'session-1',
		turnRunId: 'turn-1',
		streamRunId: 'stream-1',
		clientTurnId: 'client-1',
		contextType: 'global',
		entityId: null,
		projectId: null,
		queueJobId: 'job-1',
		processingToken: 'secret-processing-token',
		executionGeneration: 1,
		providerRound: 'initial',
		logicalProviderRound: 1,
		passRole: 'acting',
		signal: new AbortController().signal
	};
}

function success() {
	return new Response(
		[
			'data: {"id":"gen-test","model":"test/model","choices":[{"delta":{"content":"Hello"}}]}',
			'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":100,"completion_tokens":10,"total_tokens":110,"cost":0.001}}',
			'data: [DONE]'
		].join('\n\n') + '\n\n',
		{ headers: { 'content-type': 'text/event-stream' } }
	);
}

function client(fetchImpl: typeof fetch, fallback = false) {
	const observe = vi.fn<(usage: AgenticChatProviderUsageObservationV1) => Promise<void>>(
		async () => {}
	);
	const routes = [
		{
			id: 'primary',
			kind: 'openrouter' as const,
			baseUrl: 'https://openrouter.example/api/v1',
			apiKey: 'secret-api-key',
			model: 'test/model'
		}
	];
	if (fallback) routes.push({ ...routes[0]!, id: 'fallback', model: 'test/fallback' });
	return {
		observe,
		provider: new AgenticChatOpenRouterClient(
			{ usage: { observe } },
			{ routes, fetchImpl, httpReferer: 'https://build-os.com', appName: 'BuildOS test' }
		)
	};
}

async function consume(provider: AgenticChatOpenRouterClient, request = input()) {
	for await (const _event of provider.stream(request)) {
		/* Drain to completion. */
	}
}

function dumps() {
	return readdirSync(files.directory)
		.filter((name) => name.endsWith('.json') && name !== 'latest.json')
		.map((name) => JSON.parse(readFileSync(join(files.directory, name), 'utf8')));
}

describe('OpenRouter prompt dump wiring', () => {
	it('captures the exact body passed to fetch, links usage, and preserves later reviewer context', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () => {
			expect(dumps().at(-1)?.outcome.status).toBe('pending');
			return success();
		});
		const { provider, observe } = client(fetchImpl);
		await consume(provider);
		const review = input();
		review.passRole = 'contract_review';
		review.logicalProviderRound = 2;
		review.providerAttempt = 2;
		review.messages = [
			{ role: 'system', content: 'Reviewer system' },
			{ role: 'user', content: 'Candidate and accumulated results' }
		];
		await consume(provider, review);
		const records = dumps();
		expect(records).toHaveLength(2);
		for (const [index, record] of records.entries()) {
			expect(record.request).toEqual(
				JSON.parse(String(fetchImpl.mock.calls[index]?.[1]?.body))
			);
			expect(record.outcome).toMatchObject({
				status: 'success',
				requestId: 'gen-test',
				usage: { cost: 0.001 }
			});
			expect(record.responseEvents).toContainEqual({ type: 'text', content: 'Hello' });
			expect(record.usageLogId).toBe(observe.mock.calls[index]?.[0].usageLogId);
			expect(observe.mock.calls[index]?.[0].localPromptDump?.jsonFile).toBeTruthy();
			expect(JSON.stringify(record)).not.toContain('secret-');
		}
		expect(records[1]).toMatchObject({
			passRole: 'contract_review',
			logicalProviderRound: 2,
			providerAttempt: 2
		});
		expect(records[1].request.messages).toEqual(review.messages);
	});

	it('retains failed HTTP attempts separately when a fallback succeeds', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				new Response('{"error":{"message":"Unavailable"}}', { status: 503 })
			)
			.mockResolvedValueOnce(success());
		const { provider } = client(fetchImpl, true);
		await consume(provider);
		const records = dumps();
		expect(records).toHaveLength(2);
		expect(records[0]).toMatchObject({
			routeId: 'primary',
			outcome: { status: 'failure', httpStatus: 503 }
		});
		expect(records[1]).toMatchObject({ routeId: 'fallback', outcome: { status: 'success' } });
	});

	it('retains aborted streams and finalizes their dump when the consumer closes', async () => {
		const { provider } = client(vi.fn<typeof fetch>(async () => success()));
		const abort = new AbortController();
		const request = { ...input(), signal: abort.signal };
		const stream = provider.stream(request);
		await stream.next();
		abort.abort(new Error('Cancelled by user'));
		await stream.return(undefined);
		expect(dumps()[0].outcome.status).toBe('aborted');
	});

	it('leaves production requests untouched with no dump work or metadata', async () => {
		vi.mocked(localPromptDumpsEnabled).mockReturnValue(false);
		const { provider, observe } = client(vi.fn<typeof fetch>(async () => success()));
		await consume(provider);
		expect(startLocalPromptDump).not.toHaveBeenCalled();
		expect(dumps()).toEqual([]);
		expect(observe.mock.calls[0]?.[0].localPromptDump).toBeUndefined();
	});
});
