// apps/worker/tests/agenticChatMutationBatchReview.test.ts
import { describe, expect, it } from 'vitest';
import { canonicalizeAgenticChatJson, type JsonObject } from '@buildos/shared-types';
import {
	buildMutationBatch,
	mutationBatchSha256,
	serializeMutationBatchForReview
} from '@buildos/agentic-chat-runtime/loop';
import { REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION } from '@buildos/agentic-chat-runtime/catalog';
import type { AgenticChatTurnProviderRequestV1 } from '../src/workers/agentic-chat/provider/contracts';
import {
	buildMutationBatchReviewRequest,
	buildMutationBatchRevisionRequest,
	formatMutationBatchForReview
} from '../src/workers/agentic-chat/provider/review/mutation-batch';

const INSPECTION_ID = '95c966a1-74ef-4d9c-953a-104f539232a3';
const ELECTRICAL_ID = '687144d4-165f-4f06-bb63-f417c99f4549';
const LINK_ARGUMENTS = {
	src_kind: 'task',
	src_id: INSPECTION_ID,
	rel: 'depends_on',
	dst_kind: 'task',
	dst_id: ELECTRICAL_ID,
	call_ref: 'inspection-dependency',
	after: ['permit-dependency'],
	props: { note: 'Exact nested value', enabled: false, count: 0, other: null }
};

function batchWith(argumentsValue: JsonObject, name = 'link_onto_entities') {
	return buildMutationBatch([
		{
			id: 'proposed-link',
			name,
			canonicalProviderArguments: canonicalizeAgenticChatJson(argumentsValue)
		}
	]);
}

describe('mutation batch review presentation', () => {
	it('renders source, relation, destination in order without changing any argument or digest', () => {
		const batch = batchWith(LINK_ARGUMENTS);
		const canonicalArguments = batch.calls[0]!.canonicalArguments;
		const digest = mutationBatchSha256(batch);
		Object.freeze(batch.calls[0]);
		Object.freeze(batch.calls);
		Object.freeze(batch);

		const rendered = formatMutationBatchForReview(batch);

		expect(JSON.parse(rendered)).toEqual(serializeMutationBatchForReview(batch));
		expect(Object.keys(JSON.parse(rendered)[0].arguments).slice(0, 5)).toEqual([
			'src_kind',
			'src_id',
			'rel',
			'dst_kind',
			'dst_id'
		]);
		expect(rendered).toContain(`"src_id": "${INSPECTION_ID}"`);
		expect(rendered).toContain(`"dst_id": "${ELECTRICAL_ID}"`);
		expect(rendered).toContain('\n');
		expect(batch.calls[0]!.canonicalArguments).toBe(canonicalArguments);
		expect(mutationBatchSha256(batch)).toBe(digest);
	});

	it('does not silently correct a genuinely reversed dependency', () => {
		const reversed = batchWith({
			...LINK_ARGUMENTS,
			src_id: ELECTRICAL_ID,
			dst_id: INSPECTION_ID
		});
		const rendered = JSON.parse(formatMutationBatchForReview(reversed));
		expect(rendered[0].arguments.src_id).toBe(ELECTRICAL_ID);
		expect(rendered[0].arguments.dst_id).toBe(INSPECTION_ID);
		expect(rendered).toEqual(serializeMutationBatchForReview(reversed));
		expect(mutationBatchSha256(reversed)).not.toBe(
			mutationBatchSha256(batchWith(LINK_ARGUMENTS))
		);
	});

	it('preserves missing, null, extra and non-link arguments exactly', () => {
		for (const batch of [
			batchWith({ src_id: INSPECTION_ID, dst_id: null, extra: ['keep', 0, false] }),
			batchWith({ title: 'Inspection', props: { src_id: 'nested-only' } }, 'create_onto_task')
		]) {
			expect(JSON.parse(formatMutationBatchForReview(batch))).toEqual(
				serializeMutationBatchForReview(batch)
			);
		}
	});

	it('preserves batch ordering and uses the same display for review and rejected evidence', () => {
		const batch = {
			version: 1 as const,
			calls: [
				...batchWith(LINK_ARGUMENTS).calls,
				...batchWith({ title: 'Inspection' }, 'create_onto_task').calls
			]
		};
		const tools = [REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION];
		const request: AgenticChatTurnProviderRequestV1 = {
			messages: [{ role: 'user', content: 'Inspection depends on electrical rough-in.' }],
			tools,
			toolChoice: 'auto',
			userId: 'qa-user',
			sessionId: 'qa-session',
			turnRunId: 'qa-turn',
			streamRunId: 'qa-stream',
			clientTurnId: 'qa-client-turn',
			contextType: 'project',
			entityId: 'qa-project',
			projectId: 'qa-project',
			queueJobId: 'qa-job',
			processingToken: 'qa-processing-token',
			executionGeneration: 1,
			providerRound: 'initial',
			logicalProviderRound: 1,
			signal: new AbortController().signal
		};
		const rendered = formatMutationBatchForReview(batch);
		const digest = mutationBatchSha256(batch);
		const review = buildMutationBatchReviewRequest(request, tools, batch, digest, true, true);
		const revision = buildMutationBatchRevisionRequest(
			request,
			tools,
			{
				reason: 'Check the direction.',
				requiredCorrection: 'Compare both endpoint IDs with the request.',
				correctedContract: null
			},
			batch
		);

		expect(JSON.parse(rendered)).toEqual(serializeMutationBatchForReview(batch));
		expect(review.messages[1]!.content).toContain(rendered);
		expect(review.messages[1]!.content).toContain(`Exact proposed batch SHA-256: ${digest}`);
		expect(review.messages[0]!.content).toContain('Identical values are not a correction.');
		expect(review.messages[0]!.content).toContain(
			'compare document content byte-for-byte with the original user wording'
		);
		expect(review.messages[0]!.content).toContain('HTML entities are not equivalent literals');
		expect(
			revision.messages.some(
				(message) =>
					typeof message.content === 'string' && message.content.includes(rendered)
			)
		).toBe(true);
		expect(mutationBatchSha256(batch)).toBe(digest);
	});
});
