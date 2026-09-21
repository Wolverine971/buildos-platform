// apps/web/src/lib/services/agentic-chat-v2/worker-turn-workflow-admission.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	AGENTIC_CHAT_WORKFLOW_POLICY_V1,
	buildAgenticChatWorkflowReviewIntentV1,
	hashAgenticChatWorkflowRequestV1
} from '@buildos/shared-types';
import {
	AGENTIC_CHAT_WORKFLOW_V4_POLICY_REF,
	admitAgenticChatWorkflowV4Turn,
	buildAgenticChatWorkflowV4AdmissionArgs,
	evaluateAgenticChatWorkflowV4Admission,
	resolveAgenticChatWorkflowV4AdmissionPolicy,
	type AgenticChatWorkflowV4AdmissionRpcArgs,
	type AgenticChatWorkflowV4CommandV1
} from './worker-turn-workflow-admission.server';

const USER_ID = 'f1000000-0000-4000-8000-000000000001';
const PROJECT_ID = 'f3000000-0000-4000-8000-000000000001';
const SESSION_ID = 'f4000000-0000-4000-8000-000000000001';
const DECISION_ID = 'f5000000-0000-4000-8000-000000000001';
const IDS = [
	'f6000000-0000-4000-8000-000000000001',
	'f6000000-0000-4000-8000-000000000002',
	'f6000000-0000-4000-8000-000000000003',
	'f6000000-0000-4000-8000-000000000004'
];
const QUEUE_JOB_ID = 'f7000000-0000-4000-8000-000000000001';

const ON = { enabled: true, cohortUserIds: [USER_ID] };

function command(overrides: Partial<AgenticChatWorkflowV4CommandV1> = {}) {
	return {
		clientTurnId: 'client-turn-1',
		streamRunId: 'stream-run-1',
		sessionId: SESSION_ID,
		context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID },
		message: '  Review the project:\r\nwhat should we prioritize next?  ',
		attachments: [],
		projectFocus: null,
		voiceNoteGroupId: null,
		reviewIntent: 'project_review' as const,
		...overrides
	};
}

async function args(overrides: Partial<AgenticChatWorkflowV4CommandV1> = {}) {
	const eligibility = evaluateAgenticChatWorkflowV4Admission({
		policy: ON,
		userId: USER_ID,
		command: command(overrides)
	});
	if (!eligibility.eligible) throw new Error(eligibility.reason);
	const ids = [...IDS];
	return buildAgenticChatWorkflowV4AdmissionArgs({
		userId: USER_ID,
		command: command(overrides),
		eligibility,
		transportDecisionId: DECISION_ID,
		createId: () => ids.shift()!
	});
}

function receipt(input: AgenticChatWorkflowV4AdmissionRpcArgs, overrides = {}) {
	return {
		outcome: 'newly_admitted',
		execution_may_start: false,
		turn_run_id: input.p_turn_run_id,
		session_id: SESSION_ID,
		session_created: false,
		user_message_id: input.p_user_message_id,
		input_artifact_id: input.p_request_artifact_id,
		queue_job_id: QUEUE_JOB_ID,
		correlation_id: input.p_correlation_id,
		stream_run_id: input.p_stream_run_id,
		client_turn_id: input.p_client_turn_id,
		execution_mode: 'worker_realtime',
		status: 'queued',
		request_hash: input.p_request_hash,
		content_hash: 'c'.repeat(64),
		history_message_count: 4,
		...overrides
	};
}

function client(result: { data?: unknown; error?: { code?: string; message?: string } | null }) {
	return { rpc: vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null })) };
}

