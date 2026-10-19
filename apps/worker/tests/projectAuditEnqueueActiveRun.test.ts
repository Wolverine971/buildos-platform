// apps/worker/tests/projectAuditEnqueueActiveRun.test.ts
//
// Tasker 111: the scheduled complete audit and the light end-of-day loop both
// fired at 04:00 UTC for Eastern owners and reviewed the same changes twice.
// The audit now waits when a loop run for the project is active.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	from: vi.fn(),
	rpc: vi.fn(),
	evaluateProjectAuditTrigger: vi.fn(),
	recordProjectAuditTriggerEvaluation: vi.fn(),
	hasActiveProjectLoopRun: vi.fn()
}));

vi.mock('../src/lib/supabase', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('../src/config/projectLoops', () => ({ PROJECT_LOOPS_ENABLED: true }));
vi.mock('../src/lib/posthog', () => ({ captureWorkerEvent: vi.fn() }));
vi.mock('@buildos/shared-agent-ops/project-audits', () => ({
	auditSizeClassForInsert: vi.fn(),
	buildProjectAuditTriggerSnapshot: vi.fn(),
	evaluateProjectAuditTrigger: mocks.evaluateProjectAuditTrigger,
	recordProjectAuditTriggerEvaluation: mocks.recordProjectAuditTriggerEvaluation
}));
vi.mock('../src/workers/project-loop/enqueue', () => ({
	hasActiveProjectLoopRun: mocks.hasActiveProjectLoopRun,
	resolveProjectLoopOwnerUserIds: vi.fn()
}));

import { queueProjectAuditFromWorker } from '../src/workers/project-loop/auditEnqueue';

function queuedEvaluation() {
	return {
		evaluation: {
			project_id: 'project-1',
			decision: 'queued',
			reason_summary: 'Scheduled audit due.',
			project_size_class: 'medium'
		},
		snapshot: { projectId: 'project-1' },
		activeAuditId: null,
		lastAudit: null
	};
}

describe('scheduled audit vs an active project loop run', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.evaluateProjectAuditTrigger.mockResolvedValue(queuedEvaluation());
		mocks.recordProjectAuditTriggerEvaluation.mockResolvedValue('evaluation-1');
		mocks.from.mockImplementation((table: string) => {
			throw new Error(`reached ${table}`);
		});
	});

	it('waits for the next scan instead of reviewing the same changes twice', async () => {
		mocks.hasActiveProjectLoopRun.mockResolvedValue(true);

		const result = await queueProjectAuditFromWorker({
			projectId: 'project-1',
			userId: 'user-1',
			triggerReason: 'scheduled'
		});

		expect(result).toMatchObject({ queued: false, decision: 'skipped_active_run' });
		expect(mocks.recordProjectAuditTriggerEvaluation).toHaveBeenCalledWith(
			expect.objectContaining({
				evaluation: expect.objectContaining({ decision: 'skipped_active_run' })
			})
		);
		// No audit session or run was created.
		expect(mocks.from).not.toHaveBeenCalled();
	});

	it('proceeds to create the audit when no loop run is active', async () => {
		mocks.hasActiveProjectLoopRun.mockResolvedValue(false);

		await queueProjectAuditFromWorker({
			projectId: 'project-1',
			userId: 'user-1',
			triggerReason: 'scheduled'
		}).catch(() => undefined);

		expect(mocks.from).toHaveBeenCalledWith('chat_sessions');
	});
});

