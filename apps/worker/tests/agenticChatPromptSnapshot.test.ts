// apps/worker/tests/agenticChatPromptSnapshot.test.ts
import { createHash } from 'node:crypto';
import { canonicalizeAgenticChatJson, type JsonValue } from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import {
	AgenticChatPromptSnapshotProtocolError,
	SupabaseAgenticChatPromptSnapshotAdapter,
	createStableAgenticChatPromptSnapshotIdV1
} from '../src/workers/agentic-chat/promptSnapshot';
import {
	AGENTIC_CHAT_WORKER_PROMPT_SNAPSHOT_VERSION,
	type AgenticChatPreparedPromptSnapshotV1
} from '../src/workers/agentic-chat/providerContract';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const QUEUE_JOB_ID = '40000000-0000-4000-8000-000000000004';
const PROCESSING_TOKEN = '50000000-0000-4000-8000-000000000005';
const PROMPT_SNAPSHOT_ID = '3524065b-5f84-57d2-8847-d5b9d76fd8d8';

const modelMessages = [
	{ role: 'system', content: 'System prompt' },
	{ role: 'assistant', content: 'Prior answer' },
	{ role: 'user', content: 'Current request' }
];
const toolDefinitions = [
	{
		type: 'function',
		function: {
			name: 'get_project_overview',
			description: 'Read the project overview.',
			parameters: { type: 'object', properties: {} }
		}
	}
];
const canonicalMessages = canonicalizeAgenticChatJson(modelMessages as JsonValue);
const canonicalTools = canonicalizeAgenticChatJson(toolDefinitions as JsonValue);
const prompt: AgenticChatPreparedPromptSnapshotV1 = {
	snapshotVersion: AGENTIC_CHAT_WORKER_PROMPT_SNAPSHOT_VERSION,
	modelMessages,
	toolDefinitions,
	systemPromptSha256: sha256('System prompt'),
	messagesSha256: sha256(canonicalMessages),
	toolsSha256: sha256(canonicalTools),
	systemPromptChars: 13,
	messageChars: 40,
	approxPromptTokens: 11
};

const input = {
	turnRunId: TURN_RUN_ID,
	userId: USER_ID,
	queueJobId: QUEUE_JOB_ID,
	processingToken: PROCESSING_TOKEN,
	executionGeneration: 2,
	promptSnapshotId: PROMPT_SNAPSHOT_ID,
	prompt
};

function receipt(overrides: Record<string, unknown> = {}) {
	return {
		outcome: 'persisted',
		snapshot_available: true,
		turn_run_id: TURN_RUN_ID,
		queue_job_id: QUEUE_JOB_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		execution_generation: 2,
		status: 'running',
		prompt_snapshot_id: PROMPT_SNAPSHOT_ID,
		snapshot_version: AGENTIC_CHAT_WORKER_PROMPT_SNAPSHOT_VERSION,
		prompt_variant: 'fastchat_lite_v1',
		system_prompt_sha256: prompt.systemPromptSha256,
		messages_sha256: prompt.messagesSha256,
		tools_sha256: prompt.toolsSha256,
		tool_definition_count: prompt.toolDefinitions.length,
		system_prompt_chars: prompt.systemPromptChars,
		message_chars: prompt.messageChars,
		approx_prompt_tokens: prompt.approxPromptTokens,
		created_at: '2026-08-04T12:00:00.123456Z',
		...overrides
	};
}

function adapterFor(value: unknown) {
	const rpc = vi.fn(async () => ({ data: value, error: null }));
	return {
		adapter: new SupabaseAgenticChatPromptSnapshotAdapter({ rpc }),
		rpc
	};
}

describe('Agentic Chat prompt snapshots', () => {
	it('pins stable snapshot identity and sends the exact fenced RPC payload', async () => {
		expect(createStableAgenticChatPromptSnapshotIdV1(TURN_RUN_ID)).toBe(PROMPT_SNAPSHOT_ID);
		const { adapter, rpc } = adapterFor(receipt());

		await expect(adapter.persist(input)).resolves.toEqual({
			outcome: 'persisted',
			snapshotAvailable: true,
			promptSnapshotId: PROMPT_SNAPSHOT_ID
		});
		expect(rpc).toHaveBeenCalledWith('persist_agentic_chat_prompt_snapshot_v2', {
			p_turn_run_id: TURN_RUN_ID,
			p_user_id: USER_ID,
			p_queue_job_id: QUEUE_JOB_ID,
			p_processing_token: PROCESSING_TOKEN,
			p_execution_generation: 2,
			p_prompt_snapshot_id: PROMPT_SNAPSHOT_ID,
			p_model_messages: modelMessages,
			p_tool_definitions: toolDefinitions,
			p_system_prompt_sha256: prompt.systemPromptSha256,
			p_messages_sha256: prompt.messagesSha256,
			p_tools_sha256: prompt.toolsSha256,
			p_system_prompt_chars: 13,
			p_message_chars: 40,
			p_approx_prompt_tokens: 11
		});
	});

	it('accepts immutable replay and non-writing ownership outcomes', async () => {
		const replay = adapterFor(receipt({ outcome: 'already_persisted' })).adapter;
		await expect(replay.persist(input)).resolves.toMatchObject({
			outcome: 'already_persisted',
			snapshotAvailable: true
		});

		const stale = adapterFor(
			receipt({
				outcome: 'stale_generation',
				snapshot_available: false,
				execution_generation: 3,
				requested_execution_generation: 2
			})
		).adapter;
		await expect(stale.persist(input)).resolves.toEqual({
			outcome: 'stale_generation',
			snapshotAvailable: false,
			promptSnapshotId: null
		});

		const cancelled = adapterFor(
			receipt({
				outcome: 'cancel_requested',
				snapshot_available: false,
				status: 'running'
			})
		).adapter;
		await expect(cancelled.persist(input)).resolves.toMatchObject({
			outcome: 'cancel_requested',
			snapshotAvailable: false
		});
	});

	it('rejects locally inconsistent prompt evidence before calling the database', async () => {
		const { adapter, rpc } = adapterFor(receipt());
		await expect(
			adapter.persist({
				...input,
				prompt: { ...prompt, messageChars: prompt.messageChars + 1 }
			})
		).rejects.toBeInstanceOf(AgenticChatPromptSnapshotProtocolError);
		expect(rpc).not.toHaveBeenCalled();

		await expect(
			adapter.persist({
				...input,
				prompt: { ...prompt, toolsSha256: 'f'.repeat(64) }
			})
		).rejects.toThrow('tools hash does not match the prepared prompt');
		expect(rpc).not.toHaveBeenCalled();
	});

	it('rejects a successful receipt that drifts from the prepared prompt', async () => {
		const { adapter } = adapterFor(receipt({ tools_sha256: 'f'.repeat(64) }));
		await expect(adapter.persist(input)).rejects.toThrow(
			'persisted snapshot receipt is inconsistent'
		);
	});
});

function sha256(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}