describe('workflow v4 admission policy', () => {
	it('ships off and parses only an exact server switch plus the explicit cohort', () => {
		expect(resolveAgenticChatWorkflowV4AdmissionPolicy({})).toEqual({
			enabled: false,
			specialistWorkflowsEnabled: false,
			documentReadToolsEnabled: false,
			documentEvidenceHandoffEnabled: false,
			publishedSpecialistsEnabled: false,
			projectReviewV2Enabled: false,
			projectReviewV3Enabled: false,
			cohortUserIds: []
		});
		for (const value of ['TRUE', '1', 'yes', 'on', '']) {
			expect(
				resolveAgenticChatWorkflowV4AdmissionPolicy({
					AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED: value
				}).enabled
			).toBe(false);
		}
		expect(
			resolveAgenticChatWorkflowV4AdmissionPolicy({
				AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED: 'true',
				AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS: `${USER_ID.toUpperCase()}, *, not-a-uuid`
			})
		).toEqual({
			enabled: true,
			specialistWorkflowsEnabled: false,
			documentReadToolsEnabled: false,
			documentEvidenceHandoffEnabled: false,
			publishedSpecialistsEnabled: false,
			projectReviewV2Enabled: false,
			projectReviewV3Enabled: false,
			cohortUserIds: [USER_ID]
		});
	});

	it('admits only an explicit, enabled, cohort, project-wide, text-only question', () => {
		const evaluate = (
			overrides: Partial<AgenticChatWorkflowV4CommandV1>,
			policy = ON,
			userId = USER_ID
		) =>
			evaluateAgenticChatWorkflowV4Admission({ policy, userId, command: command(overrides) });

		expect(evaluate({})).toEqual({
			eligible: true,
			projectId: PROJECT_ID,
			message: 'Review the project:\nwhat should we prioritize next?'
		});
		expect(evaluate({ projectFocus: { focusType: 'project-wide' } }).eligible).toBe(true);

		expect(evaluate({ reviewIntent: null })).toEqual({
			eligible: false,
			reason: 'not_requested'
		});
		expect(evaluate({}, { ...ON, enabled: false })).toMatchObject({ reason: 'disabled' });
		expect(evaluate({}, ON, 'f1000000-0000-4000-8000-0000000000ff')).toMatchObject({
			reason: 'not_in_cohort'
		});
		expect(
			evaluate({ context: { type: 'global', entityId: null, projectId: null } })
		).toMatchObject({ reason: 'not_project_scope' });
		expect(
			evaluate({
				context: {
					type: 'project',
					entityId: PROJECT_ID,
					projectId: 'f3000000-0000-4000-8000-000000000002'
				}
			})
		).toMatchObject({ reason: 'not_project_scope' });
		expect(evaluate({ attachments: [{}] })).toMatchObject({ reason: 'attachments' });
		expect(evaluate({ voiceNoteGroupId: IDS[0]! })).toMatchObject({ reason: 'voice_note' });
		expect(evaluate({ projectFocus: { focusType: 'task' } })).toMatchObject({
			reason: 'focused_entity'
		});
		for (const message of [' ok ', '🚀'.repeat(6_001), 'é'.repeat(5_990) + 'x'.repeat(5)]) {
			expect(evaluate({ message }).eligible).toBe(
				message === 'é'.repeat(5_990) + 'x'.repeat(5)
			);
		}
		// Code points, not UTF-16 units: 6,000 astral characters (12,000 units,
		// 24,000 bytes) are within both the code-point and 24 KiB byte bounds.
		expect(evaluate({ message: '🚀'.repeat(6_000) }).eligible).toBe(true);
	});

	it('derives every authoritative argument on the server', async () => {
		const built = await args();
		const message = 'Review the project:\nwhat should we prioritize next?';
		const reviewIntent = buildAgenticChatWorkflowReviewIntentV1(message);

		expect(built).toEqual({
			p_user_id: USER_ID,
			p_session_id: SESSION_ID,
			p_turn_run_id: IDS[0],
			p_user_message_id: IDS[1],
			p_request_artifact_id: IDS[2],
			p_stream_run_id: 'stream-run-1',
			p_client_turn_id: 'client-turn-1',
			p_transport_decision_id: DECISION_ID,
			p_correlation_id: IDS[3],
			p_project_id: PROJECT_ID,
			p_message: message,
			p_review_intent: reviewIntent,
			p_policy: AGENTIC_CHAT_WORKFLOW_POLICY_V1,
			p_policy_ref: AGENTIC_CHAT_WORKFLOW_V4_POLICY_REF,
			p_request_hash: await hashAgenticChatWorkflowRequestV1({
				clientTurnId: 'client-turn-1',
				streamRunId: 'stream-run-1',
				context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID },
				message,
				reviewIntent,
				policy: AGENTIC_CHAT_WORKFLOW_POLICY_V1,
				policyRef: AGENTIC_CHAT_WORKFLOW_V4_POLICY_REF
			}),
			p_cache_ref: null
		});
		// Changed text changes the request hash, so the database answers a conflict.
		expect((await args({ message: 'A different review question?' })).p_request_hash).not.toBe(
			built.p_request_hash
		);
	});
});

