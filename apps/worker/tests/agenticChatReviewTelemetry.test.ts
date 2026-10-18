// apps/worker/tests/agenticChatReviewTelemetry.test.ts
//
// Pipeline audit 2026-10-17: the content-free review-decision receipt (M5),
// the per-turn write-commission shadow log (S5), and the worker's Rules for
// This Turn pick (Q1). Every value here comes from structured fields: tool
// names, enum codes, numbers, and Jev's probabilities. No prose is read.
import { describe, expect, it, vi } from 'vitest';
import type { JsonObject } from '@buildos/shared-types';
import type { AgenticChatExecutionObservationPortV1 } from '../src/workers/agentic-chat/effects/execution-observation';
import { AGENTIC_CHAT_PENDING_EFFECTS_REGISTRY } from '../src/workers/agentic-chat/effects/pending-effects';
import { reviewedAgenticChatMutationSpecV1 } from '../src/workers/agentic-chat/mutations/tool-catalog';
import type { AgenticChatTurnProviderRequestV1 } from '../src/workers/agentic-chat/provider/contracts';
import {
	TurnWriteCommissionLedger,
	buildReviewDecisionPayload,
	enqueueReviewTelemetryObservation,
	reviewOutcomeOf
} from '../src/workers/agentic-chat/provider/review/review-telemetry';
import {
	OPERATIONAL_PLAYBOOK_WRITE_TOOLS,
	type OperationalPlaybookCandidate,
	appendTurnRules,
	readTurnRulesInput,
	renderOperationalPlaybook,
	selectOperationalPlaybook
} from '../src/workers/agentic-chat/provider/turn-rules';
// Installs the worker's loop catalog (reviewed reads + mutation identities).
import '../src/workers/agentic-chat/provider/tool-surface';

const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';

describe('review decision receipt', () => {
	const prose = 'The user asked for seven tasks and this batch omits Drywall.';

	it('keeps codes, numbers and tool names, never reviewer prose', () => {
		const payload = buildReviewDecisionPayload({
			lane: 'mutation_batch',
			logicalProviderRound: 3,
			attempt: 1,
			outcome: 'invalid',
			rejectionCode: 'revision_without_defective_call',
			decisionToolName: 'request_proposal_revision',
			decisionArguments: {
				reason: prose,
				required_correction: 'Add the Drywall create.',
				defective_calls: [2, 2, 41],
				findings: [
					{
						code: 'wrong_value',
						target_ids: [],
						message: prose,
						required_correction: 'Use the requested title.'
					}
				],
				argument_checks: [{ call: 1, argument_path: ['title'], required_value: 'Drywall' }]
			},
			stageToolNames: ['create_onto_task', 'create_onto_task', 'link_onto_entities'],
			priorRevisions: 1,
			readOnlyOffered: true,
			durationMs: 2140.6
		});
		expect(payload).toEqual({
			logical_provider_round: 3,
			review_lane: 'mutation_batch',
			review_attempt: 1,
			review_outcome: 'invalid',
			review_decision_tool: 'request_proposal_revision',
			review_rejection_code: 'revision_without_defective_call',
			review_finding_codes: ['wrong_value'],
			// Deduped; a call number past the 40-call schema bound is dropped.
			review_defective_calls: [2],
			review_argument_check_count: 1,
			review_stage_call_count: 3,
			review_stage_tools: ['create_onto_task', 'link_onto_entities'],
			review_prior_revisions: 1,
			review_read_only_offered: true,
			duration_ms: 2141
		});
		expect(JSON.stringify(payload)).not.toContain('Drywall');
	});

	it('reads findings and defective calls only from a revision', () => {
		const revision = buildReviewDecisionPayload({
			lane: 'mutation_batch',
			logicalProviderRound: 2,
			attempt: 2,
			outcome: 'revision_requested',
			rejectionCode: null,
			decisionToolName: 'request_proposal_revision',
			decisionArguments: { defective_calls: [4, 1] },
			stageToolNames: ['update_onto_task'],
			priorRevisions: 0,
			readOnlyOffered: false,
			durationMs: 5
		});
		expect(revision.review_defective_calls).toEqual([4, 1]);
		const approval = buildReviewDecisionPayload({
			lane: 'turn_contract',
			logicalProviderRound: 1,
			attempt: 7,
			outcome: reviewOutcomeOf('approve_turn_contract_review'),
			rejectionCode: 'Not A Code',
			decisionToolName: 'approve_turn_contract_review',
			decisionArguments: { defective_calls: [1], findings: [] },
			stageToolNames: [],
			priorRevisions: 0,
			readOnlyOffered: false,
			durationMs: -3
		});
		expect(approval).toMatchObject({
			review_outcome: 'approved',
			review_attempt: 2,
			review_rejection_code: null,
			review_defective_calls: [],
			review_finding_codes: [],
			duration_ms: 0
		});
	});

	it('maps each control tool to its outcome', () => {
		expect(reviewOutcomeOf('approve_mutation_batch_review')).toBe('approved');
		expect(reviewOutcomeOf('request_proposal_revision')).toBe('revision_requested');
		expect(reviewOutcomeOf('declare_read_only_turn')).toBe('read_only');
		expect(reviewOutcomeOf('request_turn_clarification')).toBe('clarification');
		expect(reviewOutcomeOf('update_onto_task')).toBe('invalid');
		expect(reviewOutcomeOf(null)).toBe('invalid');
	});
});

