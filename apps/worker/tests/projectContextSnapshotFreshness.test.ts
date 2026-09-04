import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	processProjectContextSnapshotJob,
	queueProjectContextSnapshot
} from '../src/workers/ontology/projectContextSnapshotWorker';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: mocks }));

describe('snapshot cache invalidation', () => {
	it('keeps a new chat revision separate from an older queued project snapshot', async () => {
		mocks.rpc.mockResolvedValue({ error: null });
		await queueProjectContextSnapshot({ projectId: 'project', userId: 'user' });
		await queueProjectContextSnapshot({
			projectId: 'project',
			userId: 'user',
			force: true,
			revisionKey: 'classified-session-job'
		});
		expect(mocks.rpc.mock.calls.map(([, args]) => args.p_dedup_key)).toEqual([
			'project-context-snapshot-project',
			'project-context-snapshot-project-classified-session-job'
		]);
		expect(mocks.rpc.mock.calls[1]?.[1].p_metadata.force).toBe(true);
	});
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.from.mockImplementation((table: string) => {
			const query = {
				select: vi.fn(),
				eq: vi.fn(),
				maybeSingle: vi.fn(),
				insert: vi.fn().mockResolvedValue({ error: null })
			};
			query.select.mockReturnValue(query);
			query.eq.mockReturnValue(query);
			query.maybeSingle.mockResolvedValue({
				data:
					table === 'onto_projects'
						? { state_key: 'active' }
						: { computed_at: new Date().toISOString() },
				error: null
			});
			return query;
		});
		// Stop at the graph fetch; this test exercises the real TTL decision.
		mocks.rpc.mockResolvedValue({ error: { message: 'graph-fetch-reached' } });
	});
	it('retains the read-cache TTL for ordinary refreshes', async () => {
		const job = {
			id: 'snapshot',
			userId: 'user',
			data: { projectId: 'project', force: false },
			log: vi.fn()
		} as unknown as Parameters<typeof processProjectContextSnapshotJob>[0];
		expect(await processProjectContextSnapshotJob(job)).toMatchObject({ skipped: true });
		expect(mocks.rpc).not.toHaveBeenCalled();
	});
	it('rebuilds a recent snapshot for forced chat-close work', async () => {
		const job = {
			id: 'snapshot',
			userId: 'user',
			data: { projectId: 'project', force: true, reason: 'chat_session_close' },
			log: vi.fn()
		} as unknown as Parameters<typeof processProjectContextSnapshotJob>[0];
		await expect(processProjectContextSnapshotJob(job)).rejects.toThrow('graph-fetch-reached');
		expect(mocks.rpc).toHaveBeenCalledWith('load_project_graph_context', {
			p_project_id: 'project'
		});
	});
});