describe('workflow v4 admission RPC', () => {
	it('makes exactly one service RPC and parses a new admission', async () => {
		const input = await args();
		const rpc = client({ data: receipt(input) });

		await expect(admitAgenticChatWorkflowV4Turn({ client: rpc, args: input })).resolves.toEqual(
			{
				outcome: 'newly_admitted',
				turnRunId: input.p_turn_run_id,
				sessionId: SESSION_ID,
				streamRunId: 'stream-run-1',
				clientTurnId: 'client-turn-1',
				status: 'queued',
				sessionCreated: false,
				historyMessageCount: 4
			}
		);
		expect(rpc.rpc).toHaveBeenCalledOnce();
		expect(rpc.rpc).toHaveBeenCalledWith(
			'create_agentic_chat_workflow_turn_with_job_v1',
			input
		);
	});

	it('returns the original handle for a duplicate Send and conflicts on changed semantics', async () => {
		const input = await args();
		const original = 'f8000000-0000-4000-8000-000000000001';
		await expect(
			admitAgenticChatWorkflowV4Turn({
				client: client({
					data: {
						outcome: 'matching_duplicate',
						conflict_reason: null,
						execution_may_start: false,
						turn_run_id: original,
						session_id: SESSION_ID,
						user_message_id: IDS[1],
						input_artifact_id: IDS[2],
						queue_job_id: QUEUE_JOB_ID,
						correlation_id: IDS[3],
						stream_run_id: 'stream-run-1',
						client_turn_id: 'client-turn-1',
						execution_mode: 'worker_realtime',
						status: 'running'
					}
				}),
				args: input
			})
		).resolves.toMatchObject({
			outcome: 'matching_duplicate',
			turnRunId: original,
			status: 'running'
		});

		await expect(
			admitAgenticChatWorkflowV4Turn({
				client: client({
					data: {
						outcome: 'idempotency_conflict',
						conflict_reason: 'request_hash_mismatch',
						execution_may_start: false,
						turn_run_id: original
					}
				}),
				args: input
			})
		).resolves.toEqual({
			outcome: 'idempotency_conflict',
			conflictReason: 'request_hash_mismatch'
		});
	});

	it('parses capacity, access, and active-turn refusals', async () => {
		const input = await args();
		await expect(
			admitAgenticChatWorkflowV4Turn({
				client: client({
					data: {
						outcome: 'capacity_exceeded',
						execution_may_start: false,
						capacity_reason: 'max_queued',
						retry_after_seconds: 30,
						running_count: 1,
						queued_count: 100
					}
				}),
				args: input
			})
		).resolves.toEqual({
			outcome: 'capacity_exceeded',
			retryAfterSeconds: 30,
			runningCount: 1,
			queuedCount: 100
		});
		await expect(
			admitAgenticChatWorkflowV4Turn({
				client: client({
					data: {
						outcome: 'access_denied',
						execution_may_start: false,
						project_id: PROJECT_ID
					}
				}),
				args: input
			})
		).resolves.toEqual({ outcome: 'access_denied' });
		await expect(
			admitAgenticChatWorkflowV4Turn({
				client: client({
					data: { outcome: 'active_turn_conflict', execution_may_start: false }
				}),
				args: input
			})
		).resolves.toEqual({ outcome: 'active_turn_conflict' });
	});

	it('maps named SQL refusals and fails closed on any mismatched receipt', async () => {
		const input = await args();
		for (const [message, code] of [
			['agentic_chat_session_not_owned', 'session_conflict'],
			['agentic_chat_workflow_admission_session_scope_mismatch', 'session_conflict'],
			['agentic_chat_workflow_admission_invalid_message', 'invalid_command'],
			['agentic_chat_workflow_admission_request_hash_mismatch', 'database_error'],
			['connection terminated', 'database_error']
		] as const) {
			await expect(
				admitAgenticChatWorkflowV4Turn({
					client: client({ error: { code: 'P0001', message } }),
					args: input
				})
			).rejects.toMatchObject({ name: 'AgenticChatWorkflowV4AdmissionError', code });
		}
		for (const overrides of [
			{ request_hash: 'd'.repeat(64) },
			{ turn_run_id: 'f8000000-0000-4000-8000-000000000009' },
			{ stream_run_id: 'other-stream' },
			{ session_created: true },
			{ execution_may_start: true },
			{ outcome: 'surprise' }
		]) {
			await expect(
				admitAgenticChatWorkflowV4Turn({
					client: client({ data: receipt(input, overrides) }),
					args: input
				})
			).rejects.toMatchObject({ code: 'protocol_error' });
		}
	});
});

