// apps/web/src/lib/services/admin/chat-workflow-audit-build.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildChatWorkflowAuditPayload,
	emptyWorkflowTableCoverage,
	redactControlSecrets
} from './chat-workflow-audit-build';
import type { WorkflowAuditRowSet } from './chat-workflow-audit-types';

const T = (offsetSeconds: number) =>
	new Date(Date.UTC(2026, 8, 20, 12, 0, offsetSeconds)).toISOString();
const HASH = (seed: string) => seed.repeat(64).slice(0, 64);
const RUN_A = '11111111-1111-4111-8111-111111111111';
const RUN_B = '22222222-2222-4222-8222-222222222222';
const RUN_C = '33333333-3333-4333-8333-333333333333';

const V1_PLAN_STEPS = [
	{ key: 'planner', capability: 'plan_review', dependsOn: [] },
	{ key: 'project_analyst', capability: 'project_analysis', dependsOn: ['planner'] },
	{ key: 'risk_reviewer', capability: 'risk_and_alternatives', dependsOn: ['planner'] },
	{
		key: 'editor',
		capability: 'synthesize_review',
		dependsOn: ['project_analyst', 'risk_reviewer']
	}
];
const EVIDENCE_PLAN_STEPS = [
	V1_PLAN_STEPS[0],
	V1_PLAN_STEPS[1],
	{
		key: 'risk_reviewer',
		capability: 'risk_and_alternatives',
		dependsOn: ['planner', 'project_analyst']
	},
	V1_PLAN_STEPS[3]
];

const progressEvent = (
	index: number,
	at: string,
	statuses: Record<string, string>,
	extra: Record<string, unknown> = {}
) => ({
	id: `evt-${index}`,
	sequence_index: index,
	event_type: 'workflow_progress',
	created_at: at,
	execution_generation: (extra.generation as number | undefined) ?? 1,
	payload: {
		type: 'workflow_progress',
		workflow: {
			phase: extra.phase ?? 'executing',
			terminalOutcome: extra.terminalOutcome ?? null,
			coverageGap: extra.coverageGap ?? null,
			steps: Object.entries(statuses).map(([key, status]) => ({
				key,
				status,
				label:
					key === 'planner'
						? 'Plan the review'
						: key === 'project_analyst'
							? 'Project analyst'
							: key === 'risk_reviewer'
								? 'Risk reviewer'
								: 'Combine recommendations'
			})),
			transport: { executionState: extra.executionState ?? 'active' }
		}
	}
});

