// apps/worker/tests/agenticChatReviewerGrounding.test.ts
import { describe, expect, it } from 'vitest';
import { buildMutationBatch, mutationBatchSha256 } from '@buildos/agentic-chat-runtime/loop';
import {
	ONTOLOGY_WRITE_TOOLS,
	REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION
} from '@buildos/agentic-chat-runtime/catalog';
import type { AgenticChatTurnProviderRequestV1 } from '../src/workers/agentic-chat/provider/contracts';
import { AgenticChatProviderExecutionError } from '../src/workers/agentic-chat/provider/contracts';
import {
	collectLoadedEntityIds,
	groundedMutationReviewIds,
	reviewerReferencesAreGrounded
} from '../src/workers/agentic-chat/provider/review/grounded-ids';
import { buildMutationBatchReviewRequest } from '../src/workers/agentic-chat/provider/review/mutation-batch';
import { completeMutationBatchReviewDecision } from '../src/workers/agentic-chat/provider/review/decision-completion';
import {
	appendToolCallDelta,
	createToolCallAccumulator
} from '../src/workers/agentic-chat/provider/stream-tool-calls';
import { buildContinuationRequest } from '../src/workers/agentic-chat/provider/request-builders';

const A = '10000000-0000-4000-8000-000000000001';
const B = '10000000-0000-4000-8000-000000000002';
const INVENTED = '10000000-0000-4000-8000-000000000099';
function request(): AgenticChatTurnProviderRequestV1 {
	return {
		messages: [
			{ role: 'user', content: 'Finish the accepted cleanup including the rest of it.' }
		],
		loadedEntityIds: [A, B],
		tools: [REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION, ...ONTOLOGY_WRITE_TOOLS],
		toolChoice: 'auto',
		userId: A,
		sessionId: A,
		turnRunId: A,
		streamRunId: 'stream',
		clientTurnId: 'client',
		contextType: 'project',
		entityId: A,
		projectId: A,
		queueJobId: A,
		processingToken: A,
		executionGeneration: 1,
		providerRound: 'initial',
		logicalProviderRound: 1,
		signal: new AbortController().signal
	};
}
function approve(candidate: string, target: string = B) {
	const actingRequest = request();
	const batch = buildMutationBatch([
		{
			id: 'stage-a',
			name: 'update_onto_task',
			canonicalProviderArguments: JSON.stringify({ task_id: A, archived: true })
		}
	]);
	const sha = mutationBatchSha256(batch);
	const reviewRequest = buildMutationBatchReviewRequest(
		actingRequest,
		actingRequest.tools,
		batch,
		sha,
		true,
		true
	);
	const toolCalls = createToolCallAccumulator();
	appendToolCallDelta(toolCalls, [
		{
			index: 0,
			id: 'approval',
			type: 'function',
			function: {
				name: 'approve_mutation_batch_review',
				arguments: JSON.stringify({
					reason: 'Accepted cleanup',
					batch_sha256: sha,
					reference_candidates: [
						{ reference: 'the rest', candidates: [{ id: candidate, title: 'Task' }] }
					],
					request_expectation: {
						outcomes: [
							{
								id: 'all-cleanup',
								action: 'archive',
								entity_kind: 'task',
								target_ids: [A, target],
								required_fields: ['archived'],
								changes: [{ field: 'archived', value: 'true' }],
								minimum_successful_effects: 2
							}
						]
					}
				})
			}
		}
	]);
	return completeMutationBatchReviewDecision({
		actingRequest,
		reviewRequest,
		batch,
		batchSha256: sha,
		toolCalls,
		finished: true,
		finishedReason: 'tool_calls',
		fallbackReason: null,
		allowRevision: true
	});
}
describe('reviewer grounding', () => {
	it('grounds defect targets while allowing a rejection to identify an actual wrong proposed ID', () => {
		const batch = buildMutationBatch([
			{
				id: 'wrong-target',
				name: 'update_onto_task',
				canonicalProviderArguments: JSON.stringify({ task_id: INVENTED, archived: true })
			}
		]);
		const ids = new Set([A]);
		const findings = { findings: [{ target_ids: [INVENTED] }] };
		expect(reviewerReferencesAreGrounded(findings, ids)).toBe(false);
		expect(reviewerReferencesAreGrounded(findings, ids, batch)).toBe(true);
		expect(
			reviewerReferencesAreGrounded(
				{ reference_candidates: [{ candidates: [{ id: INVENTED }] }] },
				ids,
				batch
			)
		).toBe(false);
	});
	it('preserves opaque identities returned by calendar tools', () => {
		const ids = new Set(collectLoadedEntityIds({ events: [{ id: 'GoogleEvent_123' }] }));
		expect(
			reviewerReferencesAreGrounded(
				{ reference_candidates: [{ candidates: [{ id: 'GoogleEvent_123' }] }] },
				ids
			)
		).toBe(true);
		expect(
			reviewerReferencesAreGrounded(
				{ reference_candidates: [{ candidates: [{ id: 'googleevent_123' }] }] },
				ids
			)
		).toBe(false);
	});
	it('keeps every accepted target when approving a correct partial stage', () => {
		const decision = approve(B)[0]!;
		expect((decision.arguments.request_expectation as any).outcomes[0].target_ids).toEqual([
			A,
			B
		]);
	});
	it.each([INVENTED, 'mistyped-id'])('rejects ungrounded candidate %s', (candidate) => {
		try {
			approve(candidate);
			throw new Error('approval accepted');
		} catch (error) {
			expect(error).toBeInstanceOf(AgenticChatProviderExecutionError);
			expect((error as AgenticChatProviderExecutionError).diagnostic).toMatchObject({
				code: 'ungrounded_reference_id'
			});
		}
	});
	it('reads only structured server identities, excluding UUID-looking prose and custom metadata', () => {
		expect(
			collectLoadedEntityIds({
				task: {
					id: A,
					description: `id ${INVENTED}`,
					props: { id: INVENTED },
					metadata: { document_id: INVENTED }
				},
				relations: [{ src_id: A, dst_id: B }],
				content: JSON.stringify({ id: INVENTED })
			})
		).toEqual([A, B]);
	});
	it('does not let a proposed target ground itself; server archive facts can ground descendants', () => {
		const input = request();
		input.loadedEntityIds = [];
		const batch = buildMutationBatch([
			{
				id: 'archive',
				name: 'update_onto_document',
				canonicalProviderArguments: JSON.stringify({
					document_id: INVENTED,
					state_key: 'archived',
					_archive_review: { documents: [{ id: A }, { id: B }] }
				})
			}
		]);
		expect([...groundedMutationReviewIds(input, batch)!]).toEqual([A, B]);
	});
	it('carries successful returned identities into the next review without inventing them from arguments', () => {
		const input = request();
		input.loadedEntityIds = [];
		const next = buildContinuationRequest(
			input,
			[
				{
					kind: 'read',
					id: 'read',
					name: 'list_onto_tasks',
					arguments: { project_id: INVENTED },
					canonicalArguments: JSON.stringify({ project_id: INVENTED }),
					canonicalProviderArguments: JSON.stringify({ project_id: INVENTED })
				}
			],
			[
				{
					providerToolCallId: 'read',
					toolName: 'list_onto_tasks',
					execution: { result: { tasks: [{ id: A }, { id: B }] } }
				} as any
			]
		);
		expect(next.loadedEntityIds).toEqual([A, B]);
	});
});