describe('write-commission shadow log', () => {
	function selected(
		overrides: Partial<AgenticChatTurnProviderRequestV1> = {}
	): Pick<
		AgenticChatTurnProviderRequestV1,
		'toolSelectionOutcome' | 'commissionedWriteToolNames' | 'heldWriteToolNames'
	> {
		return {
			toolSelectionOutcome: { status: 'selected', writeCommission: 0.82, holdEnabled: false },
			commissionedWriteToolNames: ['create_onto_task'],
			...overrides
		};
	}

	it('counts only reviewed writes as proposed writes; proposal cards and reads are not writes', () => {
		const ledger = new TurnWriteCommissionLedger();
		ledger.recordSelection(selected());
		ledger.recordProposedCalls([
			{ name: 'create_onto_task' },
			{ name: 'create_onto_task' },
			{ name: 'get_project_overview' },
			{ name: 'propose_project_parent' },
			{ name: 'update_onto_task' }
		]);
		ledger.recordReviewOutcome('revision_requested');
		ledger.recordReviewOutcome('approved');
		ledger.recordTurnRulesPlaybook('task_management');
		expect(ledger.takePayload({ awaitingUserCard: false, finishedReason: 'stop' })).toEqual({
			jev_status: 'selected',
			jev_write_commission: 0.82,
			jev_commissioned_write_tools: ['create_onto_task'],
			proposed_write_tools: ['create_onto_task', 'update_onto_task'],
			proposed_write_call_count: 3,
			review_outcomes: ['revision_requested', 'approved'],
			awaiting_user_card: false,
			writes_held: false,
			hold_enabled: false,
			turn_rules_playbook: 'task_management',
			finished_reason: 'stop'
		});
	});

	it('writes one receipt per execution, bounded and typed', () => {
		const ledger = new TurnWriteCommissionLedger();
		ledger.recordSelection(
			selected({
				toolSelectionOutcome: {
					status: 'selected',
					writeCommission: 1.7,
					holdEnabled: true
				},
				commissionedWriteToolNames: undefined,
				heldWriteToolNames: ['update_onto_task', 'Not A Tool']
			})
		);
		for (let i = 0; i < 30; i += 1) ledger.recordReviewOutcome('invalid');
		ledger.recordTurnRulesPlaybook('Task Management!');
		const payload = ledger.takePayload({
			awaitingUserCard: true,
			finishedReason: 'The model stopped.'
		})!;
		expect(payload).toMatchObject({
			jev_write_commission: 1,
			jev_commissioned_write_tools: [],
			writes_held: true,
			hold_enabled: true,
			awaiting_user_card: true,
			turn_rules_playbook: null,
			finished_reason: null
		});
		expect(payload.review_outcomes).toHaveLength(24);
		expect(ledger.takePayload({ awaitingUserCard: true, finishedReason: 'stop' })).toBeNull();
	});

	it('reports a turn without a selector as absent', () => {
		const ledger = new TurnWriteCommissionLedger();
		ledger.recordSelection({});
		expect(
			ledger.takePayload({ awaitingUserCard: false, finishedReason: 'provider_error' })
		).toMatchObject({ jev_status: 'absent', jev_write_commission: null });
	});
});

