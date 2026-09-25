// apps/worker/tests/projectLoopLensInputs.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	from: vi.fn()
}));

vi.mock('../src/lib/supabase', () => ({
	supabase: { from: mocks.from }
}));

import { loadUnchangedLensInputs } from '../src/workers/project-loop/lensInputs';

function queryResult(result: { data: unknown; error: unknown }) {
	const builder: any = {
		select: vi.fn(() => builder),
		eq: vi.fn(() => builder),
		neq: vi.fn(() => builder),
		in: vi.fn(() => builder),
		not: vi.fn(() => builder),
		gt: vi.fn(() => builder),
		order: vi.fn(() => builder),
		limit: vi.fn(() => builder),
		maybeSingle: vi.fn(async () => result),
		then: (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result))
	};
	return builder;
}

const LAST_REVIEW = '2026-09-24T04:02:00.000Z';

function mockTables(params: {
	lastReview?: string | null;
	changedDocuments?: boolean;
	changedTasks?: boolean;
	projectUpdatedAt?: string;
}) {
	mocks.from.mockImplementation((table: string) => {
		if (table === 'project_loop_runs') {
			return queryResult({
				data:
					params.lastReview === null
						? null
						: { finished_at: params.lastReview ?? LAST_REVIEW },
				error: null
			});
		}
		if (table === 'onto_documents') {
			return queryResult({ data: params.changedDocuments ? [{ id: 'doc-1' }] : [], error: null });
		}
		if (table === 'onto_tasks') {
			return queryResult({ data: params.changedTasks ? [{ id: 'task-1' }] : [], error: null });
		}
		if (table === 'onto_projects') {
			return queryResult({
				data: { updated_at: params.projectUpdatedAt ?? '2026-09-20T00:00:00.000Z' },
				error: null
			});
		}
		throw new Error(`Unexpected table: ${table}`);
	});
}

describe('loadUnchangedLensInputs (tasker 108)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('marks documents and tasks unchanged when nothing moved since the last review', async () => {
		mockTables({});
		await expect(
			loadUnchangedLensInputs({ projectId: 'p1', runId: 'r2', triggerReason: 'end_of_day' })
		).resolves.toEqual({ documents: true, tasks: true });
	});

	it('runs doc organization after a document edit or a doc-tree move on the project row', async () => {
		mockTables({ changedDocuments: true });
		await expect(
			loadUnchangedLensInputs({ projectId: 'p1', runId: 'r2', triggerReason: 'end_of_day' })
		).resolves.toEqual({ documents: false, tasks: true });

		mockTables({ projectUpdatedAt: '2026-09-24T12:00:00.000Z' });
		await expect(
			loadUnchangedLensInputs({ projectId: 'p1', runId: 'r2', triggerReason: 'burst' })
		).resolves.toEqual({ documents: false, tasks: true });
	});

	it('runs task conflicts after a task edit', async () => {
		mockTables({ changedTasks: true });
		await expect(
			loadUnchangedLensInputs({ projectId: 'p1', runId: 'r2', triggerReason: 'end_of_day' })
		).resolves.toEqual({ documents: true, tasks: false });
	});

	it('runs every lens for manual runs, first reviews, and read failures', async () => {
		mockTables({});
		await expect(
			loadUnchangedLensInputs({ projectId: 'p1', runId: 'r2', triggerReason: 'manual' })
		).resolves.toEqual({ documents: false, tasks: false });
		expect(mocks.from).not.toHaveBeenCalled();

		mockTables({ lastReview: null });
		await expect(
			loadUnchangedLensInputs({ projectId: 'p1', runId: 'r2', triggerReason: 'end_of_day' })
		).resolves.toEqual({ documents: false, tasks: false });

		mocks.from.mockImplementation(() => {
			throw new Error('network down');
		});
		await expect(
			loadUnchangedLensInputs({ projectId: 'p1', runId: 'r2', triggerReason: 'end_of_day' })
		).resolves.toEqual({ documents: false, tasks: false });
	});
});
