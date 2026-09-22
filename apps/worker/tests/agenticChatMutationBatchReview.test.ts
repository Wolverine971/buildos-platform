// apps/worker/tests/agenticChatMutationBatchReview.test.ts
import { describe, expect, it } from 'vitest';
import { canonicalizeAgenticChatJson, type JsonObject } from '@buildos/shared-types';
import {
	buildMutationBatch,
	mutationBatchSha256,
	serializeMutationBatchForReview
} from '@buildos/agentic-chat-runtime/loop';
import {
	ONTOLOGY_WRITE_TOOLS,
	REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION
} from '@buildos/agentic-chat-runtime/catalog';
import { SEMANTIC_COMMISSION_GUIDANCE } from '../src/workers/agentic-chat/provider/review/controls';
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

/**
 * Tasker 92 slice B. Case 2 of the 2026-09-21 gate: the reviewer revised five
 * task creates over unrequested `type_key` values ("optional fields should not
 * be invented") while the schema said "omit when unsure", costing a repair and
 * a second review. One policy now reaches the reviewer twice — in the proposed
 * tool's schema and in the commission rules — for each of the three cases.
 * These fixtures pin prompt content, not model behavior.
 */
describe('work-type classification policy reaches the reviewer', () => {
	const CREATE_POLICY = 'Set it only when the user states or clearly implies the work mode';
	const UPDATE_POLICY = 'Include it only when the user asks to reclassify the task';
	const REVIEWER_POLICY = SEMANTIC_COMMISSION_GUIDANCE.find((line) =>
		line.startsWith('An unstated optional classification')
	);
	const PROJECT_ID = '3f6d8f10-3f0f-4c7e-9a8e-6a2d9b9d0c11';
	const TASK_ID = '9b1a2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';

	function taskTools() {
		return ONTOLOGY_WRITE_TOOLS.filter((tool) =>
			['create_onto_task', 'update_onto_task'].includes(tool.function.name)
		);
	}

	function requestFor(userMessage: string): AgenticChatTurnProviderRequestV1 {
		return {
			messages: [{ role: 'user', content: userMessage }],
			tools: [REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION, ...taskTools()],
			toolChoice: 'auto',
			userId: 'qa-user',
			sessionId: 'qa-session',
			turnRunId: 'qa-turn',
			streamRunId: 'qa-stream',
			clientTurnId: 'qa-client-turn',
			contextType: 'project',
			entityId: PROJECT_ID,
			projectId: PROJECT_ID,
			queueJobId: 'qa-job',
			processingToken: 'qa-processing-token',
			executionGeneration: 1,
			providerRound: 'initial',
			logicalProviderRound: 1,
			signal: new AbortController().signal
		};
	}

	function reviewFor(userMessage: string, batch: ReturnType<typeof batchWith>) {
		const request = requestFor(userMessage);
		const review = buildMutationBatchReviewRequest(
			request,
			request.tools,
			batch,
			mutationBatchSha256(batch),
			true,
			true
		);
		return {
			system: String(review.messages[0]?.content),
			user: String(review.messages[1]?.content)
		};
	}

	it('declares the reviewer rule once: approve either way on creates, uncommissioned on updates', () => {
		expect(REVIEWER_POLICY).toBeDefined();
		expect(REVIEWER_POLICY).toContain('approve it omitted or plausibly set');
		expect(REVIEWER_POLICY).toContain('revise only a contradiction of a stated one');
		expect(REVIEWER_POLICY).toContain('Reclassifying an entity unasked is uncommissioned');
	});

	it('ordinary unclassified creation: schema says omit, reviewer says approve', () => {
		const batch = batchWith(
			{
				project_id: PROJECT_ID,
				title: 'QA — Confirm permit requirements',
				due_at: '2026-09-15'
			},
			'create_onto_task'
		);
		const { system, user } = reviewFor(
			'Create the task "QA — Confirm permit requirements" due September 15.',
			batch
		);
		expect(user).toContain(CREATE_POLICY);
		expect(user).toContain('otherwise omit it and the tool stores task.default');
		expect(user).not.toContain('Omit when unsure');
		expect(system).toContain(REVIEWER_POLICY!);
	});

	it('explicit classification: the user-stated work mode is honored, and the reviewer revises only a contradiction', () => {
		const batch = batchWith(
			{
				project_id: PROJECT_ID,
				title: 'Kickoff with the electrician',
				type_key: 'task.coordinate.meeting'
			},
			'create_onto_task'
		);
		const { system, user } = reviewFor(
			'Add a meeting task: kickoff with the electrician.',
			batch
		);
		expect(user).toContain('"type_key": "task.coordinate.meeting"');
		expect(user).toContain('a meeting is task.coordinate.meeting');
		expect(system).toContain('revise only a contradiction of a stated one');
	});

	it('unsupported addition: reclassifying an existing task the user did not ask about stays revisable', () => {
		const batch = batchWith(
			{ task_id: TASK_ID, state_key: 'done', type_key: 'task.review' },
			'update_onto_task'
		);
		const { system, user } = reviewFor('I finished the electrical rough-in.', batch);
		expect(user).toContain(UPDATE_POLICY);
		expect(system).toContain('Reclassifying an entity unasked is uncommissioned');
		expect(system).toContain(
			'A priority, scheduling, or completion instruction commissions only that change.'
		);
	});
});
