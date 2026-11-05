// apps/worker/tests/projectLoopJobIdentity.test.ts
// A buildos_project_loop job may act only for its queue row owner, on a project
// that owner can edit and a run that owner created.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectLoopJobMetadata } from '@buildos/shared-types';
import type { ProcessingJob } from '../src/lib/supabaseQueue';

const mocks = vi.hoisted(() => {
	const state = {
		actors: { 'user-1': 'actor-1', 'user-2': 'actor-2' } as Record<string, string>,
		// actor id -> project ids with write access
		access: { 'actor-1': ['project-1'], 'actor-2': ['project-2'] } as Record<string, string[]>,
		runs: {
			'run-1': { user_id: 'user-1', project_id: 'project-1' },
			'run-2': { user_id: 'user-2', project_id: 'project-2' }
		} as Record<string, { user_id: string; project_id: string }>,
		writes: [] as Array<{ table: string; op: string }>
	};
	const from = vi.fn((table: string) => {
		const filters: Record<string, unknown> = {};
		const query: any = {};
		for (const op of ['update', 'insert', 'upsert', 'delete'])
			query[op] = vi.fn(() => {
				state.writes.push({ table, op });
				return query;
			});
		query.select = vi.fn(() => query);
		query.eq = vi.fn((column: string, value: unknown) => {
			filters[column] = value;
			return query;
		});
		query.maybeSingle = vi.fn(async () => {
			if (table === 'onto_actors') {
				const id = state.actors[filters.user_id as string];
				return { data: id ? { id } : null, error: null };
			}
			if (table === 'project_loop_runs') {
				return { data: state.runs[filters.id as string] ?? null, error: null };
			}
			return { data: null, error: null };
		});
		return query;
	});
	const rpc = vi.fn(async (name: string, args: Record<string, string>) => {
		if (name !== 'actor_has_project_member_access') return { data: null, error: null };
		return {
			data: (state.access[args.p_actor_id] ?? []).includes(args.p_project_id),
			error: null
		};
	});
	return {
		state,
		from,
		rpc,
		processProjectAuditTriggerEvaluationJob: vi.fn(async () => ({
			queued: true,
			runId: 'run-new',
			auditId: 'audit-new'
		}))
	};
});

vi.mock('../src/config/projectLoops', () => ({ PROJECT_LOOPS_ENABLED: true }));
vi.mock('../src/lib/supabase', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('../src/lib/posthog', () => ({ captureWorkerEvent: vi.fn() }));
vi.mock('../src/lib/errorLogger', () => ({ logWorkerError: vi.fn() }));
vi.mock('../src/lib/services/smart-llm-service', () => ({ SmartLLMService: vi.fn() }));
vi.mock('../src/workers/project-loop/enqueue', () => ({ enqueueProjectLoop: vi.fn() }));
vi.mock('../src/workers/project-loop/auditEnqueue', () => ({
	processProjectAuditTriggerEvaluationJob: mocks.processProjectAuditTriggerEvaluationJob,
	queueProjectAuditFromWorker: vi.fn()
}));

import { projectLoopJobRefusal } from '../src/workers/project-loop/jobIdentity';
import { processProjectLoopJob } from '../src/workers/project-loop/projectLoopWorker';

function job(
	userId: string,
	data: Partial<ProjectLoopJobMetadata>
): ProcessingJob<ProjectLoopJobMetadata> {
	return {
		id: 'queue-job-1',
		correlationId: null,
		signal: new AbortController().signal,
		userId,
		attempts: 0,
		data: { projectId: 'project-1', userId, triggerReason: 'manual', ...data },
		updateProgress: vi.fn(async () => undefined),
		log: vi.fn(async () => undefined)
	};
}

const client = () => ({ from: mocks.from, rpc: mocks.rpc }) as never;

beforeEach(() => {
	vi.clearAllMocks();
	mocks.state.writes.length = 0;
});

describe('projectLoopJobRefusal', () => {
	it('allows the queue owner on their own project and run', async () => {
		expect(await projectLoopJobRefusal(client(), job('user-1', { runId: 'run-1' }))).toBeNull();
	});

	it('refuses metadata naming another user', async () => {
		expect(await projectLoopJobRefusal(client(), job('user-1', { userId: 'user-2' }))).toBe(
			'metadata_user_mismatch'
		);
	});

	it("refuses another user's project", async () => {
		expect(
			await projectLoopJobRefusal(client(), job('user-1', { projectId: 'project-2' }))
		).toBe('no_project_access');
	});

	it("refuses another user's run inside a project the owner can edit", async () => {
		mocks.state.access['actor-1'] = ['project-1', 'project-2'];
		try {
			expect(
				await projectLoopJobRefusal(
					client(),
					job('user-1', { projectId: 'project-2', runId: 'run-2' })
				)
			).toBe('run_not_owned');
		} finally {
			mocks.state.access['actor-1'] = ['project-1'];
		}
	});

	it('refuses a user with no actor', async () => {
		expect(await projectLoopJobRefusal(client(), job('user-3', {}))).toBe('no_project_access');
	});
});

describe('processProjectLoopJob owner gate', () => {
	it("skips a manual audit trigger on another user's project without touching it", async () => {
		const result = await processProjectLoopJob(
			job('user-1', {
				mode: 'complete_audit_trigger_evaluation',
				projectId: 'project-2'
			})
		);
		expect(result).toEqual({ success: true, skipped: true });
		expect(mocks.processProjectAuditTriggerEvaluationJob).not.toHaveBeenCalled();
		expect(mocks.state.writes).toEqual([]);
	});

	it('skips a run named in metadata that belongs to another user', async () => {
		mocks.state.access['actor-1'] = ['project-1', 'project-2'];
		try {
			const result = await processProjectLoopJob(
				job('user-1', { projectId: 'project-2', runId: 'run-2' })
			);
			expect(result).toEqual({ success: true, skipped: true });
			expect(mocks.state.writes).toEqual([]);
		} finally {
			mocks.state.access['actor-1'] = ['project-1'];
		}
	});

	it('still runs the same-user audit trigger', async () => {
		const result = await processProjectLoopJob(
			job('user-1', { mode: 'complete_audit_trigger_evaluation' })
		);
		expect(result).toMatchObject({ success: true, runId: 'run-new', skipped: false });
		expect(mocks.processProjectAuditTriggerEvaluationJob).toHaveBeenCalledWith({
			projectId: 'project-1',
			userId: 'user-1',
			triggerReason: 'manual',
			auditDepth: undefined
		});
	});
});
