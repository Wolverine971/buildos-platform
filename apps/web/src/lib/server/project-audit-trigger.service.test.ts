// apps/web/src/lib/server/project-audit-trigger.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createAdminSupabaseClient: vi.fn(),
	addQueueJobWithPublicId: vi.fn(),
	captureServerEvent: vi.fn(),
	evaluateProjectAuditTrigger: vi.fn(),
	recordProjectAuditTriggerEvaluation: vi.fn(),
	buildProjectAuditTriggerSnapshot: vi.fn(() => ({ snapshot: true })),
	auditSizeClassForInsert: vi.fn(() => 'small_eligible')
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));

vi.mock('$lib/server/queue-job-id', () => ({
	addQueueJobWithPublicId: mocks.addQueueJobWithPublicId
}));

vi.mock('$lib/server/posthog', () => ({
	captureServerEvent: mocks.captureServerEvent
}));

vi.mock('$lib/utils/logger', () => ({
	createLogger: () => ({
		warn: vi.fn(),
		info: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('@buildos/shared-agent-ops/project-audits', () => ({
	auditSizeClassForInsert: mocks.auditSizeClassForInsert,
	buildProjectAuditTriggerSnapshot: mocks.buildProjectAuditTriggerSnapshot,
	evaluateProjectAuditTrigger: mocks.evaluateProjectAuditTrigger,
	recordProjectAuditTriggerEvaluation: mocks.recordProjectAuditTriggerEvaluation
}));

import { queueProjectAudit } from './project-audit-trigger.service';

type Operation = {
	table: string;
	action: 'select' | 'insert' | 'update' | null;
	payload: unknown;
	filters: Array<{ column: string; value: unknown }>;
};

function createSupabaseMock() {
	const operations: Operation[] = [];

	class QueryBuilderMock {
		private action: Operation['action'] = null;
		private payload: unknown = null;
		private filters: Array<{ column: string; value: unknown }> = [];

		constructor(private readonly table: string) {}

		select() {
			if (!this.action) this.action = 'select';
			return this;
		}

		insert(payload: unknown) {
			this.action = 'insert';
			this.payload = payload;
			return this;
		}

		update(payload: unknown) {
			this.action = 'update';
			this.payload = payload;
			return this;
		}

		eq(column: string, value: unknown) {
			this.filters.push({ column, value });
			return this;
		}

		private recordOperation() {
			operations.push({
				table: this.table,
				action: this.action,
				payload: this.payload,
				filters: [...this.filters]
			});
		}

		private resolve() {
			this.recordOperation();

			if (this.table === 'chat_sessions' && this.action === 'insert') {
				return Promise.resolve({ data: { id: 'chat-1' }, error: null });
			}
			if (this.table === 'chat_sessions_projects' && this.action === 'insert') {
				return Promise.resolve({ data: null, error: null });
			}
			if (this.table === 'project_loop_runs' && this.action === 'insert') {
				return Promise.resolve({ data: { id: 'run-new' }, error: null });
			}
			if (this.table === 'project_audits' && this.action === 'insert') {
				return Promise.resolve({ data: { id: 'audit-new' }, error: null });
			}
			if (this.action === 'update') {
				return Promise.resolve({ data: null, error: null });
			}

			return Promise.resolve({ data: null, error: null });
		}

		single() {
			return this.resolve();
		}

		throwOnError() {
			return this.resolve().then(({ error }) => {
				if (error) throw error;
				return { data: null, error: null };
			});
		}

		then<TResult1 = any, TResult2 = never>(
			onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
			onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
		) {
			return this.resolve().then(onfulfilled, onrejected);
		}
	}

	const supabase = {
		from: vi.fn((table: string) => new QueryBuilderMock(table))
	};

	return { supabase, operations };
}

describe('queueProjectAudit', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.evaluateProjectAuditTrigger.mockResolvedValue({
			evaluation: {
				decision: 'queued',
				reason_summary: 'Audit is eligible.',
				project_size_class: 'small_eligible'
			},
			snapshot: { fingerprint: 'snapshot-fingerprint' }
		});
		mocks.recordProjectAuditTriggerEvaluation.mockResolvedValue('evaluation-1');
		mocks.addQueueJobWithPublicId.mockResolvedValue({
			queueJobId: 'queue-job-existing',
			metadata: {
				mode: 'complete_audit',
				runId: 'run-existing',
				auditId: 'audit-existing',
				projectId: 'project-1'
			}
		});
	});

	it('fails freshly-created audit rows when queue dedup returns an existing audit job', async () => {
		const { supabase, operations } = createSupabaseMock();
		mocks.createAdminSupabaseClient.mockReturnValue(supabase);

		const result = await queueProjectAudit({
			projectId: 'project-1',
			userId: 'user-1',
			triggerReason: 'manual'
		});

		expect(result).toMatchObject({
			queued: false,
			runId: 'run-existing',
			auditId: 'audit-existing',
			jobId: 'queue-job-existing',
			decision: 'skipped_duplicate',
			reason: 'already_running'
		});

		const failedRunUpdate = operations.find(
			(operation) =>
				operation.table === 'project_loop_runs' &&
				operation.action === 'update' &&
				(operation.payload as Record<string, unknown>).status === 'failed'
		);
		const failedAuditUpdate = operations.find(
			(operation) =>
				operation.table === 'project_audits' &&
				operation.action === 'update' &&
				(operation.payload as Record<string, unknown>).status === 'failed'
		);

		expect(failedRunUpdate?.filters).toEqual([
			{ column: 'id', value: 'run-new' },
			{ column: 'status', value: 'queued' }
		]);
		expect(failedAuditUpdate?.filters).toEqual([
			{ column: 'id', value: 'audit-new' },
			{ column: 'status', value: 'queued' }
		]);
		expect(mocks.captureServerEvent).toHaveBeenCalledWith(
			'user-1',
			'project_audit_skipped',
			expect.objectContaining({
				decision: 'skipped_duplicate',
				audit_id: 'audit-existing',
				run_id: 'run-existing'
			})
		);
	});
});
