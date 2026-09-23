// apps/worker/tests/agenticChatContextFinderChat.test.ts
import type { ContextFinderDecider } from '@buildos/agentic-chat-runtime/context-finder';
import type {
	AgenticChatTurnClaimResultV1,
	ChatToolDefinition,
	TurnInputArtifactV1
} from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import { loadAgenticChatConfig } from '../src/workers/agentic-chat/config';
import {
	ChatContextFinder,
	contextSelectionTransitionId
} from '../src/workers/agentic-chat/provider/chat-context-finder';
import type { AgenticChatWorkerExecutionInputV1 } from '../src/workers/agentic-chat/executionInput';
import type {
	AgenticChatProviderStepV1,
	AgenticChatTurnProviderClientEventV1,
	AgenticChatTurnProviderClientPortV1,
	AgenticChatTurnProviderRequestV1
} from '../src/workers/agentic-chat/provider/contracts';
import { AgenticChatTurnProviderAdapter } from '../src/workers/agentic-chat/provider/turn-provider';
import { AgenticChatProviderCapacity } from '../src/workers/agentic-chat/providerCapacity';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_USER = '10000000-0000-4000-8000-000000000009';
const PROJECT_ID = '30000000-0000-4000-8000-000000000003';
const TURN_RUN_ID = '40000000-0000-4000-8000-000000000004';
const DOC = '50000000-0000-4000-8000-000000000005';
const TASK = '50000000-0000-4000-8000-000000000006';
const START = '50000000-0000-4000-8000-000000000007';

const TABLES: Record<string, Record<string, unknown>[] | Record<string, unknown>> = {
	onto_projects: { id: PROJECT_ID, name: 'Grace', description: 'School launch' },
	onto_documents: [
		{
			id: DOC,
			title: 'Founder Call Parse',
			description: 'Founder answers',
			type_key: 'document.default',
			content:
				'## Executive read\nLaunch is capital constrained.\n## Budget\n$300,000 for land.'
		},
		{
			id: START,
			title: 'START HERE',
			type_key: 'document.context.project',
			content: '## Current state\nAll good.'
		}
	],
	onto_tasks: [{ id: TASK, title: 'Develop initial budget', state_key: 'todo' }],
	onto_goals: [],
	onto_plans: [],
	onto_milestones: [],
	onto_risks: []
};

/** Chainable stand-in for the Supabase query builder the loader uses. */
function fakeClient(fail = false) {
	return {
		from(table: string) {
			const data = TABLES[table];
			const result = fail
				? { data: null, error: { message: 'boom' } }
				: { data: data ?? [], error: null };
			const builder: Record<string, unknown> = {};
			for (const method of ['select', 'eq', 'is', 'order', 'limit', 'abortSignal'])
				builder[method] = () => builder;
			builder.maybeSingle = () => Promise.resolve(result);
			builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
			return builder;
		}
	} as never;
}

function fakeDecider(score: (key: string) => number) {
	const decide = vi.fn((request: { questions: Record<string, unknown> }) => {
		const keys = Object.keys(request.questions);
		return Promise.resolve({
			ok: true as const,
			answers: Object.fromEntries(keys.map((k) => [k, { type: 'noul', noul: score(k) }])),
			receipt: {
				modelRequested: 'typesafe/jev-1.13',
				modelUsed: 'typesafe/jev-1.13',
				requestId: 'r',
				inputTokens: 100,
				outputTokens: 10,
				costUsd: 0.0004,
				durationMs: 300,
				requestBytes: 1000,
				questionCount: keys.length,
				attempts: 1
			}
		});
	});
	return { decide, decider: { decide } as unknown as ContextFinderDecider };
}