/** Fixture A: the frozen v1 parallel review, complete, with a retry, a fallback, and an uncertain dispatch. */
const parallelReviewRows = (): WorkflowAuditRowSet => ({
	tables: emptyWorkflowTableCoverage(),
	runs: [
		{
			turn_run_id: RUN_A,
			session_id: 'session-1',
			user_id: 'user-1',
			request_artifact_id: 'artifact-a',
			project_id: 'project-1',
			workflow_version: 'agentic_chat_workflow_v1',
			policy_ref: 'internal-project-review:v1',
			policy: { version: 'v1', settlementToken: 'must-not-leak' },
			request_hash: HASH('a'),
			phase: 'finished',
			terminal_outcome: 'complete',
			max_spend_micro_usd: 60000,
			synthesis_headroom_micro_usd: 10000,
			max_physical_dispatches: 12,
			max_step_attempts: 2,
			whole_run_lifetime_ms: 600000,
			recovery_count: 0,
			context_id: 'ctx-a',
			context_hash: HASH('c'),
			context_bytes: 4096,
			context_accepted_at: T(5),
			evidence_versions: [
				{ kind: 'project_record', id: 'task-1', version: '3', observedAt: T(4) },
				{
					kind: 'document',
					id: 'doc-1',
					version: '2026-09-20T11:00:00.000Z',
					observedAt: T(4)
				}
			],
			context_payload: {
				tasks: [{ id: 'task-1', title: 'Pour the foundation' }],
				documents: [{ id: 'doc-1', title: 'Site plan' }]
			},
			plan_version: 'agentic_chat_project_review_plan_v1',
			plan: {
				version: 'agentic_chat_project_review_plan_v1',
				planner: {
					outcome: 'accepted',
					stepAttemptId: 'att-planner-1',
					resultHash: HASH('p')
				},
				steps: V1_PLAN_STEPS,
				assignments: {
					project_analyst: { objective: 'Assess progress' },
					risk_reviewer: { objective: 'Find risks' }
				}
			},
			plan_hash: HASH('9'),
			plan_installed_at: T(8),
			answer_id: 'answer-a',
			answer_editor_step_attempt_id: 'att-editor-1',
			answer_text: 'Prioritize the foundation.',
			answer_text_sha256: HASH('f'),
			synthesis_status: 'accepted',
			synthesis_quality: 'complete',
			synthesis_accepted_at: T(40),
			created_at: T(1),
			updated_at: T(41),
			finished_at: T(41)
		}
	],
	steps: [
		{
			turn_run_id: RUN_A,
			step_key: 'planner',
			status: 'accepted',
			attempts_used: 1,
			attempt_ids: ['att-planner-1'],
			accepted_attempt_id: 'att-planner-1',
			quality: 'complete',
			result: { assignments: {} },
			result_hash: HASH('p'),
			claimed_at: T(6),
			finished_at: T(8),
			assignment: { objective: 'plan' }
		},
		{
			turn_run_id: RUN_A,
			step_key: 'project_analyst',
			status: 'accepted',
			attempts_used: 1,
			attempt_ids: ['att-analyst-1'],
			accepted_attempt_id: 'att-analyst-1',
			quality: 'complete',
			result: {
				version: 'chat_workflow_role_report_v1',
				role: 'project_analyst',
				summary: 'Foundation work is scheduled.',
				findings: [
					{
						claim: 'Foundation task is open',
						basis: 'recorded',
						evidence: [
							{
								kind: 'project_record',
								id: 'task-1',
								version: '3',
								label: 'Pour the foundation'
							}
						]
					}
				],
				risks: [],
				unknowns: [],
				recommendation: 'Start with the foundation.',
				unsupportedReferences: 0,
				unsupportedFindings: 0
			},
			result_hash: HASH('1'),
			claimed_at: T(9),
			finished_at: T(20),
			assignment: { objective: 'Assess progress' }
		},
		{
			turn_run_id: RUN_A,
			step_key: 'risk_reviewer',
			status: 'accepted',
			attempts_used: 2,
			attempt_ids: ['att-risk-1', 'att-risk-2'],
			accepted_attempt_id: 'att-risk-2',
			quality: 'partial',
			result: {
				version: 'chat_workflow_role_report_v1',
				role: 'risk_reviewer',
				summary: 'Weather risk.',
				findings: [],
				risks: [{ risk: 'Rain delays', evidence: [] }],
				unknowns: ['Permit status'],
				recommendation: 'Check permits.'
			},
			result_hash: HASH('2'),
			claimed_at: T(9),
			finished_at: T(30),
			assignment: { objective: 'Find risks' }
		},
		{
			turn_run_id: RUN_A,
			step_key: 'editor',
			status: 'claimed',
			attempts_used: 1,
			attempt_ids: ['att-editor-1'],
			current_attempt_id: 'att-editor-1',
			current_attempt_generation: 1,
			claimed_at: T(31),
			assignment: { objective: 'combine' }
		}
	],
	dispatches: [
		{
			dispatch_id: 'd-planner',
			turn_run_id: RUN_A,
			step_key: 'planner',
			step_attempt_id: 'att-planner-1',
			physical_attempt: 1,
			dispatch_kind: 'planner',
			state: 'settled',
			model_requested: 'deepseek/deepseek-v4.1-flash',
			reserved_micro_usd: 2000,
			actual_micro_usd: 400,
			provider_request_id: 'req-planner',
			reserved_at: T(6),
			dispatched_at: T(6),
			settled_at: T(8),
			pricing: { version: 'agentic_chat_workflow_pricing_v1' }
		},
		{
			dispatch_id: 'd-analyst-1',
			turn_run_id: RUN_A,
			step_key: 'project_analyst',
			step_attempt_id: 'att-analyst-1',
			physical_attempt: 1,
			dispatch_kind: 'specialist',
			state: 'released',
			model_requested: 'deepseek/deepseek-v4.1-flash',
			reserved_micro_usd: 3000,
			actual_micro_usd: 0,
			reserved_at: T(9),
			dispatched_at: T(9),
			settled_at: T(10)
		},
		{
			dispatch_id: 'd-analyst-2',
			turn_run_id: RUN_A,
			step_key: 'project_analyst',
			step_attempt_id: 'att-analyst-1',
			physical_attempt: 2,
			dispatch_kind: 'provider_fallback',
			state: 'settled',
			model_requested: 'deepseek/deepseek-v4-flash',
			reserved_micro_usd: 3000,
			actual_micro_usd: 900,
			provider_request_id: 'req-analyst',
			provider_usage: {
				prompt_tokens: 1200,
				completion_tokens: 300,
				settlementToken: 'leak-me'
			},
			reserved_at: T(10),
			dispatched_at: T(10),
			settled_at: T(20)
		},
		{
			dispatch_id: 'd-risk-1',
			turn_run_id: RUN_A,
			step_key: 'risk_reviewer',
			step_attempt_id: 'att-risk-1',
			physical_attempt: 1,
			dispatch_kind: 'specialist',
			state: 'uncertain',
			model_requested: 'deepseek/deepseek-v4.1-flash',
			reserved_micro_usd: 3000,
			actual_micro_usd: null,
			reserved_at: T(9),
			dispatched_at: T(9),
			uncertain_at: T(18)
		},
		{
			dispatch_id: 'd-risk-2',
			turn_run_id: RUN_A,
			step_key: 'risk_reviewer',
			step_attempt_id: 'att-risk-2',
			physical_attempt: 1,
			dispatch_kind: 'corrective',
			state: 'settled',
			model_requested: 'deepseek/deepseek-v4.1-flash',
			reserved_micro_usd: 3000,
			actual_micro_usd: 700,
			provider_request_id: 'req-risk-2',
			reserved_at: T(19),
			dispatched_at: T(19),
			settled_at: T(30)
		},
		{
			dispatch_id: 'd-editor',
			turn_run_id: RUN_A,
			step_key: 'editor',
			step_attempt_id: 'att-editor-1',
			physical_attempt: 1,
			dispatch_kind: 'editor',
			state: 'settled',
			model_requested: 'deepseek/deepseek-v4.1-flash',
			reserved_micro_usd: 4000,
			actual_micro_usd: 1100,
			provider_request_id: 'req-editor',
			reserved_at: T(31),
			dispatched_at: T(31),
			settled_at: T(40)
		}
	],
	snapshots: [],
	readBatches: [],
	shadows: [],
	inputArtifacts: [
		{
			id: 'artifact-a',
			turn_run_id: RUN_A,
			artifact_version: 'agentic_chat_input_v4',
			content_hash: HASH('e'),
			content_bytes: 900,
			history_source: 'admission_window',
			history_bytes: 200,
			history: [{ role: 'user', content: 'earlier' }],
			prepared: {
				request: { message: 'What should we prioritize?', requestHash: HASH('a') },
				requestHash: HASH('a')
			},
			retain_until: T(9999),
			created_at: T(0)
		}
	]
});

