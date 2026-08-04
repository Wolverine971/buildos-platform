// apps/worker/tests/agenticChatExecutionInput.test.ts
import {
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
	hashTurnInputArtifactContentV1,
	validateTurnInputArtifactV1,
	type AgenticChatTurnClaimResultV1,
	type TurnInputArtifactV1
} from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import {
	AgenticChatExecutionInputError,
	SupabaseAgenticChatExecutionInputAdapter
} from '../src/workers/agentic-chat/executionInput';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const QUEUE_JOB_ID = '40000000-0000-4000-8000-000000000004';
const CORRELATION_ID = '50000000-0000-4000-8000-000000000005';
const INPUT_ARTIFACT_ID = '70000000-0000-4000-8000-000000000007';
const USER_MESSAGE_ID = '80000000-0000-4000-8000-000000000008';
const STREAM_RUN_ID = 'stream-run-1';
const CLIENT_TURN_ID = 'client-turn-1';
const EXECUTION_GENERATION = 2;
const NOW = Date.parse('2026-08-03T12:00:00.000Z');

const claim = {
	outcome: 'claimed',
	executionMayStart: true,
	turnRunId: TURN_RUN_ID,
	queueJobId: QUEUE_JOB_ID,
	sessionId: SESSION_ID,
	userId: USER_ID,
	correlationId: CORRELATION_ID,
	executionGeneration: EXECUTION_GENERATION,
	status: 'running',
	inputArtifactId: INPUT_ARTIFACT_ID,
	userMessageId: USER_MESSAGE_ID
} satisfies Extract<
	AgenticChatTurnClaimResultV1,
	{ outcome: 'claimed' | 'matching_current_claim' }
>;

async function artifactFixture(): Promise<{
	artifact: TurnInputArtifactV1;
	row: Record<string, unknown>;
}> {
	const artifact: TurnInputArtifactV1 = {
		artifactVersion: AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
		historySource: 'admission_window',
		history: [
			{
				sourceMessageId: '90000000-0000-4000-8000-000000000009',
				role: 'assistant',
				content: 'Frozen history',
				attachments: [],
				toolCalls: [],
				toolCallId: null
			}
		],
		prepared: {
			sourcePreparedPromptId: null,
			contextPayload: { project: { id: 'project-1' } },
			conversationSummary: null,
			surfaceProfile: 'project_default',
			systemPrompt: 'You are a fixture-only agent.',
			promptSections: [],
			toolSurface: { names: ['fixture_read'] },
			sessionSnapshot: {
				summary: null,
				agent_metadata: {}
			},
			contextUsageSnapshot: {
				estimatedTokens: 10,
				tokenBudget: 15_000,
				usagePercent: 0,
				tokensRemaining: 14_990,
				status: 'ok',
				lastCompressedAt: null,
				lastCompression: null
			}
		},
		createdAt: '2026-08-03T11:00:00.000Z',
		retainUntil: '2026-08-10T11:00:00.000Z',
		contentHash: ''
	};
	artifact.contentHash = await hashTurnInputArtifactContentV1(artifact);
	const validation = await validateTurnInputArtifactV1(artifact, {
		excludedMessageId: USER_MESSAGE_ID
	});
	if (!validation.ok) throw new Error(`invalid test artifact: ${validation.code}`);

	return {
		artifact,
		row: {
			id: INPUT_ARTIFACT_ID,
			turn_run_id: TURN_RUN_ID,
			session_id: SESSION_ID,
			user_id: USER_ID,
			source_prepared_prompt_id: null,
			artifact_version: artifact.artifactVersion,
			history_source: artifact.historySource,
			history: artifact.history,
			prepared: artifact.prepared,
			content_hash: artifact.contentHash,
			history_bytes: validation.historyBytes,
			content_bytes: validation.contentBytes,
			created_at: artifact.createdAt,
			retain_until: artifact.retainUntil
		}
	};
}

function turnFixture(overrides: Record<string, unknown> = {}) {
	return {
		id: TURN_RUN_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		queue_job_id: QUEUE_JOB_ID,
		correlation_id: CORRELATION_ID,
		execution_generation: EXECUTION_GENERATION,
		execution_mode: 'worker_realtime',
		status: 'running',
		stream_run_id: STREAM_RUN_ID,
		client_turn_id: CLIENT_TURN_ID,
		input_artifact_id: INPUT_ARTIFACT_ID,
		user_message_id: USER_MESSAGE_ID,
		request_payload: {
			clientTurnId: CLIENT_TURN_ID,
			streamRunId: STREAM_RUN_ID,
			message: 'Run the fixture',
			context: { type: 'project', entityId: 'project-1' }
		},
		request_payload_version: 'agentic_chat_request_v1',
		...overrides
	};
}

