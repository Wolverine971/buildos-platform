// apps/web/src/routes/api/agent/v2/turns/published-review-admission.test.ts
import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
	createSpecialistWorkbenchDraftV1,
	compileSpecialistWorkbenchVersionV1,
	hashSpecialistWorkbenchValue
} from '@buildos/agentic-chat-runtime/specialists';
import { admitWorkflowReviewTurnIfEligible } from './workflow-review-admission';
import { workerAdmissionRequestSchema } from './worker-admission-schema';
const userId = 'af000000-0000-4000-8000-000000000001';
const projectId = 'af000000-0000-4000-8000-000000000002';
async function fixture() {
	const snapshot = await compileSpecialistWorkbenchVersionV1({
		draftId: randomUUID(),
		draftRevision: 1,
		version: 1,
		draft: createSpecialistWorkbenchDraftV1()
	});
	const snapshotHash = await hashSpecialistWorkbenchValue(snapshot);
	const result = {
		data: { draft_id: snapshot.draftId, version: 1, snapshot_hash: snapshotHash, snapshot },
		error: null
	};
	const query = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn(async () => result)
	};
	const workbenchClient = { from: vi.fn(() => query), rpc: vi.fn() };
	const rpc = vi.fn(async (_name: string, a: any) => ({
		data: {
			outcome: 'newly_admitted',
			execution_may_start: false,
			turn_run_id: a.p_turn_run_id,
			session_id: randomUUID(),
			session_created: true,
			user_message_id: a.p_user_message_id,
			input_artifact_id: a.p_request_artifact_id,
			queue_job_id: randomUUID(),
			correlation_id: a.p_correlation_id,
			stream_run_id: a.p_stream_run_id,
			client_turn_id: a.p_client_turn_id,
			execution_mode: 'worker_realtime',
			status: 'queued',
			request_hash: a.p_request_hash,
			history_message_count: 0
		},
		error: null
	}));
	const input = {
		userId,
		environment: {
			AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED: 'true',
			AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED: 'true',
			AGENTIC_CHAT_DOCUMENT_READ_TOOLS_ENABLED: 'true',
			AGENTIC_CHAT_PUBLISHED_SPECIALISTS_ENABLED: 'true',
			AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS: userId
		},
		command: {
			clientTurnId: randomUUID(),
			streamRunId: randomUUID(),
			sessionId: null,
			context: { type: 'project', entityId: projectId, projectId },
			message: 'Suggest a better document structure.',
			attachments: [],
			projectFocus: null,
			voiceNoteGroupId: null,
			reviewIntent: 'document_organization' as const,
			publishedSpecialist: { draftId: snapshot.draftId, version: 1, snapshotHash }
		},
		transportDecisionId: randomUUID(),
		client: { rpc },
		workbenchClient: workbenchClient as never
	};
	return { input, result, query, rpc, snapshot, workbenchClient };
}
describe('published specialist route admission', () => {
	it('carries an owner-scoped Jev decision into the immutable admitted snapshot', async () => {
		const f = await fixture();
		const id = randomUUID();
		const candidate = {
			draftId: f.snapshot.draftId,
			version: 1,
			draftRevision: 1,
			snapshotHash: f.result.data.snapshot_hash,
			name: f.snapshot.definition.label,
			createdAt: '2026-09-22T00:00:00Z',
			description: f.snapshot.definition.description,
			expertise: [...f.snapshot.definition.expertise],
			documentReadEnabled: true
		};
		const input = {
			version: 'specialist_recommendation_input_v1',
			policy: 'jev_specialist_choice_v1',
			projectId,
			question: f.input.command.message,
			candidates: [candidate]
		};
		const result = {
			status: 'selected',
			selected: candidate,
			ranking: [
				{ draftId: candidate.draftId, version: 1, name: candidate.name, probability: 0.9 }
			],
			confidence: 0.9,
			margin: 0.8,
			reason: 'Best match',
			durationMs: 10,
			costUsd: 0.0001,
			provider: null
		};
		const receipt = {
			id,
			input,
			inputHash: await hashSpecialistWorkbenchValue(input),
			result,
			resultHash: await hashSpecialistWorkbenchValue(result)
		};
		f.workbenchClient.rpc.mockResolvedValue({
			data: { outcome: 'selected', receipt },
			error: null
		});
		Object.assign(f.input.command.publishedSpecialist, { selectionDecisionId: id });
		Object.assign(f.input.environment, { AGENTIC_CHAT_JEV_RECOMMENDATIONS_ENABLED: 'true' });
		const response = await admitWorkflowReviewTurnIfEligible(f.input);
		expect(response?.status).toBe(202);
		expect(f.workbenchClient.rpc).toHaveBeenCalledWith('get_specialist_recommendation_v1', {
			p_user_id: userId,
			p_project_id: projectId,
			p_id: id,
			p_question: f.input.command.message,
			p_draft_id: candidate.draftId,
			p_version: 1,
			p_snapshot_hash: candidate.snapshotHash
		});
		expect(f.rpc.mock.calls[0]![1].p_specialist_snapshot.recommendation).toEqual(receipt);
	});
	it('scopes the catalog read to the owner and exact version, then admits the copied snapshot', async () => {
		const f = await fixture();
		const response = await admitWorkflowReviewTurnIfEligible(f.input);
		expect(response?.status).toBe(202);
		expect(f.query.eq.mock.calls).toEqual([
			['user_id', userId],
			['draft_id', f.snapshot.draftId],
			['version', 1]
		]);
		expect(f.rpc).toHaveBeenCalledOnce();
		const [name, args] = f.rpc.mock.calls[0]!;
		expect(name).toBe('create_agentic_chat_published_review_turn_v1');
		expect(args.p_specialist_snapshot.published.snapshot).toEqual(f.snapshot);
	});
	it.each([
		'AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED',
		'AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED',
		'AGENTIC_CHAT_DOCUMENT_READ_TOOLS_ENABLED',
		'AGENTIC_CHAT_PUBLISHED_SPECIALISTS_ENABLED',
		'AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS'
	])('rejects disabled rollout %s before reads or dispatch', async (key) => {
		const f = await fixture();
		(f.input.environment as any)[key] = '';
		expect((await admitWorkflowReviewTurnIfEligible(f.input))?.status).toBe(409);
		expect(f.query.select).not.toHaveBeenCalled();
		expect(f.rpc).not.toHaveBeenCalled();
	});
	it.each(['missing', 'hash', 'identity'])(
		'rejects %s selection and preserves draft error contract',
		async (mode) => {
			const f = await fixture();
			if (mode === 'missing') f.result.data = null as never;
			if (mode === 'hash') f.input.command.publishedSpecialist.snapshotHash = '0'.repeat(64);
			if (mode === 'identity') f.input.command.publishedSpecialist.version = 2;
			const response = await admitWorkflowReviewTurnIfEligible(f.input);
			expect(response?.status).toBe(409);
			expect(JSON.stringify(await response?.json())).toContain('WORKFLOW_REVIEW_UNAVAILABLE');
			expect(f.rpc).not.toHaveBeenCalled();
		}
	);
	it('rejects custom references on ordinary chat and client-supplied definitions', async () => {
		const f = await fixture();
		const body = { ...f.input.command, leaseToken: 'valid-lease-token' };
		expect(workerAdmissionRequestSchema.safeParse(body).success).toBe(true);
		expect(
			workerAdmissionRequestSchema.safeParse({ ...body, reviewIntent: null }).success
		).toBe(false);
		expect(
			workerAdmissionRequestSchema.safeParse({
				...body,
				publishedSpecialist: {
					...body.publishedSpecialist,
					definition: f.snapshot.definition
				}
			}).success
		).toBe(false);
	});
});