const parallelTurnRuns = () => [
	{
		id: RUN_A,
		turn_index: 2,
		status: 'completed',
		finished_reason: 'workflow_complete',
		failure_code: null,
		request_message: 'What should we prioritize?',
		started_at: T(0),
		finished_at: T(41),
		events: [
			progressEvent(
				1,
				T(6),
				{
					planner: 'claimed',
					project_analyst: 'pending',
					risk_reviewer: 'pending',
					editor: 'pending'
				},
				{ phase: 'assessing' }
			),
			progressEvent(2, T(9), {
				planner: 'accepted',
				project_analyst: 'claimed',
				risk_reviewer: 'claimed',
				editor: 'pending'
			}),
			progressEvent(
				3,
				T(40),
				{
					planner: 'accepted',
					project_analyst: 'accepted',
					risk_reviewer: 'accepted',
					editor: 'claimed'
				},
				{ phase: 'finished', terminalOutcome: 'complete', executionState: 'terminal' }
			)
		]
	},
	{
		id: 'ordinary-turn',
		turn_index: 1,
		status: 'completed',
		request_message: 'hello',
		started_at: T(-100),
		finished_at: T(-90),
		events: []
	}
];

const usageLogs = () => [
	{
		id: 'u-planner',
		turn_run_id: RUN_A,
		openrouter_request_id: 'req-planner',
		total_cost_usd: 0.0004
	},
	{
		id: 'u-analyst',
		turn_run_id: RUN_A,
		openrouter_request_id: 'req-analyst',
		total_cost_usd: 0.0009
	},
	{
		id: 'u-editor',
		turn_run_id: RUN_A,
		openrouter_request_id: 'req-editor',
		total_cost_usd: 0.0011
	},
	{
		id: 'u-stray',
		turn_run_id: RUN_A,
		openrouter_request_id: 'req-unknown',
		total_cost_usd: 0.0002
	}
];