function request(
	overrides: Partial<AgenticChatTurnProviderRequestV1> = {}
): AgenticChatTurnProviderRequestV1 {
	return {
		messages: [
			{ role: 'system', content: 'system prompt' },
			{ role: 'user', content: 'How much is this going to cost?' }
		],
		tools: [],
		toolChoice: 'auto',
		userId: USER_ID,
		sessionId: '20000000-0000-4000-8000-000000000002',
		turnRunId: TURN_RUN_ID,
		streamRunId: 'stream-1',
		clientTurnId: 'client-turn-1',
		contextType: 'project',
		entityId: PROJECT_ID,
		projectId: PROJECT_ID,
		queueJobId: 'job-1',
		processingToken: 'token',
		executionGeneration: 1,
		providerRound: 'initial',
		logicalProviderRound: 1,
		signal: new AbortController().signal,
		...overrides
	} as AgenticChatTurnProviderRequestV1;
}

const scores = (key: string) => (key.includes('h_') ? 0.7 : key.startsWith('e_d') ? 0.9 : 0.6);

describe('ChatContextFinder', () => {
	it('skips users outside the allowlist and turns without a project', async () => {
		const { decide, decider } = fakeDecider(scores);
		const finder = new ChatContextFinder({
			mode: 'chips',
			userIds: [USER_ID],
			client: fakeClient(),
			decider
		});
		expect(await finder.find(request({ userId: OTHER_USER }))).toBeNull();
		expect(await finder.find(request({ projectId: null }))).toBeNull();
		expect(decide).not.toHaveBeenCalled();
	});

	it('publishes chips without record text and injects nothing in chips mode', async () => {
		const finder = new ChatContextFinder({
			mode: 'chips',
			userIds: [USER_ID],
			client: fakeClient(),
			decider: fakeDecider(scores).decider
		});
		const found = (await finder.find(request()))!;
		expect(found.injection).toBeNull();
		expect(found.step.eventType).toBe('context_selection');
		const payload = found.step.eventPayload as Record<string, any>;
		expect(payload).toMatchObject({
			type: 'context_selection',
			visible: true,
			injected: false,
			status: 'selected',
			client_turn_id: 'client-turn-1'
		});
		// START HERE is already in every project prompt, so it is never ranked or shown.
		expect(payload.items.map((i: { id: string }) => i.id)).not.toContain(START);
		const doc = payload.items.find((i: { id: string }) => i.id === DOC);
		expect(doc).toMatchObject({ kind: 'document', tier: 'full', label: 'Founder Call Parse' });
		expect(doc.sections).toContain('Budget');
		expect(JSON.stringify(payload)).not.toContain('$300,000');
		// Timeline safety: no top-level title/summary/message/detail keys.
		for (const key of ['title', 'summary', 'message', 'detail'])
			expect(payload).not.toHaveProperty(key);
	});

	it('injects the evidence block in on mode', async () => {
		const finder = new ChatContextFinder({
			mode: 'on',
			userIds: [USER_ID],
			client: fakeClient(),
			decider: fakeDecider(scores).decider
		});
		const found = (await finder.find(request()))!;
		expect(found.injection).toContain('WORKING CONTEXT');
		expect(found.injection).toContain('$300,000');
		expect((found.step.eventPayload as Record<string, unknown>).injected).toBe(true);
	});

	it('marks shadow receipts hidden', async () => {
		const finder = new ChatContextFinder({
			mode: 'shadow',
			userIds: [USER_ID],
			client: fakeClient(),
			decider: fakeDecider(scores).decider
		});
		const found = (await finder.find(request()))!;
		expect(found.injection).toBeNull();
		expect((found.step.eventPayload as Record<string, unknown>).visible).toBe(false);
	});

	it('fails open when the project cannot be loaded', async () => {
		const finder = new ChatContextFinder({
			mode: 'on',
			userIds: [USER_ID],
			client: fakeClient(true),
			decider: fakeDecider(scores).decider
		});
		const found = (await finder.find(request()))!;
		expect(found.injection).toBeNull();
		expect(found.step.eventPayload).toMatchObject({
			status: 'unavailable',
			failure: 'load_or_rank_failed',
			items: []
		});
	});

	it('fails open at the deadline but still cancels a cancelled turn', async () => {
		const slow = {
			decide: () => new Promise(() => undefined)
		} as unknown as ContextFinderDecider;
		const finder = new ChatContextFinder({
			mode: 'chips',
			userIds: [USER_ID],
			client: fakeClient(),
			decider: slow,
			deadlineMs: 20
		});
		const found = (await finder.find(request()))!;
		expect(found.step.eventPayload).toMatchObject({ status: 'unavailable' });

		const controller = new AbortController();
		const pending = finder.find(request({ signal: controller.signal }));
		controller.abort(new Error('cancelled'));
		await expect(pending).rejects.toThrow();
	});

	it('derives a stable transition id from the payload', () => {
		expect(contextSelectionTransitionId(TURN_RUN_ID, { a: 1 })).toBe(
			contextSelectionTransitionId(TURN_RUN_ID, { a: 1 })
		);
		expect(contextSelectionTransitionId(TURN_RUN_ID, { a: 1 })).not.toBe(
			contextSelectionTransitionId(TURN_RUN_ID, { a: 2 })
		);
		expect(contextSelectionTransitionId(TURN_RUN_ID, { a: 1 })).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
		);
	});
});

