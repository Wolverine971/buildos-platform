// apps/worker/tests/projectLoopEnqueueGate.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	from: vi.fn()
}));

vi.mock('../src/lib/supabase', () => ({
	supabase: { from: mocks.from }
}));

vi.mock('../src/config/projectLoops', () => ({
	PROJECT_LOOPS_ENABLED: true
}));

import { enqueueProjectLoop } from '../src/workers/project-loop/enqueue';

function queryResult(result: { data: unknown; error: unknown }) {
	const builder: any = {
		select: vi.fn(() => builder),
		eq: vi.fn(() => builder),
		in: vi.fn(() => builder),
		gt: vi.fn(() => builder),
		order: vi.fn(() => builder),
		limit: vi.fn(() => builder),
		maybeSingle: vi.fn(async () => result),
		then: vi.fn((resolve: (value: typeof result) => unknown) =>
			Promise.resolve(resolve(result))
		)
	};
	return builder;
}

describe('project loop unresolved-brief trigger gate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('skips an automatic review when the unresolved manager brief has no newer evidence', async () => {
		let projectRunQuery = 0;
		mocks.from.mockImplementation((table: string) => {
			if (table === 'project_loop_runs') {
				projectRunQuery += 1;
				if (projectRunQuery === 1) return queryResult({ data: null, error: null });
				return queryResult({
					data: {
						id: 'run-1',
						status: 'waiting_review',
						created_at: '2026-08-14T12:00:00.000Z',
						finished_at: '2026-08-14T12:01:00.000Z',
						brief: { version: 2, attention_level: 'decision' }
					},
					error: null
				});
			}
			if (table === 'project_review_signals') {
				return queryResult({ data: [], error: null });
			}
			throw new Error(`Unexpected table after trigger gate: ${table}`);
		});

		const result = await enqueueProjectLoop({
			projectId: 'project-1',
			userId: 'user-1',
			triggerReason: 'end_of_day'
		});

		expect(result).toEqual({ queued: false, reason: 'unresolved_brief_unchanged' });
		expect(mocks.from).not.toHaveBeenCalledWith('chat_sessions');
	});
});