/** Fixture B: document profile 3, sequential evidence handoff bound by hash, with a Jev shadow. */
const evidenceHandoffRows = (): WorkflowAuditRowSet => {
	const readResult = {
		version: 'agentic_chat_document_read_result_v1',
		documents: [
			{
				id: 'doc-1',
				status: 'read',
				title: 'Workshop plan',
				version: '2026-09-20T10:00:00.000Z',
				content: 'Full body',
				contentHash: HASH('d'),
				fullCharacters: 9,
				truncated: false
			},
			{
				id: 'doc-2',
				status: 'read',
				title: 'Materials list',
				version: '2026-09-20T10:00:00.000Z',
				content: 'Long body…',
				contentHash: HASH('e'),
				fullCharacters: 9000,
				truncated: true
			},
			{ id: 'doc-3', status: 'changed_since_context' }
		]
	};
	return {
		tables: emptyWorkflowTableCoverage(),
		runs: [
			{
				turn_run_id: RUN_B,
				session_id: 'session-1',
				user_id: 'user-1',
				request_artifact_id: 'artifact-b',
				project_id: 'project-1',
				workflow_version: 'agentic_chat_workflow_v1',
				policy_ref: 'internal-document-organization:v4',
				policy: { version: 'v4' },
				request_hash: HASH('b'),
				phase: 'finished',
				terminal_outcome: 'complete',
				max_spend_micro_usd: 60000,
				recovery_count: 1,
				context_id: 'ctx-b',
				context_hash: HASH('7'),
				context_accepted_at: T(5),
				evidence_versions: [
					{ kind: 'document', id: 'doc-1', version: '2026-09-20T10:00:00.000Z' },
					{ kind: 'document', id: 'doc-2', version: '2026-09-20T10:00:00.000Z' },
					{ kind: 'document', id: 'doc-3', version: '2026-09-20T10:00:00.000Z' },
					{ kind: 'project_record', id: 'goal-1', version: '1' }
				],
				context_payload: {
					goals: [{ id: 'goal-1', name: 'Open the workshop' }],
					documents: [{ id: 'doc-3', title: 'Old notes' }]
				},
				plan_version: 'agentic_chat_document_evidence_plan_v1',
				plan: {
					version: 'agentic_chat_document_evidence_plan_v1',
					planner: { outcome: 'fixed_fallback', stepAttemptId: null, resultHash: null },
					steps: EVIDENCE_PLAN_STEPS,
					assignments: {}
				},
				plan_hash: HASH('8'),
				plan_installed_at: T(8),
				answer_text: 'Group the two overlapping documents.',
				answer_text_sha256: HASH('f'),
				answer_id: 'answer-b',
				answer_editor_step_attempt_id: 'att-editor-b',
				synthesis_status: 'accepted',
				synthesis_quality: 'complete',
				synthesis_accepted_at: T(60),
				created_at: T(1),
				finished_at: T(61)
			}
		],
		steps: [
			{
				turn_run_id: RUN_B,
				step_key: 'planner',
				status: 'skipped',
				failure_code: 'fixed_fallback',
				attempts_used: 0,
				attempt_ids: [],
				finished_at: T(8),
				assignment: {},
				input_evidence: null
			},
			{
				turn_run_id: RUN_B,
				step_key: 'project_analyst',
				status: 'accepted',
				attempts_used: 1,
				attempt_ids: ['att-org-1'],
				accepted_attempt_id: 'att-org-1',
				quality: 'complete',
				result: { summary: 'Overlap found' },
				result_hash: HASH('3'),
				claimed_at: T(9),
				finished_at: T(25),
				assignment: { objective: 'organize' },
				input_evidence: null
			},
			{
				turn_run_id: RUN_B,
				step_key: 'risk_reviewer',
				status: 'accepted',
				attempts_used: 1,
				attempt_ids: ['att-rev-1'],
				accepted_attempt_id: 'att-rev-1',
				quality: 'complete',
				result: { summary: 'Risks noted' },
				result_hash: HASH('4'),
				claimed_at: T(26),
				finished_at: T(45),
				assignment: { objective: 'review' },
				input_evidence: {
					version: 'agentic_chat_document_evidence_binding_v1',
					contextId: 'ctx-b',
					contextHash: HASH('7'),
					documentReadResultHash: HASH('5'),
					organizerStatus: 'accepted'
				}
			},
			{
				turn_run_id: RUN_B,
				step_key: 'editor',
				status: 'accepted',
				attempts_used: 1,
				attempt_ids: ['att-editor-b'],
				accepted_attempt_id: 'att-editor-b',
				quality: 'complete',
				result: { ok: true },
				result_hash: HASH('6'),
				claimed_at: T(46),
				finished_at: T(60),
				assignment: {},
				input_evidence: null
			}
		],
		dispatches: [
			{
				dispatch_id: 'd-org',
				turn_run_id: RUN_B,
				step_key: 'project_analyst',
				step_attempt_id: 'att-org-1',
				physical_attempt: 1,
				dispatch_kind: 'specialist',
				state: 'settled',
				model_requested: 'm',
				reserved_micro_usd: 3000,
				actual_micro_usd: 500,
				reserved_at: T(9),
				settled_at: T(15)
			},
			{
				dispatch_id: 'd-org-2',
				turn_run_id: RUN_B,
				step_key: 'project_analyst',
				step_attempt_id: 'att-org-1',
				physical_attempt: 2,
				dispatch_kind: 'paid_tool',
				state: 'settled',
				model_requested: 'm',
				reserved_micro_usd: 3000,
				actual_micro_usd: 600,
				reserved_at: T(16),
				settled_at: T(25)
			},
			{
				dispatch_id: 'd-rev',
				turn_run_id: RUN_B,
				step_key: 'risk_reviewer',
				step_attempt_id: 'att-rev-1',
				physical_attempt: 1,
				dispatch_kind: 'specialist',
				state: 'settled',
				model_requested: 'm',
				reserved_micro_usd: 3000,
				actual_micro_usd: 800,
				reserved_at: T(26),
				settled_at: T(45)
			},
			{
				dispatch_id: 'd-ed',
				turn_run_id: RUN_B,
				step_key: 'editor',
				step_attempt_id: 'att-editor-b',
				physical_attempt: 1,
				dispatch_kind: 'editor',
				state: 'settled',
				model_requested: 'm',
				reserved_micro_usd: 4000,
				actual_micro_usd: 900,
				reserved_at: T(46),
				settled_at: T(60)
			}
		],
		snapshots: [
			{
				turn_run_id: RUN_B,
				request_hash: HASH('b'),
				snapshot_hash: HASH('s'),
				created_at: T(1),
				snapshot: {
					version: 'agentic_chat_specialist_snapshot_v2',
					profileId: 'document_organization',
					profileVersion: 3,
					engineVersion: 'agentic_chat_workflow_v1',
					slots: {
						project_analyst: {
							assignment: 'Organize the documents',
							definition: {
								id: 'document_organizer',
								version: 2,
								label: 'Document organizer',
								description: 'Groups documents',
								expertise: ['structure'],
								instructions: {
									system: 'You organize documents.',
									defaultAssignment: 'Organize'
								},
								capabilities: { allowedToolIds: ['read_project_documents'] },
								modelPolicy: {
									primaryModel: 'deepseek/deepseek-v4.1-flash',
									fallbackModels: ['deepseek/deepseek-v4-flash']
								}
							}
						},
						risk_reviewer: {
							assignment: 'Review independently',
							definition: {
								id: 'risk_reviewer',
								version: 2,
								label: 'Risk reviewer',
								description: 'Finds risks',
								expertise: ['risk'],
								instructions: {
									system: 'You review risks.',
									defaultAssignment: 'Review'
								},
								capabilities: { allowedToolIds: [] },
								modelPolicy: {
									primaryModel: 'deepseek/deepseek-v4.1-flash',
									fallbackModels: []
								}
							}
						}
					}
				}
			}
		],
		readBatches: [
			{
				turn_run_id: RUN_B,
				request_hash: HASH('b'),
				document_ids: ['doc-1', 'doc-2', 'doc-3'],
				result: readResult,
				result_hash: HASH('5'),
				step_attempt_id: 'att-org-1',
				execution_generation: 1,
				created_at: T(15)
			}
		],
		shadows: [
			{
				turn_run_id: RUN_B,
				request_hash: HASH('b'),
				context_id: 'ctx-b',
				context_hash: HASH('7'),
				execution_generation: 1,
				input_hash: HASH('i'),
				result_hash: HASH('r'),
				created_at: T(6),
				completed_at: T(7),
				input: {
					version: 'specialist_shadow_input_v1',
					baseline: 'document_read',
					policy: { model: 'typesafe/jev-1.13' },
					request: {
						candidates: [
							{
								id: 'document_read',
								description: 'read docs',
								specialists: [
									{
										id: 'document_organizer',
										version: 2,
										label: 'Document organizer'
									}
								],
								tools: ['read_project_documents']
							},
							{
								id: 'project_review',
								description: 'review',
								specialists: [],
								tools: []
							}
						]
					}
				},
				result: {
					version: 'specialist_shadow_result_v1',
					status: 'observed',
					reason: 'ranked_bundle',
					selectedBundle: 'project_review',
					recommendedBundle: 'project_review',
					agreesWithBaseline: false,
					probabilities: { project_review: 0.7, document_read: 0.3 },
					confidence: 0.7,
					margin: 0.4,
					usage: {
						modelRequested: 'typesafe/jev-1.13',
						modelUsed: 'typesafe/jev-1.13-20260917',
						requestId: 'jev-1',
						inputTokens: 900,
						outputTokens: 20,
						costUsd: 0.00007,
						durationMs: 210,
						requestBytes: 4000,
						attempts: 1
					}
				}
			}
		],
		inputArtifacts: []
	};
};