describe('document organization admission', () => {
	it('selects the read-capable profile only behind its separate server switch', async () => {
		const cmd = command({ reviewIntent: 'document_organization' });
		const eligibility = evaluateAgenticChatWorkflowV4Admission({
			policy: { ...ON, specialistWorkflowsEnabled: true, documentReadToolsEnabled: true },
			userId: USER_ID,
			command: cmd
		});
		if (!eligibility.eligible) throw new Error(eligibility.reason);
		const input = await buildAgenticChatWorkflowV4AdmissionArgs({
			userId: USER_ID,
			command: cmd,
			eligibility,
			transportDecisionId: DECISION_ID
		});
		expect(input.p_policy_ref).toBe('internal-document-organization:v3');
		expect(input.p_policy.modelTools).toBe('bounded_document_read_v1');
		expect(input.p_specialist_snapshot?.profileVersion).toBe(2);
		const db = client({ data: receipt(input) });
		await admitAgenticChatWorkflowV4Turn({ client: db, args: input });
		expect(db.rpc).toHaveBeenCalledExactlyOnceWith(
			'create_agentic_chat_document_review_turn_v3',
			input
		);
	});
	it('requires its own flag and admits a server-owned immutable snapshot with one RPC', async () => {
		const cmd = command({ reviewIntent: 'document_organization' });
		expect(
			evaluateAgenticChatWorkflowV4Admission({ policy: ON, userId: USER_ID, command: cmd })
		).toEqual({ eligible: false, reason: 'disabled' });
		const eligibility = evaluateAgenticChatWorkflowV4Admission({
			policy: { ...ON, specialistWorkflowsEnabled: true },
			userId: USER_ID,
			command: cmd
		});
		if (!eligibility.eligible) throw new Error(eligibility.reason);
		const input = await buildAgenticChatWorkflowV4AdmissionArgs({
			userId: USER_ID,
			command: cmd,
			eligibility,
			transportDecisionId: DECISION_ID
		});
		expect(input.p_policy_ref).toBe('internal-document-organization:v2');
		expect(input.p_specialist_snapshot?.slots.project_analyst.definition.id).toBe(
			'document_organizer'
		);
		expect(input.p_specialist_snapshot_hash).toMatch(/^[a-f0-9]{64}$/);
		expect(input.p_request_hash).not.toBe((await args()).p_request_hash);
		const db = client({ data: receipt(input) });
		await admitAgenticChatWorkflowV4Turn({ client: db, args: input });
		expect(db.rpc).toHaveBeenCalledExactlyOnceWith(
			'create_agentic_chat_document_review_turn_v2',
			input
		);
	});
});

