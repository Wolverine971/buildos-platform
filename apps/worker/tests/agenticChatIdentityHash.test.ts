// apps/worker/tests/agenticChatIdentityHash.test.ts
//
// Golden identities for every stable UUID and sha256 hex derivation in the
// Agentic Chat worker. The inline values were captured from the pre-refactor
// copy-pasted helpers; a changed byte here means persisted ids, idempotency
// keys, or transition ids would no longer match rows already written.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	createStableAgenticChatEffectIdentityV1,
	createStableAgenticChatMutationLogicalOperationIdV1
} from '../src/workers/agentic-chat/effects/effect-identity';
import { createStableAgenticChatPromptSnapshotIdV1 } from '../src/workers/agentic-chat/effects/prompt-snapshot';
import { deriveAgenticChatReadPlanningIdentityV1 } from '../src/workers/agentic-chat/effects/read-planning-telemetry';
import { contextSelectionTransitionId } from '../src/workers/agentic-chat/provider/chat-context-finder';
import { createStableAgenticChatProviderUsageLogIdV1 } from '../src/workers/agentic-chat/provider/openrouter/usage';
import {
	createStableAgenticChatReadToolProgressTransitionIdV1,
	createStableAgenticChatReadToolTransitionIdV1
} from '../src/workers/agentic-chat/tools/read-tool-identity';
import { createStableAgenticChatToolExecutionIdV1 } from '../src/workers/agentic-chat/tools/tool-execution';
import { sha256Hex, stableUuidFromSeed } from '../src/workers/agentic-chat/shared/identity-hash';
import { createStableAgenticChatLifecycleTransitionIdV1 } from '../src/workers/agentic-chat/turn/lifecycle-identity';

const TURN_A = '4f9c2a1e-8b3d-4c7a-9e21-5d6f7a8b9c0d';
const TURN_B = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