const evidenceTurnRuns = () => [
	{
		id: RUN_B,
		turn_index: 3,
		status: 'completed',
		request_message: 'Organize my documents',
		started_at: T(0),
		finished_at: T(61),
		events: [
			progressEvent(
				1,
				T(9),
				{
					planner: 'skipped',
					project_analyst: 'claimed',
					risk_reviewer: 'pending',
					editor: 'pending'
				},
				{ generation: 1 }
			),
			progressEvent(
				2,
				T(26),
				{
					planner: 'skipped',
					project_analyst: 'accepted',
					risk_reviewer: 'claimed',
					editor: 'pending'
				},
				{ generation: 2, executionState: 'recovering' }
			),
			progressEvent(
				3,
				T(60),
				{
					planner: 'skipped',
					project_analyst: 'accepted',
					risk_reviewer: 'accepted',
					editor: 'accepted'
				},
				{
					generation: 2,
					phase: 'finished',
					terminalOutcome: 'complete',
					executionState: 'terminal'
				}
			)
		]
	}
];

describe('redactControlSecrets', () => {
	it('removes token-like control fields but keeps token counts and ids', () => {
		const { value, count } = redactControlSecrets({
			settlement_token: 'x',
			settlementToken: 'y',
			attempt_token: 'z',
			authorization: 'Bearer abc',
			api_key: 'k',
			signed_url: 'https://x',
			prompt_tokens: 12,
			inputTokens: 3,
			max_output_tokens: 4000,
			dispatch_id: 'keep-me',
			nested: [{ processing_token: 'p', total_tokens: 5 }]
		});
		expect(count).toBe(7);
		expect(value.settlement_token).toBe('[redacted]');
		expect(value.prompt_tokens).toBe(12);
		expect(value.inputTokens).toBe(3);
		expect(value.max_output_tokens).toBe(4000);
		expect(value.dispatch_id).toBe('keep-me');
		expect((value.nested as Array<Record<string, unknown>>)[0]?.processing_token).toBe(
			'[redacted]'
		);
		expect((value.nested as Array<Record<string, unknown>>)[0]?.total_tokens).toBe(5);
	});
});

