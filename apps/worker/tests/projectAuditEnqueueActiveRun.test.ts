// apps/worker/tests/projectAuditEnqueueActiveRun.test.ts
//
// Tasker 111: the scheduled complete audit and the light end-of-day loop both
// fired at 04:00 UTC for Eastern owners and reviewed the same changes twice.
// The audit now waits when a loop run for the project is active.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	from: vi.fn(),
	evaluateProjectAuditTrigger: vi.fn(),
	recordProjectAuditTriggerEvaluation: vi.fn(),
	hasActiveProjectLoopRun: vi.fn()
}));

vi.mock('../src/lib/supabase', () => ({ supabase: { from: mocks.from, rpc: vi.fn() } }));
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