it.each([
	{ read: true, handoff: true, version: 3, policy: 'v4', rpc: 'v4' },
	{ read: true, handoff: false, version: 2, policy: 'v3', rpc: 'v3' },
	{ read: false, handoff: true, version: 1, policy: 'v2', rpc: 'v2' }
])(
	'gates shared evidence independently: $read / $handoff',
	async ({ read, handoff, version, policy, rpc }) => {
		const cmd = command({ reviewIntent: 'document_organization' });
		const eligibility = evaluateAgenticChatWorkflowV4Admission({
			policy: {
				...ON,
				specialistWorkflowsEnabled: true,
				documentReadToolsEnabled: read,
				documentEvidenceHandoffEnabled: handoff
			},
			userId: USER_ID,
			command: cmd
		});
		if (!eligibility.eligible) throw new Error(eligibility.reason);
		const input = await buildAgenticChatWorkflowV4AdmissionArgs({
			userId: USER_ID,
			command: cmd,
			eligibility,
			transportDecisionId: DECISION_ID
		});
		expect(input.p_specialist_snapshot?.profileVersion).toBe(version);
		expect(input.p_policy_ref).toBe(`internal-document-organization:${policy}`);
		const db = client({ data: receipt(input) });
		await admitAgenticChatWorkflowV4Turn({ client: db, args: input });
		expect(db.rpc).toHaveBeenCalledExactlyOnceWith(
			`create_agentic_chat_document_review_turn_${rpc}`,
			input
		);
	}
);

it.each([false, true])('pins source-bound v3 independently of the v2 switch (%s)', async (v2) => {
	const policy = { ...ON, projectReviewV2Enabled: v2, projectReviewV3Enabled: true };
	const eligibility = evaluateAgenticChatWorkflowV4Admission({
		policy,
		userId: USER_ID,
		command: command()
	});
	if (!eligibility.eligible) throw new Error(eligibility.reason);
	const input = await buildAgenticChatWorkflowV4AdmissionArgs({
		userId: USER_ID,
		command: command(),
		eligibility,
		transportDecisionId: DECISION_ID
	});
	expect(input.p_policy_ref).toBe('internal-project-review:v3');
	expect(input.p_policy.version).toBe('agentic_chat_project_review_policy_v3');
	expect(
		evaluateAgenticChatWorkflowV4Admission({
			policy,
			userId: USER_ID,
			command: command({ reviewIntent: undefined })
		}).eligible
	).toBe(false);
});

it('selects project review v2 only through the server flag and keeps ordinary chat out', async () => {
	const policy = { ...ON, projectReviewV2Enabled: true };
	const eligibility = evaluateAgenticChatWorkflowV4Admission({
		policy,
		userId: USER_ID,
		command: command()
	});
	expect(eligibility).toMatchObject({ eligible: true, projectReviewV2: true });
	if (!eligibility.eligible) throw new Error(eligibility.reason);
	const v2 = await buildAgenticChatWorkflowV4AdmissionArgs({
		userId: USER_ID,
		command: command(),
		eligibility,
		transportDecisionId: DECISION_ID
	});
	expect(v2.p_policy_ref).toBe('internal-project-review:v2');
	expect(v2.p_policy.version).toBe('agentic_chat_project_review_policy_v2');
	expect(v2.p_specialist_snapshot).toBeUndefined();
	expect((await args()).p_policy_ref).toBe('internal-project-review:v1');
	expect(
		evaluateAgenticChatWorkflowV4Admission({
			policy,
			userId: USER_ID,
			command: command({ reviewIntent: null })
		})
	).toEqual({ eligible: false, reason: 'not_requested' });
});