describe('buildChatWorkflowAuditPayload — parallel v1 review', () => {
	const payload = buildChatWorkflowAuditPayload({
		rows: parallelReviewRows(),
		turnRuns: parallelTurnRuns(),
		llmCalls: usageLogs(),
		capturedAt: T(100)
	});
	const run = payload.runs[0]!;

	it('separates workflow turns from ordinary turns and reports counts', () => {
		expect(payload.version).toBe('chat_workflow_audit_v1');
		expect(payload.runs).toHaveLength(1);
		expect(payload.ordinary_turn_ids).toEqual(['ordinary-turn']);
		expect(payload.counts.dispatches).toBe(6);
		expect(run.turn_index).toBe(2);
		expect(run.outcome_label).toBe('Complete');
		expect(run.is_terminal).toBe(true);
	});

	it('derives a parallel graph from the saved plan, not the registry', () => {
		expect(run.graph.source).toBe('saved_plan');
		expect(run.graph.parallel_groups).toEqual([
			{ id: 'parallel:1', step_keys: ['project_analyst', 'risk_reviewer'] }
		]);
		expect(run.graph.sequential_handoffs).toEqual([]);
		const analyst = run.graph.nodes.find((n) => n.id === 'step:project_analyst')!;
		const reviewer = run.graph.nodes.find((n) => n.id === 'step:risk_reviewer')!;
		expect(analyst.column).toBe(reviewer.column);
		expect(analyst.lane).not.toBe(reviewer.lane);
		expect(run.graph.edges.filter((e) => e.kind === 'evidence')).toHaveLength(0);
		expect(run.graph.edges.some((e) => e.from === 'step:editor' && e.to === 'answer')).toBe(
			true
		);
		expect(run.graph.nodes.some((n) => n.kind === 'shadow')).toBe(false);
	});

	it('uses saved progress-event labels and marks the claimed editor as finalized by the answer receipt', () => {
		const editor = run.steps.find((s) => s.key === 'editor')!;
		expect(editor.label).toBe('Combine recommendations');
		expect(editor.display_state).toBe('finalized');
		expect(editor.display_note).toMatch(/durable answer receipt/i);
		expect(editor.prompt_coverage.accepted_result).toBe('answer_text');
		expect(run.steps.find((s) => s.key === 'risk_reviewer')!.display_state).toBe('partial');
	});

	it('keeps logical attempts, physical dispatches and fallbacks distinct without double counting cost', () => {
		const reviewer = run.steps.find((s) => s.key === 'risk_reviewer')!;
		expect(reviewer.attempts.map((a) => a.state)).toEqual(['superseded', 'accepted']);
		expect(reviewer.attempts[0]!.dispatch_ids).toEqual(['d-risk-1']);
		expect(reviewer.attempts[1]!.dispatch_ids).toEqual(['d-risk-2']);
		expect(reviewer.cost.uncertain_reserved_micro_usd).toBe(3000);
		expect(reviewer.cost.settled_micro_usd).toBe(700);
		const analyst = run.steps.find((s) => s.key === 'project_analyst')!;
		expect(analyst.cost.released_count).toBe(1);
		expect(analyst.cost.settled_micro_usd).toBe(900);
		expect(run.costs.settled_micro_usd).toBe(400 + 900 + 700 + 1100);
		expect(run.costs.uncertain_dispatch_count).toBe(1);
		expect(run.costs.physical_dispatches).toBe(5);
		expect(run.costs.dispatch_counts).toEqual({ settled: 4, released: 1, uncertain: 1 });
	});

	it('correlates usage logs by provider request id only and reports the rest as uncorrelated', () => {
		expect(run.dispatches.find((d) => d.dispatch_id === 'd-analyst-2')!.usage_log_id).toBe(
			'u-analyst'
		);
		expect(
			run.dispatches.find((d) => d.dispatch_id === 'd-analyst-1')!.usage_log_id
		).toBeNull();
		expect(run.costs.usage_logs.matched).toBe(3);
		expect(run.costs.usage_logs.unmatched).toBe(1);
		expect(run.costs.usage_logs.unmatched_cost_usd).toBeCloseTo(0.0002, 8);
	});

	it('redacts control secrets everywhere but keeps token counts and correlation ids', () => {
		expect(run.policy?.settlementToken).toBe('[redacted]');
		const fallback = run.dispatches.find((d) => d.dispatch_id === 'd-analyst-2')!;
		expect(fallback.provider_usage?.settlementToken).toBe('[redacted]');
		expect(fallback.provider_usage?.prompt_tokens).toBe(1200);
		expect(fallback.provider_request_id).toBe('req-analyst');
		expect(run.redactions).toBe(2);
		expect(JSON.stringify(payload)).not.toContain('must-not-leak');
		expect(JSON.stringify(payload)).not.toContain('leak-me');
	});

	it('shows wall clock and parallel overlap separately from the sum of lanes', () => {
		expect(run.timing.wall_clock_ms).toBe(41_000);
		expect(run.timing.parallel_overlap_ms).toBe(11_000);
		expect(run.timing.sum_of_lane_ms).toBeGreaterThan(run.timing.wall_clock_ms!);
		expect(run.timing.running).toBe(false);
		const reviewerClaim = run.timeline.find((e) => e.id === 'step:risk_reviewer:claimed')!;
		expect(reviewerClaim.parallel_with).toEqual(['project_analyst']);
		expect(run.timeline.some((e) => e.kind === 'capture')).toBe(false);
		expect(run.timeline.find((e) => e.id === 'attempt:att-risk-2')?.title).toBe(
			'Risk reviewer retry 2'
		);
	});

	it('marks sources by kind for a parallel plan with no document reads and pins the input artifact', () => {
		const task = run.sources.find((s) => s.id === 'task-1')!;
		expect(task.label).toBe('Pour the foundation');
		expect(
			task.receipts.every((r) => r.coverage === 'full' && r.via === 'context_inventory')
		).toBe(true);
		const doc = run.sources.find((s) => s.id === 'doc-1')!;
		expect(doc.label).toBe('Site plan');
		expect(doc.receipts.every((r) => r.coverage === 'inventory_only')).toBe(true);
		expect(run.input_artifact?.request_hash_matches_run).toBe(true);
		expect(run.input_artifact?.history_count).toBe(1);
		expect(run.steps.find((s) => s.key === 'project_analyst')!.specialist_coverage).toBe(
			'code_owned_not_stored'
		);
		expect(
			run.coverage.some(
				(c) => c.scope === 'specialist_definitions' && c.status === 'not_persisted'
			)
		).toBe(true);
		expect(run.coverage.some((c) => c.scope === 'per_attempt_prompts')).toBe(true);
	});
});