/** Frozen copy of the helper body that was pasted across the worker (12 copies). */
function frozenUuidFromSha256(value: string): string {
	const bytes = createHash('sha256').update(value, 'utf8').digest().subarray(0, 16);
	bytes[6] = (bytes[6]! & 0x0f) | 0x50;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Frozen copy of the local `sha256` hex helpers. */
function frozenSha256(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

const SEEDS = [
	'',
	'agentic-chat-stalled-message-v1:4f9c2a1e-8b3d-4c7a-9e21-5d6f7a8b9c0d:3',
	'agentic_chat_stated_future_capture_logical_operation_v1:0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
	'agentic_chat_research_capture_identity_v1:4f9c2a1e-8b3d-4c7a-9e21-5d6f7a8b9c0d',
	'agentic-chat-workflow-answer-v1:4f9c2a1e-8b3d-4c7a-9e21-5d6f7a8b9c0d:1',
	'Café ☕ — 日本語 🚀',
	'x'.repeat(10_000)
];

describe('shared identity hash', () => {
	it('derives the same UUID as the frozen per-module copy for every seed', () => {
		for (const seed of SEEDS) {
			expect(stableUuidFromSeed(seed)).toBe(frozenUuidFromSha256(seed));
		}
		expect(stableUuidFromSeed(SEEDS[1]!)).toMatchInlineSnapshot(
			`"28d5ea6d-c4c4-56f3-b8cb-98c4a1a9d338"`
		);
	});

	it('produces version-5, RFC 4122 variant UUIDs', () => {
		for (const seed of SEEDS) {
			expect(stableUuidFromSeed(seed)).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
			);
		}
	});

	it('hashes UTF-8 exactly like the frozen sha256 helpers', () => {
		for (const seed of SEEDS) {
			expect(sha256Hex(seed)).toBe(frozenSha256(seed));
		}
		expect(sha256Hex('Café ☕')).toMatchInlineSnapshot(
			`"0c3eecb944c2e450fd5306f55518b2c6bc0bd710732cf11c2baf282f95d594d4"`
		);
	});

	it('matches the seed formats the exported identity functions hash', () => {
		expect(createStableAgenticChatPromptSnapshotIdV1(TURN_A)).toBe(
			stableUuidFromSeed(`agentic_chat_prompt_snapshot_identity_v1:${TURN_A}`)
		);
		expect(
			createStableAgenticChatToolExecutionIdV1({ turnRunId: TURN_B, sequenceIndex: 7 })
		).toBe(stableUuidFromSeed(`agentic_chat_read_tool_execution_identity_v1:${TURN_B}:7`));
		expect(
			createStableAgenticChatLifecycleTransitionIdV1({
				turnRunId: TURN_A,
				stage: 'acknowledged'
			})
		).toBe(stableUuidFromSeed(`agentic-chat-lifecycle-transition-v1:${TURN_A}:acknowledged`));
	});
});

describe('Agentic Chat stable identities (golden values)', () => {
	it('keeps mutation logical-operation and effect identities', () => {
		const logicalOperationId = createStableAgenticChatMutationLogicalOperationIdV1({
			turnRunId: TURN_A,
			providerRound: 1,
			callIndex: 2
		});
		expect(logicalOperationId).toMatchInlineSnapshot(`"e03d0728-c721-58ed-89fe-745da75acc2d"`);
		expect(
			createStableAgenticChatEffectIdentityV1({
				turnRunId: TURN_A,
				logicalOperationId,
				toolName: 'update_onto_task',
				operationName: 'onto.task.update',
				arguments: { title: 'Café ☕ launch', task_id: 'task-1' }
			})
		).toMatchInlineSnapshot(`
			{
			  "canonicalArgumentHash": "b97babacf34ad562e732c6cde265b3a4c6c1642116fed688141d297eadf8c8b5",
			  "downstreamIdempotencyKey": "chat-effect:829c19ef-547e-5375-9037-26863fa533fc",
			  "effectId": "829c19ef-547e-5375-9037-26863fa533fc",
			}
		`);
	});

	it('keeps lifecycle, read-tool, and tool-execution identities', () => {
		expect([
			createStableAgenticChatLifecycleTransitionIdV1({
				turnRunId: TURN_A,
				stage: 'acknowledged'
			}),
			createStableAgenticChatLifecycleTransitionIdV1({ turnRunId: TURN_B, stage: 'timing' }),
			createStableAgenticChatReadToolTransitionIdV1({
				turnRunId: TURN_A,
				providerToolCallId: 'call_1',
				stage: 'call'
			}),
			createStableAgenticChatReadToolProgressTransitionIdV1({
				turnRunId: TURN_A,
				executionGeneration: 2,
				providerToolCallId: 'call_1',
				index: 3
			}),
			createStableAgenticChatToolExecutionIdV1({ turnRunId: TURN_B, sequenceIndex: 7 })
		]).toMatchInlineSnapshot(`
			[
			  "2e182751-46b0-563a-9c18-47450c933026",
			  "7fd6c5ae-1404-5665-9d56-6a035e3654b7",
			  "159b90e4-c808-5924-a81e-fa70c24a0b91",
			  "0f8b3683-7cf5-51bb-8e9d-1aa89c323616",
			  "007ebae4-7b59-5409-972d-13dbd05b1321",
			]
		`);
	});

	it('keeps prompt-snapshot, provider-usage, and context-selection identities', () => {
		expect([
			createStableAgenticChatPromptSnapshotIdV1(TURN_A),
			createStableAgenticChatProviderUsageLogIdV1({
				turnRunId: TURN_A,
				executionGeneration: 1,
				logicalProviderRound: 3,
				routeId: 'openrouter-primary'
			}),
			createStableAgenticChatProviderUsageLogIdV1({
				turnRunId: TURN_B,
				executionGeneration: 2,
				logicalProviderRound: 1,
				providerAttempt: 2,
				routeId: 'openrouter-primary'
			}),
			contextSelectionTransitionId(TURN_A, { items: [{ id: 'doc-1', tier: 'full' }] })
		]).toMatchInlineSnapshot(`
			[
			  "bce2db5c-3cac-5fc2-ad0c-a275d23dfe2b",
			  "6ce019f0-ad73-5e7b-b1cd-bfa7e9e1c324",
			  "c4a6ff38-8fe9-5a45-a36a-a5e86ade8162",
			  "69b50c72-a0af-5062-b6d4-a457fca3515f",
			]
		`);
	});

	it('keeps read-planning sha256 keys', () => {
		expect(
			deriveAgenticChatReadPlanningIdentityV1({
				toolName: 'get_onto_task_details',
				arguments: { task_id: 'task-1', project_id: 'project-1', call_ref: 'a', after: [] }
			})
		).toMatchInlineSnapshot(`
			{
			  "exactReadKey": "00600498df515f367be06c45c5fa743646487fe80dc304d0c8b455b292a3e4e0",
			  "executionClass": "evidence_read",
			  "resourceKey": "8f5ae013c91def4cb9d7c38a201099d92f56d94e14c4f7042d0edec490bc1e5f",
			}
		`);
	});
});
