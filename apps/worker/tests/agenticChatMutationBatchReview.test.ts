// apps/worker/tests/agenticChatMutationBatchReview.test.ts
import { describe, expect, it } from 'vitest';
import { canonicalizeAgenticChatJson, type JsonObject } from '@buildos/shared-types';
import {
	buildMutationBatch,
	mutationBatchSha256,
	parseRequestExpectation,
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
	formatMutationBatchForReview,
	tableChecklistNotice
} from '../src/workers/agentic-chat/provider/review/mutation-batch';
import { completeMutationBatchReviewDecision } from '../src/workers/agentic-chat/provider/review/decision-completion';
import {
	appendToolCallDelta,
	createToolCallAccumulator
} from '../src/workers/agentic-chat/provider/stream-tool-calls';

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
		// A correction may legitimately propose nothing (the reviewer struck the
		// only call), so the pass is never forced onto a tool call: forcing it
		// re-proposed an already executed create in the 2026-09-22 gate.
		expect(revision.toolChoice).toBe('auto');
		expect(revision.passRole).toBe('repair');

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

	it.each(['missing', 'malformed', 'shrunk'] as const)(
		'rejects a %s completion checklist before approving writes',
		(mode) => {
			const request = requestFor('Create five tasks.');
			const batch = batchWith(
				{ project_id: PROJECT_ID, title: 'First task' },
				'create_onto_task'
			);
			const sha = mutationBatchSha256(batch);
			const expectation = {
				outcomes: [{ action: 'create', entity_kind: 'task', minimum_successful_effects: 5 }]
			};
			const frozen = mode === 'shrunk' ? parseRequestExpectation(expectation) : null;
			const reviewRequest = buildMutationBatchReviewRequest(
				request,
				request.tools,
				batch,
				sha,
				true,
				true,
				frozen
			);
			const approval = reviewRequest.tools.find(
				(tool) => tool.function.name === 'approve_mutation_batch_review'
			)!;
			if (!frozen)
				expect(approval.function.parameters.required).toContain('request_expectation');
			else {
				// A later approval is not offered the checklist, so the reviewer
				// cannot spend its output re-copying the frozen one (tasker 101).
				expect(approval.function.parameters.properties).not.toHaveProperty(
					'request_expectation'
				);
				expect(approval.function.parameters.required).not.toContain('request_expectation');
			}
			const args: JsonObject = {
				reason: 'Commissioned',
				batch_sha256: sha,
				reference_candidates: []
			};
			if (mode === 'malformed') args.request_expectation = { outcomes: [] };
			if (mode === 'shrunk')
				args.request_expectation = {
					outcomes: [
						{ action: 'create', entity_kind: 'task', minimum_successful_effects: 1 }
					]
				};
			const toolCalls = createToolCallAccumulator();
			appendToolCallDelta(toolCalls, [
				{
					index: 0,
					id: 'approval',
					type: 'function',
					function: {
						name: 'approve_mutation_batch_review',
						arguments: JSON.stringify(args)
					}
				}
			]);
			expect(() =>
				completeMutationBatchReviewDecision({
					actingRequest: request,
					reviewRequest,
					batch,
					batchSha256: sha,
					toolCalls,
					finished: true,
					finishedReason: 'tool_calls',
					fallbackReason: null,
					allowRevision: true,
					requestExpectation: frozen
				})
			).toThrow('Independent change verification failed');
		}
	);

	it('preserves every requested field when the first approved stage only updates some of them', () => {
		const PLAN_A = '39f201a1-c209-47d0-999d-6400b242cb90';
		const PLAN_B = '4698bf3f-5bbc-4bd2-8315-2d37e804e9e8';
		const request = requestFor('Fix the project so it fits a nonfiction book.');
		const batch = buildMutationBatch([
			{
				id: 'plan-a',
				name: 'update_onto_plan',
				canonicalProviderArguments: canonicalizeAgenticChatJson({
					plan_id: PLAN_A,
					name: 'Phase 2: Chapter & Framework Blueprint',
					description: 'Map the frameworks.'
				})
			},
			{
				id: 'plan-b',
				name: 'update_onto_plan',
				canonicalProviderArguments: canonicalizeAgenticChatJson({
					plan_id: PLAN_B,
					description: 'Clarity and usefulness feedback.'
				})
			}
		]);
		const sha = mutationBatchSha256(batch);
		const reviewRequest = buildMutationBatchReviewRequest(
			request,
			request.tools,
			batch,
			sha,
			true,
			true,
			null
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
						reason: 'Covers every plan.',
						batch_sha256: sha,
						reference_candidates: [],
						request_expectation: {
							outcomes: [
								{
									id: 'plans',
									action: 'update',
									entity_kind: 'plan',
									target_ids: [PLAN_A, PLAN_B],
									required_fields: ['name', 'description'],
									minimum_successful_effects: 2
								}
							]
						}
					})
				}
			}
		]);
		const [approved] = completeMutationBatchReviewDecision({
			actingRequest: request,
			reviewRequest,
			batch,
			batchSha256: sha,
			toolCalls,
			finished: true,
			finishedReason: 'tool_calls',
			fallbackReason: null,
			allowRevision: true,
			requestExpectation: null
		});
		const frozen = parseRequestExpectation(approved!.arguments.request_expectation)!;
		expect(frozen.outcomes[0]!.requiredFields).toEqual(['name', 'description']);
		expect(JSON.parse(approved!.canonicalArguments).request_expectation).toEqual(
			approved!.arguments.request_expectation
		);
	});

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

