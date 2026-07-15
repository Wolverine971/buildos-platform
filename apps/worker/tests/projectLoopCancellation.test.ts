// apps/worker/tests/projectLoopCancellation.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const state = {
		data: [] as Array<Record<string, unknown>>,
		error: null as { code?: string; message: string } | null
	};

	return {
		state,
		insert: vi.fn(() => ({
			select: vi.fn(async () => ({ data: state.data, error: state.error }))
		}))
	};
});

vi.mock('../src/config/projectLoops', () => ({
	PROJECT_LOOPS_ENABLED: true
}));

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		from: vi.fn(() => ({ insert: mocks.insert }))
	}
}));

vi.mock('../src/lib/posthog', () => ({
	captureWorkerEvent: vi.fn()
}));

vi.mock('../src/lib/errorLogger', () => ({
	logWorkerError: vi.fn()
}));

vi.mock('../src/lib/services/smart-llm-service', () => ({
	SmartLLMService: vi.fn()
}));

vi.mock('../src/workers/project-loop/auditEnqueue', () => ({
	processProjectAuditTriggerEvaluationJob: vi.fn(),
	queueProjectAuditFromWorker: vi.fn()
}));

import {
	insertProjectLoopSuggestionRows,
	isProjectLoopCancellationInsertError
} from '../src/workers/project-loop/projectLoopWorker';

const row = {
	run_id: 'run-1',
	project_id: 'project-1',
	kind: 'drift' as const,
	risk_tier: 1,
	title: 'Resolve project drift',
	operations: []
};

describe('project loop cancellation during suggestion persistence', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.state.data = [];
		mocks.state.error = null;
	});

	it.each(['project_suggestions_run_id_fkey', 'project_suggestions_project_id_fkey'])(
		'treats %s as cancellation after the run was claimed',
		async (constraint) => {
			mocks.state.error = {
				code: '23503',
				message: `insert or update on table "project_suggestions" violates foreign key constraint "${constraint}"`
			};
			const log = vi.fn(async () => undefined);

			const result = await insertProjectLoopSuggestionRows({
				rows: [row],
				runId: 'run-1',
				projectId: 'project-1',
				log
			});

			expect(result).toEqual({ cancelled: true, suggestions: [] });
			expect(log).toHaveBeenCalledWith(
				'Project loop run run-1 for project project-1 was deleted before suggestions were written; treating the work as cancelled.'
			);
		}
	);

	it('does not suppress unrelated foreign-key failures', async () => {
		const error = {
			code: '23503',
			message:
				'insert or update on table "project_suggestions" violates foreign key constraint "project_suggestions_depends_on_fkey"'
		};
		mocks.state.error = error;

		await expect(
			insertProjectLoopSuggestionRows({
				rows: [row],
				runId: 'run-1',
				projectId: 'project-1',
				log: vi.fn(async () => undefined)
			})
		).rejects.toMatchObject({
			message: `Failed to insert suggestions: ${error.message}`,
			code: '23503'
		});
	});

	it('requires the PostgreSQL foreign-key error code', () => {
		expect(
			isProjectLoopCancellationInsertError({
				message:
					'insert or update on table "project_suggestions" violates foreign key constraint "project_suggestions_run_id_fkey"'
			})
		).toBe(false);
	});
});