describe('buildChatWorkflowAuditPayload — sequential evidence handoff', () => {
	const payload = buildChatWorkflowAuditPayload({
		rows: evidenceHandoffRows(),
		turnRuns: evidenceTurnRuns(),
		capturedAt: T(100)
	});
	const run = payload.runs[0]!;

	it('renders a sequential graph with an evidence edge bound by the saved hash', () => {
		expect(run.graph.parallel_groups).toEqual([]);
		expect(run.graph.sequential_handoffs).toEqual([
			{ from: 'project_analyst', to: 'risk_reviewer', via: 'evidence_binding' }
		]);
		const organizer = run.graph.nodes.find((n) => n.id === 'step:project_analyst')!;
		const reviewer = run.graph.nodes.find((n) => n.id === 'step:risk_reviewer')!;
		expect(reviewer.column).toBe(organizer.column + 1);
		const edge = run.graph.edges.find(
			(e) => e.from === 'step:project_analyst' && e.to === 'step:risk_reviewer'
		)!;
		expect(edge.kind).toBe('evidence');
		expect(edge.label).toContain(HASH('5').slice(0, 12));
	});

	it('pins specialists from the run snapshot and attaches the tool call to the organizer attempt', () => {
		const organizer = run.steps.find((s) => s.key === 'project_analyst')!;
		expect(organizer.label).toBe('Document organizer');
		expect(organizer.specialist?.allowed_tool_ids).toEqual(['read_project_documents']);
		expect(organizer.specialist?.system_prompt).toBe('You organize documents.');
		expect(organizer.prompt_coverage.system_prompt).toBe('run_snapshot');
		expect(organizer.tool_call_ids).toHaveLength(1);
		expect(run.tool_calls[0]!.step_key).toBe('project_analyst');
		expect(run.tool_calls[0]!.documents.map((d) => d.coverage)).toEqual([
			'full',
			'excerpt',
			'unavailable'
		]);
		expect(
			run.graph.nodes.some((n) => n.kind === 'tool' && n.step_key === 'project_analyst')
		).toBe(true);
	});

	it('shows the reviewer received the bound reads through the handoff, per document coverage', () => {
		const reviewer = run.steps.find((s) => s.key === 'risk_reviewer')!;
		expect(reviewer.input_evidence_coverage).toBe('stored');
		const byId = Object.fromEntries(reviewer.received_sources.map((r) => [r.source_id, r]));
		expect(byId['doc-1']).toEqual({
			source_id: 'doc-1',
			coverage: 'full',
			via: 'evidence_handoff'
		});
		expect(byId['doc-2']).toEqual({
			source_id: 'doc-2',
			coverage: 'excerpt',
			via: 'evidence_handoff'
		});
		expect(byId['doc-3']).toEqual({
			source_id: 'doc-3',
			coverage: 'unavailable',
			via: 'evidence_handoff'
		});
		expect(byId['goal-1']!.coverage).toBe('full');
		expect(reviewer.source_coverage_summary).toContain('via saved evidence handoff');
		expect(run.sources.find((s) => s.id === 'doc-3')!.label).toBe('Old notes');
		expect(run.sources.find((s) => s.id === 'goal-1')!.label).toBe('Open the workshop');
	});

	it('keeps the Jev shadow visually distinct and its cost outside the workflow ledger', () => {
		expect(run.selection_shadow?.status).toBe('observed');
		expect(run.selection_shadow?.agrees_with_baseline).toBe(false);
		expect(run.selection_shadow?.candidates.map((c) => c.id)).toEqual([
			'document_read',
			'project_review'
		]);
		const shadowNode = run.graph.nodes.find((n) => n.kind === 'shadow')!;
		expect(shadowNode.sublabel).toContain('disagrees');
		expect(
			run.graph.edges.filter((e) => e.to === 'shadow').every((e) => e.kind === 'observation')
		).toBe(true);
		expect(run.graph.edges.some((e) => e.from === 'shadow')).toBe(false);
		expect(run.costs.selector?.cost_usd).toBeCloseTo(0.00007, 10);
		expect(run.costs.settled_micro_usd).toBe(500 + 600 + 800 + 900);
	});

	it('records recovery from generation changes and flags the fixed-fallback planner', () => {
		expect(run.recovery_count).toBe(1);
		expect(run.timeline.some((e) => e.kind === 'recovery' && e.generation === 2)).toBe(true);
		expect(run.plan?.planner_outcome).toBe('fixed_fallback');
		expect(run.steps.find((s) => s.key === 'planner')!.display_state).toBe('skipped');
		expect(
			run.coverage.some((c) => c.scope === 'input_artifact' && c.status === 'absent')
		).toBe(true);
	});
});