describe('table checklist vocabulary reaches the reviewer only for table writes', () => {
	it('names the provable table fields when the batch writes a table', () => {
		const notice = tableChecklistNotice(
			batchWith(
				{
					table_id: INSPECTION_ID,
					update: [{ row: 'r1', values: { 'Salary range': '$1' } }]
				},
				'update_onto_table_rows'
			)
		);
		expect(notice).toContain('columns');
		expect(notice).toContain('rows');
		expect(notice).toContain('cells');
		expect(notice).toContain('salary_range');
	});

	it('adds nothing to batches without a table write', () => {
		expect(tableChecklistNotice(batchWith(LINK_ARGUMENTS))).toBeNull();
	});
});

/**
 * Stage rule (pipeline audit 2026-10-17, S5 cause b). A batch revision is for
 * a defect IN a held call. Prod bounced correct partial stages twice: 09-26 and
 * 09-29 revisions whose only correction was "add the omitted, already
 * executable creates", and the 10-17 battery's cedar-02 revision whose reason
 * and correction both said the held links were right. Each cost an actor
 * repair and a second review. The rule now reaches the reviewer in its prompt
 * and in a structured `defective_calls` field, and a first revision that names
 * no held call is rechecked once. Nothing here reads the reviewer's prose.
 */
describe('stage rule: a revision must name a defective held call', () => {
	const PROJECT_ID = '3f6d8f10-3f0f-4c7e-9a8e-6a2d9b9d0c11';
	const TITLES = ['Permit', 'Cabinets', 'Rough-in', 'Inspection'];

	function stage() {
		return buildMutationBatch(
			TITLES.map((title, index) => ({
				id: `create-${index + 1}`,
				name: 'create_onto_task',
				canonicalProviderArguments: canonicalizeAgenticChatJson({
					project_id: PROJECT_ID,
					title
				})
			}))
		);
	}

	function actingRequest(): AgenticChatTurnProviderRequestV1 {
		return {
			messages: [
				{
					role: 'user',
					content:
						'Create seven tasks: Permit, Cabinets, Rough-in, Inspection, Drywall, Paint, Punch list.'
				}
			],
			tools: [
				REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION,
				...ONTOLOGY_WRITE_TOOLS.filter((tool) => tool.function.name === 'create_onto_task')
			],
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

	function decide(revision: JsonObject, recheckRevision = true) {
		const request = actingRequest();
		const batch = stage();
		const sha = mutationBatchSha256(batch);
		const toolCalls = createToolCallAccumulator();
		appendToolCallDelta(toolCalls, [
			{
				index: 0,
				id: 'reviewer-revision',
				type: 'function',
				function: { name: 'request_proposal_revision', arguments: JSON.stringify(revision) }
			}
		]);
		try {
			const [call] = completeMutationBatchReviewDecision({
				actingRequest: request,
				reviewRequest: buildMutationBatchReviewRequest(
					request,
					request.tools,
					batch,
					sha,
					true,
					true
				),
				batch,
				batchSha256: sha,
				toolCalls,
				finished: true,
				finishedReason: 'tool_calls',
				fallbackReason: null,
				allowRevision: true,
				recheckRevision
			});
			return { accepted: call!.name, code: null };
		} catch (error) {
			return {
				accepted: null,
				code: (error as { diagnostic?: { code?: string } }).diagnostic?.code ?? 'unknown'
			};
		}
	}

	// 2026-09-26 / 09-29 shape: the stage was right; the "defect" was omitted work.
	const OMISSION_REVISION: JsonObject = {
		reason: 'The batch creates four of the seven commissioned tasks; Drywall, Paint, and Punch list are missing although they are already executable.',
		required_correction: 'Add create_onto_task calls for Drywall, Paint, and Punch list.',
		findings: [
			{
				code: 'other',
				target_ids: [],
				message: 'Drywall, Paint, and Punch list are not in this batch.',
				required_correction: 'Add the three missing creates.'
			}
		],
		defective_calls: [],
		reference_candidates: []
	};
	// 2026-10-17 battery cedar-02 shape: the revision itself says the held calls are right.
	const CONTRADICTORY_REVISION: JsonObject = {
		reason: 'The four held creates are correct, but the stage leaves out the remaining tasks.',
		required_correction: 'Keep the four creates unchanged and add the remaining three tasks.',
		defective_calls: [],
		reference_candidates: []
	};

	it('rechecks an omission-only revision once instead of bouncing a correct stage', () => {
		expect(decide(OMISSION_REVISION)).toEqual({
			accepted: null,
			code: 'revision_without_defective_call'
		});
		expect(decide(CONTRADICTORY_REVISION)).toEqual({
			accepted: null,
			code: 'revision_without_defective_call'
		});
	});

	it('sends a revision whose finding names a specific defect straight to the acting model', () => {
		for (const code of ['missing_prerequisite', 'publication_effect', 'wrong_value'] as const) {
			expect(
				decide({
					...CONTRADICTORY_REVISION,
					findings: [
						{
							code,
							target_ids: [],
							message: 'Inspection needs the permit first.',
							required_correction: 'Create the permit task first.'
						}
					]
				})
			).toEqual({ accepted: 'request_proposal_revision', code: null });
		}
	});

	it('accepts the recheck answer as given, so the rule can cost a review pass but never a turn', () => {
		expect(decide(OMISSION_REVISION, false)).toEqual({
			accepted: 'request_proposal_revision',
			code: null
		});
	});

	it('sends a revision that names a wrong held call straight to the acting model', () => {
		expect(
			decide({
				reason: 'The fourth task is not one the user named.',
				required_correction: 'Replace the Inspection create with Punch list.',
				defective_calls: [4],
				reference_candidates: []
			})
		).toEqual({ accepted: 'request_proposal_revision', code: null });
	});

	it('refuses a defective call outside the held stage, and unreadable findings', () => {
		expect(decide({ ...CONTRADICTORY_REVISION, defective_calls: [5] }).code).toBe(
			'revision_without_defective_call'
		);
		expect(decide({ ...CONTRADICTORY_REVISION, defective_calls: ['4'] }).code).toBe(
			'revision_without_defective_call'
		);
		expect(
			decide({
				...CONTRADICTORY_REVISION,
				defective_calls: [4],
				findings: [
					{ code: 'missing_work', target_ids: [], message: 'x', required_correction: 'y' }
				]
			}).code
		).toBe('revision_findings_invalid');
	});

	it('leaves a reviewer that predates defective_calls unchecked', () => {
		const { defective_calls: _omitted, ...legacy } = OMISSION_REVISION;
		expect(decide(legacy)).toEqual({ accepted: 'request_proposal_revision', code: null });
	});

	it('puts the rule in the reviewer prompt and the revision schema', () => {
		const request = actingRequest();
		const batch = stage();
		const review = buildMutationBatchReviewRequest(
			request,
			request.tools,
			batch,
			mutationBatchSha256(batch),
			true,
			true
		);
		const system = String(review.messages[0]?.content);
		expect(system).toContain('stages of at most 8 mutations');
		expect(system).toContain('Never request a revision whose correction only adds calls.');
		expect(system).toContain(
			'If you cannot name a held call that is wrong, the stage is correct'
		);
		const revisionTool = review.tools.find(
			(tool) => tool.function.name === 'request_proposal_revision'
		)!;
		expect(revisionTool.function.parameters.required).toContain('defective_calls');
		expect(revisionTool.function.description).toContain(
			'Never use this to add omitted commissioned work'
		);
	});
});

describe('actor repair after a batch revision', () => {
	const PROJECT_ID = '3f6d8f10-3f0f-4c7e-9a8e-6a2d9b9d0c11';
	const createTask = ONTOLOGY_WRITE_TOOLS.find(
		(tool) => tool.function.name === 'create_onto_task'
	)!;
	const updateTask = ONTOLOGY_WRITE_TOOLS.find(
		(tool) => tool.function.name === 'update_onto_task'
	)!;
	const batch = buildMutationBatch(
		['Permit', 'Inspection'].map((title, index) => ({
			id: `create-${index + 1}`,
			name: 'create_onto_task',
			canonicalProviderArguments: canonicalizeAgenticChatJson({
				project_id: PROJECT_ID,
				title
			})
		}))
	);

	function request(
		tools: AgenticChatTurnProviderRequestV1['tools'],
		overrides: Partial<AgenticChatTurnProviderRequestV1> = {}
	): AgenticChatTurnProviderRequestV1 {
		return {
			messages: [{ role: 'user', content: 'Add Permit and Punch list tasks.' }],
			tools,
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
			providerRound: 'synthesis',
			logicalProviderRound: 2,
			signal: new AbortController().signal,
			...overrides
		};
	}

	const revision = {
		reason: 'The second task is not one the user named.',
		requiredCorrection: 'Create Punch list instead of Inspection.',
		correctedContract: null,
		defectiveCalls: [2],
		findings: [
			{
				code: 'wrong_value' as const,
				target_ids: [],
				message: 'Inspection is not one of the requested tasks.',
				required_correction: 'Use the title Punch list.'
			}
		]
	};
	const admitted = [REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION, createTask, updateTask];

	it('keeps the narrower acting surface when it carries every held tool (prompt cache)', () => {
		const narrowed = [REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION, createTask];
		const repair = buildMutationBatchRevisionRequest(
			request(narrowed),
			admitted,
			revision,
			batch
		);
		expect(repair.tools.map((tool) => tool.function.name)).toEqual([
			'request_turn_clarification',
			'create_onto_task'
		]);
		const instruction = String(repair.messages.at(-1)?.content);
		expect(instruction).toContain('Held calls the review found wrong: 2 (create_onto_task).');
		expect(instruction).toContain('"code":"wrong_value"');
		expect(instruction).toContain('make no tool call and answer the request');
	});

	it('falls back to the admitted surface when the pass lacked a held tool or the surface repair is spent', () => {
		const withoutCreate = buildMutationBatchRevisionRequest(
			request([REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION, updateTask]),
			admitted,
			revision,
			batch
		);
		expect(withoutCreate.tools).toBe(admitted);
		const spent = buildMutationBatchRevisionRequest(
			request([REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION, createTask], {
				unavailableSkillRepairAttempted: true
			}),
			admitted,
			revision,
			batch
		);
		expect(spent.tools).toBe(admitted);
	});

	it('never widens past the admitted surface', () => {
		const repair = buildMutationBatchRevisionRequest(
			request([createTask, updateTask]),
			[REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION, createTask],
			{ ...revision, defectiveCalls: undefined, findings: undefined },
			batch
		);
		expect(repair.tools.map((tool) => tool.function.name)).toEqual([
			'request_turn_clarification',
			'create_onto_task'
		]);
		expect(String(repair.messages.at(-1)?.content)).not.toContain('Held calls the review');
	});
});
