// apps/worker/tests/agenticChatWorkflowPreparedContext.test.ts
import {
	AGENTIC_CHAT_WORKFLOW_LIMITS,
	AGENTIC_CHAT_WORKFLOW_POLICY_V1,
	buildAgenticChatWorkflowReviewIntentV1,
	canonicalizeAgenticChatJson,
	hashAgenticChatRawWorkflowInputV4,
	type AgenticChatPreparedWorkflowContextV1,
	type AgenticChatRawWorkflowInputV4
} from '@buildos/shared-types';
import type { MasterPromptContext } from '@buildos/agentic-chat-runtime/context';
import { describe, expect, it, vi } from 'vitest';
import { loadAgenticChatConfig } from '../src/workers/agentic-chat/config';
import { createAgenticChatWorkflowTurnPreparerV1 } from '../src/workers/agentic-chat/workflow/preparation-composition';
import {
	AgenticChatWorkflowContextError,
	buildAgenticChatWorkflowContextV1,
	buildAgenticChatWorkflowModelInputV1,
	hashAgenticChatWorkflowContextPayloadV1
} from '../src/workers/agentic-chat/workflow/prepared-context';
import { AgenticChatWorkflowTurnPreparer } from '../src/workers/agentic-chat/workflow/raw-turn-preparation';
import {
	buildAgenticChatWorkflowProgressEventV1,
	buildAgenticChatWorkflowProjectionV1,
	buildAgenticChatWorkflowStreamProjectionV1
} from '../src/workers/agentic-chat/workflow/workflow-projection';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const PROJECT_ID = 'a0000000-0000-4000-8000-00000000000a';
const LOADED_AT = '2026-09-18T12:00:00.000Z';

function context(data: Record<string, unknown>, source = 'rpc'): MasterPromptContext {
	return {
		contextType: 'project',
		entityId: PROJECT_ID,
		projectId: PROJECT_ID,
		contextLoadSource: source,
		timezone: 'America/New_York',
		data: { project: { id: PROJECT_ID, name: 'Cedar House', updated_at: LOADED_AT }, ...data }
	} as unknown as MasterPromptContext;
}

function build(value: MasterPromptContext) {
	return buildAgenticChatWorkflowContextV1({
		context: value,
		userId: USER_ID,
		projectId: PROJECT_ID,
		accessCheckedAt: LOADED_AT,
		contextLoadedAt: LOADED_AT
	});
}

function rows(kind: string, count: number, extra: Record<string, unknown> = {}) {
	return Array.from({ length: count }, (_, index) => ({
		id: `${kind}-${index}`,
		title: `${kind} ${index}`,
		updated_at: LOADED_AT,
		...extra
	}));
}