describe('buildChatWorkflowAuditPayload — parallel profile with unshared reads', () => {
	it('shows the old parallel reviewer did not receive the organizer reads', () => {
		const rows = evidenceHandoffRows();
		const run = rows.runs[0]!;
		run.turn_run_id = RUN_C;
		run.policy_ref = 'internal-document-organization:v3';
		run.plan_version = 'agentic_chat_project_review_plan_v1';
		run.plan = {
			...(run.plan as Record<string, unknown>),
			version: 'agentic_chat_project_review_plan_v1',
			steps: V1_PLAN_STEPS
		};
		for (const step of rows.steps) {
			step.turn_run_id = RUN_C;
			delete step.input_evidence;
		}
		for (const d of rows.dispatches) d.turn_run_id = RUN_C;
		rows.snapshots[0]!.turn_run_id = RUN_C;
		(rows.snapshots[0]!.snapshot as Record<string, unknown>).profileVersion = 2;
		rows.readBatches[0]!.turn_run_id = RUN_C;
		rows.shadows = [];
		const payload = buildChatWorkflowAuditPayload({
			rows,
			turnRuns: [
				{
					id: RUN_C,
					turn_index: 1,
					request_message: 'x',
					started_at: T(0),
					finished_at: T(61),
					events: []
				}
			],
			capturedAt: T(100)
		});
		const out = payload.runs[0]!;
		const reviewer = out.steps.find((s) => s.key === 'risk_reviewer')!;
		expect(reviewer.input_evidence_coverage).toBe('not_applicable');
		const byId = Object.fromEntries(
			reviewer.received_sources.map((r) => [r.source_id, r.coverage])
		);
		expect(byId['doc-1']).toBe('not_supplied');
		expect(byId['doc-2']).toBe('not_supplied');
		expect(byId['doc-3']).toBe('not_supplied');
		expect(
			out.sources
				.find((s) => s.id === 'doc-1')!
				.receipts.find((r) => r.step_key === 'risk_reviewer')!.detail
		).toMatch(/not shared/i);
		expect(out.graph.parallel_groups).toHaveLength(1);
		expect(out.graph.sequential_handoffs).toEqual([]);
		expect(out.coverage.some((c) => c.scope === 'jev_shadow' && c.status === 'absent')).toBe(
			true
		);
	});
});

describe('buildChatWorkflowAuditPayload — coverage and unsupported records', () => {
	it('surfaces missing tables, truncation and unsupported versions instead of fabricating a graph', () => {
		const rows = parallelReviewRows();
		rows.tables.chat_turn_specialist_selection_shadows = {
			status: 'unavailable',
			detail: 'Table chat_turn_specialist_selection_shadows is not available in this database.'
		};
		rows.tables.chat_turn_workflow_dispatches = {
			status: 'truncated',
			detail: 'limit',
			count: 4000,
			limit: 4000
		};
		rows.runs[0]!.workflow_version = 'agentic_chat_workflow_v9';
		const payload = buildChatWorkflowAuditPayload({
			rows,
			turnRuns: parallelTurnRuns(),
			capturedAt: T(100)
		});
		const run = payload.runs[0]!;
		expect(run.supported).toBe(false);
		expect(run.graph.source).toBe('none');
		expect(run.graph.nodes).toEqual([]);
		expect(run.steps).toHaveLength(4);
		expect(run.coverage[0]).toMatchObject({ scope: 'workflow_version', status: 'unavailable' });
		expect(
			payload.notes.some(
				(n) => n.includes('chat_turn_workflow_dispatches') && n.includes('4000')
			)
		).toBe(true);
		expect(
			payload.notes.some((n) => n.includes('chat_turn_specialist_selection_shadows'))
		).toBe(true);
		expect(run.coverage.some((c) => c.scope === 'jev_shadow')).toBe(false);
	});

	it('marks a running workflow as a non-atomic capture with running steps', () => {
		const rows = parallelReviewRows();
		const run = rows.runs[0]!;
		run.phase = 'executing';
		run.terminal_outcome = null;
		run.finished_at = null;
		run.synthesis_status = 'not_started';
		run.synthesis_accepted_at = null;
		run.answer_text = '';
		run.answer_text_sha256 = null;
		rows.steps.find((s) => s.step_key === 'risk_reviewer')!.status = 'claimed';
		rows.steps.find((s) => s.step_key === 'risk_reviewer')!.current_attempt_id = 'att-risk-2';
		rows.steps.find((s) => s.step_key === 'risk_reviewer')!.current_attempt_generation = 1;
		rows.steps.find((s) => s.step_key === 'risk_reviewer')!.finished_at = null;
		rows.steps.find((s) => s.step_key === 'editor')!.status = 'pending';
		rows.steps.find((s) => s.step_key === 'editor')!.claimed_at = null;
		const payload = buildChatWorkflowAuditPayload({
			rows,
			turnRuns: parallelTurnRuns().map((t) => ({
				...t,
				status: 'running',
				finished_at: null
			})),
			capturedAt: T(50)
		});
		const out = payload.runs[0]!;
		expect(out.is_terminal).toBe(false);
		expect(out.outcome_label).toBe('Executing');
		expect(out.steps.find((s) => s.key === 'risk_reviewer')!.display_state).toBe('running');
		expect(out.steps.find((s) => s.key === 'editor')!.display_state).toBe('pending');
		expect(out.timing.running).toBe(true);
		expect(out.timing.wall_clock_ms).toBe(50_000);
		expect(out.timeline.at(-1)?.kind).toBe('capture');
		expect(payload.notes.some((n) => n.includes('still running'))).toBe(true);
	});

	it('marks a cancelled run and its unfinished steps as cancelled, not failed', () => {
		const rows = parallelReviewRows();
		const run = rows.runs[0]!;
		run.terminal_outcome = 'cancelled';
		run.synthesis_status = 'not_started';
		run.synthesis_accepted_at = null;
		run.answer_text = '';
		run.answer_text_sha256 = null;
		rows.steps.find((s) => s.step_key === 'editor')!.status = 'pending';
		const payload = buildChatWorkflowAuditPayload({
			rows,
			turnRuns: parallelTurnRuns(),
			capturedAt: T(100)
		});
		expect(payload.runs[0]!.steps.find((s) => s.key === 'editor')!.display_state).toBe(
			'cancelled'
		);
		expect(payload.runs[0]!.outcome_label).toBe('Cancelled');
	});
});