describe('observation writes never touch the turn', () => {
	const identity = {
		turnRunId: TURN_RUN_ID,
		queueJobId: '40000000-0000-4000-8000-000000000004',
		processingToken: '90000000-0000-4000-8000-000000000009',
		userId: '10000000-0000-4000-8000-000000000001',
		executionGeneration: 1
	};

	it('detaches the write into the turn pending effects with a stable key', async () => {
		const observe = vi.fn<AgenticChatExecutionObservationPortV1['observe']>(
			async () => undefined
		);
		const before = AGENTIC_CHAT_PENDING_EFFECTS_REGISTRY.size(TURN_RUN_ID);
		enqueueReviewTelemetryObservation(
			{ observe },
			identity,
			'provider_review_decided',
			'review:mutation_batch:3:1',
			{ review_outcome: 'approved' }
		);
		enqueueReviewTelemetryObservation(
			{ observe },
			identity,
			'provider_review_decided',
			'review:mutation_batch:3:1',
			{ review_outcome: 'approved' }
		);
		expect(observe).toHaveBeenCalledTimes(2);
		const [first] = observe.mock.calls[0]!;
		const [second] = observe.mock.calls[1]!;
		expect(first.observationKey).toMatch(/^[0-9a-f]{64}$/);
		expect(first.observationKey).toBe(second.observationKey);
		expect(first).toMatchObject({ phase: 'provider', eventType: 'provider_review_decided' });
		expect(AGENTIC_CHAT_PENDING_EFFECTS_REGISTRY.size(TURN_RUN_ID)).toBeGreaterThanOrEqual(
			before
		);
		await AGENTIC_CHAT_PENDING_EFFECTS_REGISTRY.forTurn(TURN_RUN_ID).drain(1_000);
	});

	it('swallows a refused write and a throwing port (the migration may not be applied yet)', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const rejecting: AgenticChatExecutionObservationPortV1 = {
			observe: async () => {
				throw Object.assign(new Error('event type refused'), { code: '23514' });
			}
		};
		const throwing: AgenticChatExecutionObservationPortV1 = {
			observe: () => {
				throw new Error('sync failure');
			}
		};
		expect(() =>
			enqueueReviewTelemetryObservation(
				rejecting,
				identity,
				'provider_commission_observed',
				'commission:turn',
				{}
			)
		).not.toThrow();
		expect(() =>
			enqueueReviewTelemetryObservation(
				throwing,
				identity,
				'provider_commission_observed',
				'commission:turn',
				{}
			)
		).not.toThrow();
		expect(() =>
			enqueueReviewTelemetryObservation(
				undefined,
				identity,
				'provider_commission_observed',
				'commission:turn',
				{}
			)
		).not.toThrow();
		await expect(
			AGENTIC_CHAT_PENDING_EFFECTS_REGISTRY.forTurn(TURN_RUN_ID).drain(1_000)
		).resolves.toBe(true);
		warn.mockRestore();
	});
});