describe('workflow prepared context', () => {
	it('builds a deterministic, request-independent checkpoint within the contract bounds', () => {
		const first = build(context({ tasks: rows('task', 3), goals: rows('goal', 1) }));
		const second = build(context({ goals: rows('goal', 1), tasks: rows('task', 3) }));

		expect(first.contextHash).toBe(second.contextHash);
		expect(first.contextHash).toMatch(/^[0-9a-f]{64}$/);
		expect(hashAgenticChatWorkflowContextPayloadV1(first.payload)).toEqual({
			contextHash: first.contextHash,
			payloadBytes: first.payloadBytes
		});
		expect(first.payloadBytes).toBe(
			Buffer.byteLength(canonicalizeAgenticChatJson(first.payload), 'utf8')
		);
		expect(first.contextIdentity).toEqual({
			userId: USER_ID,
			projectId: PROJECT_ID,
			accessCheckedAt: LOADED_AT,
			contextLoadedAt: LOADED_AT,
			cacheRefUsed: null
		});
		expect(first.evidenceVersions[0]).toEqual({
			kind: 'project',
			id: PROJECT_ID,
			version: LOADED_AT,
			observedAt: LOADED_AT
		});
		expect(first.evidenceVersions.map((entry) => entry.kind)).toEqual([
			'project',
			'goal',
			'task',
			'task',
			'task'
		]);
		// The JSON-in-jsonb estimate must cover the jsonb text rendering the RPC bounds.
		expect(first.jsonbTextBytes).toBeGreaterThanOrEqual(first.payloadBytes);
	});

	it('refuses anything but an authorized project RPC read', () => {
		for (const source of [
			'rpc_null_fallback',
			'rpc_error_fallback',
			'fallback',
			'unknown_cached'
		]) {
			expect(() => build(context({}, source))).toThrow(AgenticChatWorkflowContextError);
		}
		const otherProject = context({});
		(otherProject.data as unknown as { project: { id: string } }).project.id = 'other-project';
		expect(() => build(otherProject)).toThrowError(
			expect.objectContaining({ code: 'context_unavailable' })
		);
	});

	it('keeps evidence unique and at most 256 entries, dropping the least central records first', () => {
		const built = build(
			context({
				tasks: [...rows('task', 120), { id: 'task-0', title: 'duplicate' }],
				goals: rows('goal', 12),
				documents: rows('document', 100),
				events: rows('event', 100)
			})
		);

		expect(built.evidenceVersions.length).toBeLessThanOrEqual(
			AGENTIC_CHAT_WORKFLOW_LIMITS.evidenceMaxEntries
		);
		const ids = built.evidenceVersions.map((entry) => entry.id);
		expect(new Set(ids).size).toBe(ids.length);
		// Events leave before documents, and tasks and goals survive.
		const kinds = built.evidenceVersions.map((entry) => entry.kind);
		expect(kinds.filter((kind) => kind === 'task')).toHaveLength(120);
		expect(kinds.filter((kind) => kind === 'goal')).toHaveLength(12);
		expect(kinds.filter((kind) => kind === 'event').length).toBeLessThan(100);
		expect(built.coverage.omittedRecords).toBeGreaterThan(0);
		expect(built.payload).toMatchObject({
			coverage: { omittedRecords: built.coverage.omittedRecords, evidenceLimit: 256 }
		});
	});

	it('bounds payload bytes and sanitizes values Postgres jsonb would reject', () => {
		const built = build(
			context({
				documents: rows('document', 80, { content: 'd'.repeat(9_000) }),
				tasks: [
					{
						id: 'task-weird',
						title: `nul\u0000byte lone\ud800surrogate`,
						estimate: Number.POSITIVE_INFINITY,
						nested: { a: { b: { c: { d: { e: { f: 'too deep' } } } } } }
					}
				]
			})
		);

		expect(built.payloadBytes).toBeLessThanOrEqual(
			AGENTIC_CHAT_WORKFLOW_LIMITS.contextMaxBytes
		);
		expect(built.jsonbTextBytes).toBeLessThanOrEqual(327_680);
		expect(built.coverage.truncatedStrings).toBeGreaterThan(0);
		const text = JSON.stringify(built.payload);
		expect(text).not.toContain('\\u0000');
		expect(text).not.toMatch(/\\ud800/i);
		const task = (built.payload.data as { tasks: Array<Record<string, unknown>> }).tasks[0]!;
		expect(task.title).toBe('nulbyte lone\uFFFDsurrogate');
		expect(task.estimate).toBeNull();
		// A record without timestamps gets a content-addressed version.
		expect(built.evidenceVersions.find((entry) => entry.id === 'task-weird')?.version).toMatch(
			/^sha256:[0-9a-f]{32}$/
		);
	});

	it('fails as too large when even the project record cannot fit', () => {
		const project: Record<string, unknown> = { id: PROJECT_ID };
		for (let index = 0; index < 60; index += 1) project[`field_${index}`] = 'x'.repeat(5_000);
		const value = context({});
		(value.data as unknown as { project: unknown }).project = project;

		expect(() => build(value)).toThrowError(
			expect.objectContaining({ code: 'context_too_large' })
		);
	});

	it('builds model input only from the accepted checkpoint and frozen history', async () => {
		const built = build(context({ tasks: rows('task', 2) }));
		const message = 'Review the project and tell me the biggest risk.';
		const request = {
			requestId: '70000000-0000-4000-8000-000000000007',
			turnRunId: '30000000-0000-4000-8000-000000000003',
			sessionId: '20000000-0000-4000-8000-000000000002',
			userId: USER_ID,
			userMessageId: '80000000-0000-4000-8000-000000000008',
			clientTurnId: 'client-turn-1',
			streamRunId: 'stream-run-1',
			message,
			context: { type: 'project' as const, entityId: PROJECT_ID, projectId: PROJECT_ID },
			reviewIntent: buildAgenticChatWorkflowReviewIntentV1(message),
			policy: AGENTIC_CHAT_WORKFLOW_POLICY_V1,
			policyRef: 'internal-project-review:v1',
			cacheRef: null
		};
		const history = Array.from({ length: 8 }, (_, index) => ({
			sourceMessageId: `90000000-0000-4000-8000-00000000000${index}`,
			role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
			content: `message ${index} ${'z'.repeat(2_000)}`
		}));
		const hashes = await hashAgenticChatRawWorkflowInputV4(request, history as never);
		const input = {
			artifactVersion: 'agentic_chat_input_v4',
			request,
			historySource: 'admission_window',
			history,
			requestHashVersion: 'agentic_chat_workflow_request_hash_v1',
			...hashes,
			createdAt: LOADED_AT,
			retainUntil: LOADED_AT
		} as unknown as AgenticChatRawWorkflowInputV4;
		const accepted: AgenticChatPreparedWorkflowContextV1 = {
			version: 'agentic_chat_prepared_context_v1',
			contextId: 'c0000000-0000-4000-8000-0000000000c1',
			turnRunId: request.turnRunId,
			requestId: request.requestId,
			requestHash: hashes.requestHash,
			preparationVersion: built.preparationVersion,
			contextIdentity: built.contextIdentity,
			evidenceVersions: built.evidenceVersions,
			payload: built.payload,
			payloadBytes: built.payloadBytes,
			contextHash: built.contextHash,
			acceptedAt: LOADED_AT
		};

		const model = buildAgenticChatWorkflowModelInputV1({ request: input, context: accepted });
		expect(model).toMatchObject({
			contextId: accepted.contextId,
			contextHash: accepted.contextHash,
			requestHash: hashes.requestHash,
			question: request.reviewIntent.objective
		});
		expect(model.history).toHaveLength(6);
		expect(model.history[0]!.content).toHaveLength(1_500);
		expect(model.evidenceText).toBe(JSON.stringify(built.payload));
		expect(model.evidence.get(PROJECT_ID)).toMatchObject({
			recordKind: 'project',
			label: 'project: Cedar House'
		});
		expect(
			model.sharedUserContent.startsWith(`USER QUESTION\n${request.reviewIntent.objective}`)
		).toBe(true);

		expect(() =>
			buildAgenticChatWorkflowModelInputV1({
				request: input,
				context: { ...accepted, requestHash: '0'.repeat(64) }
			})
		).toThrow('not bound');
	});
});