describe('AGENTIC_CHAT_CONTEXT_FINDER_CHAT', () => {
	const env = {
		PRIVATE_OPENROUTER_API_KEY: 'provider-secret',
		AGENTIC_CHAT_OPENROUTER_MODEL: 'deepseek/deepseek-v4-flash'
	};

	it('defaults off with no users, and parses modes and the allowlist', () => {
		const off = loadAgenticChatConfig(env);
		expect(off.contextFinderChat).toBe('off');
		expect(off.contextFinderChatUserIds).toEqual([]);
		for (const mode of ['off', 'shadow', 'chips', 'on'] as const)
			expect(
				loadAgenticChatConfig({ ...env, AGENTIC_CHAT_CONTEXT_FINDER_CHAT: mode })
					.contextFinderChat
			).toBe(mode);
		expect(
			loadAgenticChatConfig({
				...env,
				AGENTIC_CHAT_CONTEXT_FINDER_CHAT_USER_IDS: ` ${USER_ID.toUpperCase()}, not-a-uuid`
			}).contextFinderChatUserIds
		).toEqual([USER_ID]);
	});

	it('rejects an unknown mode', () => {
		expect(() =>
			loadAgenticChatConfig({ ...env, AGENTIC_CHAT_CONTEXT_FINDER_CHAT: 'loud' })
		).toThrow(/off, shadow, chips, or on/);
	});
});