describe('Rules for This Turn on the worker', () => {
	const TASK: OperationalPlaybookCandidate = {
		skillId: 'task_management',
		content: 'Playbook for task writes this turn:',
		examples: { update: '- Update by id', create: '- Create a follow-up' }
	};
	const PLAN: OperationalPlaybookCandidate = {
		skillId: 'plan_management',
		content: 'Playbook for plan writes this turn:',
		examples: { create: '- Create a plan' }
	};
	const DOCS: OperationalPlaybookCandidate = {
		skillId: 'document_workspace',
		content: 'Playbook for document writes this turn:',
		examples: { update: '- Update a doc', organize: '- Organize unlinked docs' }
	};

	it('names only reviewed write tools in the static table', () => {
		for (const [skillId, tools] of Object.entries(OPERATIONAL_PLAYBOOK_WRITE_TOOLS)) {
			for (const tool of tools) {
				expect(
					reviewedAgenticChatMutationSpecV1(tool),
					`${skillId}: ${tool}`
				).not.toBeNull();
			}
		}
	});

	it('picks the most specific playbook the commission names, with its worked example', () => {
		const candidates = [TASK, PLAN, DOCS];
		expect(selectOperationalPlaybook([], candidates)).toBeNull();
		expect(selectOperationalPlaybook(['update_onto_task'], candidates)).toEqual({
			candidate: TASK,
			hint: 'update'
		});
		expect(
			selectOperationalPlaybook(['create_onto_task', 'create_onto_goal'], candidates)
		).toEqual({ candidate: PLAN, hint: 'create' });
		expect(
			selectOperationalPlaybook(['move_document_in_tree', 'create_onto_task'], candidates)
		).toEqual({ candidate: DOCS, hint: 'organize' });
		// A family with no shipped candidate falls through to the next one, and
		// its example follows that family's tools only.
		expect(selectOperationalPlaybook(['create_onto_plan', 'update_onto_task'], [TASK])).toEqual(
			{ candidate: TASK, hint: 'update' }
		);
		// A task create beside a document update must not show the docs create example.
		expect(
			selectOperationalPlaybook(['update_onto_document', 'create_onto_task'], candidates)
		).toEqual({ candidate: DOCS, hint: 'update' });
		expect(selectOperationalPlaybook(['create_calendar_event'], candidates)).toBeNull();
	});

	it('renders the hinted example and falls back to update', () => {
		expect(renderOperationalPlaybook(TASK, 'create')).toBe(
			'Playbook for task writes this turn:\n\nWorked example:\n- Create a follow-up'
		);
		expect(renderOperationalPlaybook(TASK, 'organize')).toContain('- Update by id');
		expect(renderOperationalPlaybook({ ...TASK, examples: {} }, 'create')).toBe(TASK.content);
	});

	function artifactWith(promptSections: unknown[]) {
		return {
			artifact: { prepared: { promptSections } }
		} as unknown as Parameters<typeof readTurnRulesInput>[0];
	}

	it('reads only marked rules and known, distinct candidates', () => {
		const input = readTurnRulesInput(
			artifactWith([
				// A legacy in-prompt rules section (no placement) is already in the prompt.
				{ id: 'situational_rules', content: 'legacy rules', slots: {} },
				{
					id: 'operational_playbook_candidate',
					content: 'x',
					slots: { skillId: 'cold_email' }
				},
				{
					id: 'operational_playbook_candidate',
					content: TASK.content,
					slots: {
						skillId: 'task_management',
						examples: { create: TASK.examples.create, rewrite: 'no' }
					}
				},
				{
					id: 'operational_playbook_candidate',
					content: 'dup',
					slots: { skillId: 'task_management' }
				},
				{
					id: 'operational_playbook_candidate',
					content: '  ',
					slots: { skillId: 'plan_management' }
				},
				'not a section'
			])
		);
		expect(input).toEqual({
			rules: null,
			candidates: [
				{
					skillId: 'task_management',
					content: TASK.content,
					examples: { create: TASK.examples.create }
				}
			]
		});
	});

	function request(): AgenticChatTurnProviderRequestV1 {
		return {
			messages: [
				{ role: 'system', content: 'System prompt' },
				{ role: 'user', content: 'Add a follow-up to call the roofer.' }
			],
			tools: [],
			toolChoice: 'auto',
			userId: 'user-1',
			sessionId: 'session-1',
			turnRunId: TURN_RUN_ID,
			streamRunId: 'stream-1',
			clientTurnId: 'client-1',
			contextType: 'project',
			entityId: 'project-1',
			projectId: 'project-1',
			queueJobId: 'job-1',
			processingToken: 'token-1',
			executionGeneration: 1,
			providerRound: 'initial',
			logicalProviderRound: 1,
			signal: new AbortController().signal
		};
	}

	it('leaves an artifact without turn rules untouched (older web deploys)', () => {
		const base = request();
		expect(appendTurnRules(base, artifactWith([]))).toEqual({
			request: base,
			playbookSkillId: null
		});
		expect(
			appendTurnRules(
				{ ...base, commissionedWriteToolNames: ['create_onto_task'] },
				artifactWith([])
			).playbookSkillId
		).toBeNull();
	});

	it('appends one block after the user message: admission rules, then the playbook', () => {
		const sections: JsonObject[] = [
			{
				id: 'situational_rules',
				content: 'Table rules.',
				slots: { placement: 'after_user_message' }
			},
			{
				id: 'operational_playbook_candidate',
				content: TASK.content,
				slots: { skillId: 'task_management', examples: TASK.examples }
			}
		];
		const { request: appended, playbookSkillId } = appendTurnRules(
			{ ...request(), commissionedWriteToolNames: ['create_onto_task'] },
			artifactWith(sections)
		);
		expect(playbookSkillId).toBe('task_management');
		expect(appended.messages[0]).toEqual({ role: 'system', content: 'System prompt' });
		expect(appended.messages.at(-1)).toEqual({
			role: 'system',
			content:
				'## Rules for This Turn\n\nTable rules.\n\nPlaybook for task writes this turn:\n\nWorked example:\n- Create a follow-up'
		});
	});
});