describe('workflow projection', () => {
	it('builds the frozen projection shape the checkpoint RPCs validate', () => {
		const preparing = buildAgenticChatWorkflowProjectionV1({ phase: 'preparing' });
		expect(preparing).toMatchObject({
			version: 'agentic_chat_workflow_projection_v1',
			reviewIntent: 'project_review',
			phase: 'preparing',
			terminalOutcome: null,
			answer: { status: 'not_started', durableBytes: 0 },
			transport: { executionState: 'active', lastDurableProgressAt: null },
			coverageGap: null
		});
		expect(preparing.steps.map((step) => [step.key, step.status])).toEqual([
			['planner', 'pending'],
			['project_analyst', 'pending'],
			['risk_reviewer', 'pending'],
			['editor', 'pending']
		]);
		expect(
			buildAgenticChatWorkflowStreamProjectionV1(preparing, 'Gathering project context')
		).toEqual({
			version: 'agentic_chat_ui_projection_v1',
			current_activity: 'Gathering project context',
			semantic_events: [],
			workflow: preparing
		});
		expect(buildAgenticChatWorkflowProgressEventV1(preparing)).toEqual({
			type: 'workflow_progress',
			workflow: preparing
		});
		expect(
			buildAgenticChatWorkflowProjectionV1({ phase: 'finished', terminalOutcome: 'failed' })
				.transport.executionState
		).toBe('terminal');
	});
});

describe('workflow preparation wiring', () => {
	const environment = {
		PRIVATE_OPENROUTER_API_KEY: 'provider-secret',
		AGENTIC_CHAT_OPENROUTER_MODEL: 'provider/primary'
	};

	it('ships off: the server switch defaults to false and parses only exact values', () => {
		expect(loadAgenticChatConfig(environment).workflowV4PreparationEnabled).toBe(false);
		expect(
			loadAgenticChatConfig({
				...environment,
				AGENTIC_CHAT_WORKFLOW_V4_PREPARATION_ENABLED: 'true'
			}).workflowV4PreparationEnabled
		).toBe(true);
		expect(() =>
			loadAgenticChatConfig({
				...environment,
				AGENTIC_CHAT_WORKFLOW_V4_PREPARATION_ENABLED: 'yes'
			})
		).toThrow('AGENTIC_CHAT_WORKFLOW_V4_PREPARATION_ENABLED must be exactly true or false');
	});

	it('installs no preparation port while the switch is off', () => {
		const ports = {
			client: { rpc: vi.fn(), from: vi.fn() } as never,
			input: { loadRawWorkflowInput: vi.fn() },
			publisher: {} as never,
			control: {} as never,
			allowedUserIds: [USER_ID]
		};

		expect(
			createAgenticChatWorkflowTurnPreparerV1({ ...ports, options: undefined })
		).toBeUndefined();
		expect(
			createAgenticChatWorkflowTurnPreparerV1({
				...ports,
				options: { preparationEnabled: false }
			})
		).toBeUndefined();
		expect(
			createAgenticChatWorkflowTurnPreparerV1({
				...ports,
				options: { preparationEnabled: true }
			})
		).toBeInstanceOf(AgenticChatWorkflowTurnPreparer);
		expect(ports.client).toBeDefined();
	});
});

it('preserves document structure and prioritizes document evidence for document organization', () => {
	const data = context({
		tasks: rows('task', 240),
		documents: rows('document', 100),
		doc_structure: { root: [{ id: 'document-0' }] }
	});
	const built = buildAgenticChatWorkflowContextV1({
		context: data,
		userId: USER_ID,
		projectId: PROJECT_ID,
		accessCheckedAt: '2026-09-19T00:00:00Z',
		contextLoadedAt: '2026-09-19T00:00:01Z',
		documentOrganization: true
	});
	expect((built.payload.data as any).doc_structure).toEqual({ root: [{ id: 'document-0' }] });
	expect((built.payload.data as any).documents).toHaveLength(100);
	expect((built.payload.data as any).tasks.length).toBeLessThan(240);
	expect(built.coverage.omittedRecords).toBeGreaterThan(0);
	expect((built.payload.data as any).documentReviewScope).toContain(
		'full document bodies are not loaded'
	);
});