describe('scheduled audits wait for an answer to the latest actionable audit', () => {
	function arrange(
		statuses: Array<string | { status: string; decided_at: string | null }>,
		error: { message: string } | null = null
	) {
		mocks.evaluateProjectAuditTrigger.mockResolvedValue({
			...queuedEvaluation(),
			lastAudit: { id: 'last-audit', status: 'ready' }
		});
		mocks.hasActiveProjectLoopRun.mockResolvedValue(false);
		mocks.recordProjectAuditTriggerEvaluation.mockResolvedValue('evaluation-1');
		mocks.rpc.mockResolvedValue({ data: 'queue-record', error: null });
		mocks.from.mockImplementation((table: string) => {
			const result = {
				data:
					table === 'project_audit_suggestions'
						? statuses.map((suggestion) => ({
								project_suggestions:
									typeof suggestion === 'string'
										? { status: suggestion, decided_at: null }
										: suggestion
							}))
						: table === 'queue_jobs'
							? {
									queue_job_id: 'queue-1',
									metadata: {
										mode: 'complete_audit',
										runId: 'run-1',
										auditId: 'audit-1'
									}
								}
							: {
									id:
										table === 'chat_sessions'
											? 'chat-1'
											: table === 'project_loop_runs'
												? 'run-1'
												: 'audit-1'
								},
				error: table === 'project_audit_suggestions' ? error : null
			};
			const query: any = {
				select: vi.fn(() => query),
				insert: vi.fn(() => query),
				update: vi.fn(() => query),
				eq: vi.fn(() => query),
				single: vi.fn(async () => result),
				maybeSingle: vi.fn(async () => result),
				then: (resolve: (value: unknown) => unknown) =>
					Promise.resolve(result).then(resolve)
			};
			return query;
		});
	}

	beforeEach(() => vi.clearAllMocks());

	it.each([['pending'], ['pending', 'superseded'], ['pending', 'failed']])(
		'skips unanswered recommendations: %j',
		async (...statuses) => {
			arrange(statuses);
			await expect(
				queueProjectAuditFromWorker({
					projectId: 'project-1',
					userId: 'user-1',
					triggerReason: 'scheduled'
				})
			).resolves.toMatchObject({ queued: false, decision: 'skipped_unanswered_audit' });
			expect(mocks.from).not.toHaveBeenCalledWith('chat_sessions');
			expect(mocks.rpc).not.toHaveBeenCalled();
		}
	);

	it.each(['approved', 'delegated', 'applied', 'addressed', 'rejected'])(
		'schedules when one recommendation was %s',
		async (status) => {
			arrange(['pending', status]);
			await expect(
				queueProjectAuditFromWorker({
					projectId: 'project-1',
					userId: 'user-1',
					triggerReason: 'scheduled'
				})
			).resolves.toMatchObject({ queued: true, auditId: 'audit-1' });
		}
	);

	it('recognizes user engagement even when applying the approved recommendation failed', async () => {
		arrange(['pending', { status: 'failed', decided_at: '2026-10-19T12:00:00Z' }]);
		await expect(
			queueProjectAuditFromWorker({
				projectId: 'project-1',
				userId: 'user-1',
				triggerReason: 'scheduled'
			})
		).resolves.toMatchObject({ queued: true });
	});

	it('does not count an automatic supersession timestamp as user engagement', async () => {
		arrange(['pending', { status: 'superseded', decided_at: '2026-10-19T12:00:00Z' }]);
		await expect(
			queueProjectAuditFromWorker({
				projectId: 'project-1',
				userId: 'user-1',
				triggerReason: 'scheduled'
			})
		).resolves.toMatchObject({ queued: false, decision: 'skipped_unanswered_audit' });
	});

	it.each(['manual', 'burst', 'critical_change'] as const)(
		'does not apply the scheduled engagement gate to %s',
		async (triggerReason) => {
			arrange(['pending']);
			await expect(
				queueProjectAuditFromWorker({
					projectId: 'project-1',
					userId: 'user-1',
					triggerReason
				})
			).resolves.toMatchObject({ queued: true });
			expect(mocks.from).not.toHaveBeenCalledWith('project_audit_suggestions');
		}
	);

	it.each([[], ['superseded']])(
		'allows an audit with no actionable recommendations: %j',
		async (...statuses) => {
			arrange(statuses);
			await expect(
				queueProjectAuditFromWorker({
					projectId: 'project-1',
					userId: 'user-1',
					triggerReason: 'scheduled'
				})
			).resolves.toMatchObject({ queued: true });
		}
	);

	it('does not spend on a new scheduled audit when the recommendation read fails', async () => {
		arrange(['pending'], { message: 'recommendation read unavailable' });
		await expect(
			queueProjectAuditFromWorker({
				projectId: 'project-1',
				userId: 'user-1',
				triggerReason: 'scheduled'
			})
		).rejects.toThrow('recommendation read unavailable');
		expect(mocks.rpc).not.toHaveBeenCalled();
	});
});