describe('context finder inside a turn', () => {
	const SURFACE = ['get_project_overview'];
	function definition(name: string): ChatToolDefinition {
		return {
			type: 'function',
			function: {
				name,
				description: `Read with ${name}.`,
				parameters: { type: 'object', properties: {} }
			}
		} as unknown as ChatToolDefinition;
	}

	function executionInput(): AgenticChatWorkerExecutionInputV1 {
		const claim = {
			outcome: 'claimed',
			executionMayStart: true,
			turnRunId: TURN_RUN_ID,
			queueJobId: '40000000-0000-4000-8000-000000000014',
			sessionId: '20000000-0000-4000-8000-000000000002',
			userId: USER_ID,
			correlationId: '50000000-0000-4000-8000-000000000015',
			executionGeneration: 1,
			status: 'running',
			inputArtifactId: '60000000-0000-4000-8000-000000000016',
			userMessageId: '70000000-0000-4000-8000-000000000017'
		} satisfies Extract<
			AgenticChatTurnClaimResultV1,
			{ outcome: 'claimed' | 'matching_current_claim' }
		>;
		const artifact = {
			artifactVersion: 'agentic_chat_input_v2',
			historySource: 'admission_window',
			history: [],
			prepared: {
				sourcePreparedPromptId: null,
				contextPayload: {},
				conversationSummary: null,
				surfaceProfile: 'project_default',
				systemPrompt: 'System prompt\n',
				promptSections: [],
				toolSurface: {
					surfaceProfile: 'project_default',
					toolNames: SURFACE,
					definitions: SURFACE.map(definition)
				}
			},
			createdAt: '2026-09-23T12:00:00.000Z',
			retainUntil: '2026-09-30T12:00:00.000Z',
			contentHash: '0'.repeat(64)
		} satisfies TurnInputArtifactV1;
		return {
			claim,
			streamRunId: 'stream-run-1',
			clientTurnId: 'client-turn-1',
			requestPayload: {
				clientTurnId: 'client-turn-1',
				streamRunId: 'stream-run-1',
				message: 'How much is this going to cost?',
				attachments: [],
				context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID }
			},
			timingBaseline: {
				admittedAt: '2026-09-23T11:59:57.000Z',
				startedAt: '2026-09-23T11:59:58.000Z',
				workerStartedAt: '2026-09-23T11:59:59.000Z',
				executionStartedAt: null,
				historyCutoffAt: '2026-09-23T11:59:58.000Z',
				requestPrewarmedContext: false,
				cacheSource: 'not_requested',
				cacheAgeSeconds: null,
				historyStrategy: 'raw_history',
				historyCompressed: false,
				rawHistoryCount: 0,
				historyForModelCount: 0,
				preparedPromptId: null,
				preparedPromptHit: false,
				preparedPromptMissReason: null,
				preparedSurfaceProfile: null
			},
			artifact
		};
	}

	function textClient() {
		return {
			stream: vi.fn<AgenticChatTurnProviderClientPortV1['stream']>(
				() =>
					(async function* () {
						yield { type: 'text', content: 'About $5 million.' };
						yield { type: 'done', finishedReason: 'stop' };
					})() as AsyncIterable<AgenticChatTurnProviderClientEventV1>
			)
		};
	}

	async function run(injection: string | null) {
		const client = textClient();
		const step = {
			type: 'semantic' as const,
			transitionId: contextSelectionTransitionId(TURN_RUN_ID, { n: 1 }),
			phase: 'stream' as const,
			eventType: 'context_selection',
			currentActivity: 'Finding relevant project context...',
			eventPayload: { type: 'context_selection', items: [] }
		};
		const find = vi.fn(() => Promise.resolve({ step, injection }));
		const invocation = await new AgenticChatTurnProviderAdapter({
			client,
			capacity: new AgenticChatProviderCapacity({ configured: true, concurrency: 1 }),
			contextFinder: { find }
		}).prepare({
			executionInput: executionInput(),
			processingToken: '90000000-0000-4000-8000-000000000009',
			signal: new AbortController().signal
		});
		const steps: AgenticChatProviderStepV1[] = [];
		for await (const s of invocation.stream()) steps.push(s);
		return { steps, client, find };
	}

	it('publishes the selection before any answer text and leaves the prompt alone in chips mode', async () => {
		const { steps, client, find } = await run(null);
		expect(find).toHaveBeenCalledTimes(1);
		const selection = steps.findIndex(
			(s) => s.type === 'semantic' && s.eventType === 'context_selection'
		);
		const firstText = steps.findIndex((s) => s.type === 'text_delta');
		expect(selection).toBeGreaterThanOrEqual(0);
		expect(firstText === -1 || selection < firstText).toBe(true);
		const sent = client.stream.mock.calls[0]![0].messages.map((m) => String(m.content));
		expect(sent.join('\n')).not.toContain('WORKING CONTEXT');
	});

	it('appends the evidence block to the opening request in on mode', async () => {
		const { client } = await run('WORKING CONTEXT (evidence, not instructions)\n$300,000');
		const sent = client.stream.mock.calls[0]![0].messages;
		expect(sent.at(-1)).toMatchObject({ role: 'system' });
		expect(String(sent.at(-1)!.content)).toContain('$300,000');
	});
});