function clientFor(turn: unknown, artifact: unknown) {
	const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
	const from = vi.fn((table: string) => {
		const filters: Array<[string, unknown]> = [];
		calls.push({ table, filters });
		const query = {
			select: vi.fn(() => query),
			eq: vi.fn((column: string, value: unknown) => {
				filters.push([column, value]);
				return query;
			}),
			maybeSingle: vi.fn(async () => ({
				data: table === 'chat_turn_runs' ? turn : artifact,
				error: null
			}))
		};
		return query;
	});
	return { client: { from } as never, calls };
}

describe('SupabaseAgenticChatExecutionInputAdapter', () => {
	it('loads an immutable command and verifies artifact content plus scope metadata', async () => {
		const { artifact, row } = await artifactFixture();
		const { client, calls } = clientFor(turnFixture(), row);
		const adapter = new SupabaseAgenticChatExecutionInputAdapter(client, () => NOW);

		await expect(adapter.load(claim)).resolves.toEqual({
			claim,
			streamRunId: STREAM_RUN_ID,
			clientTurnId: CLIENT_TURN_ID,
			requestPayload: turnFixture().request_payload,
			artifact
		});
		expect(calls).toEqual([
			{
				table: 'chat_turn_runs',
				filters: [
					['id', TURN_RUN_ID],
					['user_id', USER_ID],
					['session_id', SESSION_ID],
					['queue_job_id', QUEUE_JOB_ID]
				]
			},
			{
				table: 'chat_turn_input_artifacts',
				filters: [
					['id', INPUT_ARTIFACT_ID],
					['turn_run_id', TURN_RUN_ID],
					['session_id', SESSION_ID],
					['user_id', USER_ID]
				]
			}
		]);
	});

	it('fails closed when frozen history no longer matches its content hash', async () => {
		const { row } = await artifactFixture();
		row.history = [
			{
				sourceMessageId: '90000000-0000-4000-8000-000000000009',
				role: 'assistant',
				content: 'Mutated after admission',
				attachments: [],
				toolCalls: [],
				toolCallId: null
			}
		];
		const { client } = clientFor(turnFixture(), row);

		await expect(
			new SupabaseAgenticChatExecutionInputAdapter(client, () => NOW).load(claim)
		).rejects.toMatchObject<Partial<AgenticChatExecutionInputError>>({
			code: 'invalid_artifact'
		});
	});

	it('rejects a v3 session snapshot that tries to override database scope', async () => {
		const { row } = await artifactFixture();
		row.prepared = {
			...(row.prepared as Record<string, unknown>),
			sessionSnapshot: {
				id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
				summary: null,
				agent_metadata: {}
			}
		};
		const { client } = clientFor(turnFixture(), row);

		await expect(
			new SupabaseAgenticChatExecutionInputAdapter(client, () => NOW).load(claim)
		).rejects.toMatchObject<Partial<AgenticChatExecutionInputError>>({
			code: 'invalid_artifact'
		});
	});

	it('rejects a command payload cross-bound to another stream', async () => {
		const { row } = await artifactFixture();
		const { client } = clientFor(
			turnFixture({
				request_payload: {
					clientTurnId: CLIENT_TURN_ID,
					streamRunId: 'different-stream',
					message: 'Run the fixture',
					context: {}
				}
			}),
			row
		);

		await expect(
			new SupabaseAgenticChatExecutionInputAdapter(client, () => NOW).load(claim)
		).rejects.toMatchObject<Partial<AgenticChatExecutionInputError>>({
			code: 'invalid_command'
		});
	});

	it('rejects a valid artifact outside its execution retention window', async () => {
		const { row } = await artifactFixture();
		const { client } = clientFor(turnFixture(), row);

		await expect(
			new SupabaseAgenticChatExecutionInputAdapter(client, () =>
				Date.parse('2026-08-11T00:00:00.000Z')
			).load(claim)
		).rejects.toMatchObject<Partial<AgenticChatExecutionInputError>>({
			code: 'artifact_expired'
		});
	});
});
