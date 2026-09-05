// apps/web/src/lib/components/project/project-mutation-refresh.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DataMutation, DataMutationSummary } from '$lib/components/agent/agent-chat.types';
import type { Task } from '$lib/types/onto';
import { createCompleteProjectTasksCoverage } from '$lib/utils/project-task-board';
import {
	collectProjectMutations,
	createProjectRefreshQueue,
	fetchProjectMutationPatch
} from './project-mutation-refresh';

const projectId = 'project-1';
const now = Date.parse('2026-09-05T12:00:00Z');
function task(id: string, extra: Partial<Task> = {}): Task {
	return {
		id,
		project_id: projectId,
		title: id,
		state_key: 'todo',
		deleted_at: null,
		due_at: null,
		start_at: null,
		priority: 3,
		updated_at: '2026-09-01',
		...extra
	} as Task;
}
function mutation(entityId: string | null, extra: Partial<DataMutation> = {}): DataMutation {
	return { entityKind: 'task', entityId, operation: 'update', projectIds: [projectId], ...extra };
}
function summary(mutations: DataMutation[]): DataMutationSummary {
	return {
		hasChanges: true,
		totalMutations: mutations.length,
		affectedProjectIds: [projectId],
		hasMessagesSent: true,
		mutations
	};
}
function respond(data: unknown) {
	return new Response(JSON.stringify({ success: true, data }));
}
afterEach(() => vi.unstubAllGlobals());

describe('project mutation routing', () => {
	it('coalesces repeated updates and removes an entity when the final write deletes it', () => {
		expect(
			collectProjectMutations(projectId, [
				summary([mutation('t'), mutation('t'), mutation('t', { operation: 'delete' })])
			])
		).toEqual([mutation('t', { operation: 'delete' })]);
	});
	it('ignores writes to other projects in a mixed session', () => {
		expect(
			collectProjectMutations(projectId, [
				summary([mutation('ours'), mutation('theirs', { projectIds: ['other'] })])
			])
		).toEqual([mutation('ours')]);
	});
	it('keeps unknown-scope writes relevant even when other writes have a known project', () => {
		const mixed = summary([mutation('unknown', { projectIds: [] })]);
		mixed.affectedProjectIds = ['other'];
		expect(collectProjectMutations(projectId, [mixed])).toEqual(mixed.mutations);
	});
	it('uses a broad fallback for older producers, missing task IDs, and relationship changes', () => {
		const legacy = summary([]);
		delete legacy.mutations;
		for (const receipt of [
			legacy,
			summary([mutation(null)]),
			summary([mutation(null, { entityKind: null })])
		]) {
			expect(collectProjectMutations(projectId, [receipt])).toBeNull();
		}
	});
	it('does no work for a read-only chat or an unrelated project', () => {
		expect(collectProjectMutations(projectId, [{ ...summary([]), hasChanges: false }])).toEqual(
			[]
		);
		expect(collectProjectMutations('other', [summary([mutation('t')])])).toEqual([]);
	});
});

describe('targeted project data reads', () => {
	it('shares one event-list read across task scheduling and calendar writes', async () => {
		const updated = task('scheduled', { due_at: '2026-10-01T12:00:00Z' });
		const fetch = vi.fn(async (url: string) =>
			respond(url.endsWith('/events') ? { events: [] } : { task: updated })
		);
		vi.stubGlobal('fetch', fetch);
		await fetchProjectMutationPatch(
			projectId,
			[mutation('scheduled'), mutation('event', { entityKind: 'event' })],
			{ tasks: [task('scheduled')] }
		);
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(fetch.mock.calls.filter(([url]) => url.endsWith('/events'))).toHaveLength(1);
	});
	it('fetches one edited task and leaves unrelated records and collections untouched', async () => {
		const untouched = task('untouched');
		const updated = task('changed', { title: 'New title', state_key: 'done' });
		const fetch = vi.fn(async () => respond({ task: updated }));
		vi.stubGlobal('fetch', fetch);
		const tasks = [task('changed'), untouched];
		const patch = await fetchProjectMutationPatch(projectId, [mutation('changed')], {
			tasks,
			tasks_coverage: createCompleteProjectTasksCoverage(tasks, now)
		});
		expect(fetch.mock.calls).toHaveLength(1);
		expect(fetch).toHaveBeenCalledWith('/api/onto/tasks/changed', undefined);
		expect(patch.tasks).toEqual([updated, untouched]);
		expect(patch.tasks?.[1]).toBe(untouched);
		expect(patch.tasks_coverage?.buckets.done.total).toBe(1);
		expect(patch).not.toHaveProperty('documents');
		expect(patch).not.toHaveProperty('project');
	});
	it('adds created tasks and removes deleted tasks without fetching a deleted row', async () => {
		const created = task('new');
		const fetch = vi.fn(async () => respond({ task: created }));
		vi.stubGlobal('fetch', fetch);
		const patch = await fetchProjectMutationPatch(
			projectId,
			[mutation('old', { operation: 'delete' }), mutation('new', { operation: 'create' })],
			{ tasks: [task('old')] }
		);
		expect(patch.tasks).toEqual([created]);
		expect(patch.tasks_coverage?.total).toBe(1);
		expect(fetch).toHaveBeenCalledTimes(1);
	});
	it('removes a moved task from its source and adds it to its destination', async () => {
		const moved = task('moved', { project_id: 'destination' });
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => respond({ task: moved }))
		);
		const move = mutation('moved', {
			operation: 'move',
			projectIds: [projectId, 'destination']
		});
		const source = await fetchProjectMutationPatch(projectId, [move], {
			tasks: [task('moved')]
		});
		const destination = await fetchProjectMutationPatch('destination', [move], { tasks: [] });
		expect(source.tasks).toEqual([]);
		expect(destination.tasks).toEqual([moved]);
	});
	it('refills only the affected paginated bucket while retaining the loaded prefix', async () => {
		const tasks = Array.from({ length: 40 }, (_, i) => task(`t-${i}`));
		const untouched = task('doing', { state_key: 'in_progress' });
		tasks.push(untouched);
		const coverage = createCompleteProjectTasksCoverage(tasks, now);
		coverage.complete = false;
		coverage.total = 81;
		coverage.buckets.backlog = { returned: 40, total: 80, complete: false };
		const fetch = vi.fn(async (url: string) =>
			url.includes('/tasks?')
				? respond({
						bucket: 'backlog',
						tasks: tasks.slice(0, 40),
						total: 80,
						hasMore: true,
						offset: 0,
						nextOffset: 40
					})
				: respond({ task: task('t-0', { title: 'Edited' }) })
		);
		vi.stubGlobal('fetch', fetch);
		const patch = await fetchProjectMutationPatch(projectId, [mutation('t-0')], {
			tasks,
			tasks_coverage: coverage
		});
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(fetch.mock.calls[1]?.[0]).toContain('bucket=backlog&offset=0&limit=40');
		expect(patch.tasks).toHaveLength(41);
		expect(patch.tasks?.find((row) => row.id === 'doing')).toBe(untouched);
		expect(patch.tasks_coverage?.buckets.backlog).toEqual({
			returned: 40,
			total: 80,
			complete: false
		});
	});
	it('refreshes both source and destination buckets after a status change', async () => {
		const tasks = [task('changed')];
		const coverage = createCompleteProjectTasksCoverage(tasks, now);
		coverage.complete = false;
		coverage.buckets.backlog = { returned: 1, total: 30, complete: false };
		const updated = task('changed', { state_key: 'done' });
		const fetch = vi.fn(async (url: string) => {
			if (!url.includes('/tasks?')) return respond({ task: updated });
			const bucket = new URL(url, 'http://local').searchParams.get('bucket');
			const rows =
				bucket === 'done'
					? [updated]
					: Array.from({ length: 20 }, (_, i) => task(`replacement-${i}`));
			return respond({
				bucket,
				tasks: rows,
				total: bucket === 'done' ? 1 : 29,
				hasMore: bucket !== 'done',
				offset: 0,
				nextOffset: bucket === 'done' ? null : 20
			});
		});
		vi.stubGlobal('fetch', fetch);
		const patch = await fetchProjectMutationPatch(projectId, [mutation('changed')], {
			tasks,
			tasks_coverage: coverage
		});
		expect(patch.tasks).toHaveLength(21);
		expect(patch.tasks?.filter((row) => row.id === 'changed')).toEqual([updated]);
		expect(patch.tasks_coverage?.total).toBe(30);
	});
	it('refreshes the document tree once for multiple document writes and excludes archived memory', async () => {
		const tree = {
			structure: { version: 2, root: [] },
			documents: { new: { id: 'new', title: 'New doc', type_key: 'document' } },
			unlinked: [],
			archived: [
				{ id: 'memory', type_key: 'document.context.project', state_key: 'archived' }
			]
		};
		const fetch = vi.fn(async () => respond(tree));
		vi.stubGlobal('fetch', fetch);
		const patch = await fetchProjectMutationPatch(
			projectId,
			[
				mutation('deleted', { entityKind: 'document', operation: 'delete' }),
				mutation('new', { entityKind: 'document', operation: 'create' })
			],
			{}
		);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(fetch).toHaveBeenCalledWith(
			`/api/onto/projects/${projectId}/doc-tree?include_content=false`,
			undefined
		);
		expect(patch.documentTree).toEqual(tree);
		expect(patch.context_document).toBeNull();
		expect(patch).not.toHaveProperty('tasks');
	});
	it('hydrates only the active project memory document after a document change', async () => {
		const memory = {
			id: 'memory',
			project_id: projectId,
			type_key: 'document.context.project',
			title: 'Start Here',
			content: 'Updated memory'
		};
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) =>
				url.includes('doc-tree')
					? respond({
							structure: { version: 1, root: [] },
							documents: { memory: { ...memory, content: null } },
							unlinked: [],
							archived: []
						})
					: respond({ document: memory })
			)
		);
		const patch = await fetchProjectMutationPatch(
			projectId,
			[mutation('memory', { entityKind: 'document' })],
			{}
		);
		expect(patch.context_document).toEqual(memory);
	});
	it('propagates a failed read instead of replacing the existing list with empty data', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify({ success: false, error: 'offline' }), {
						status: 500
					})
			)
		);
		await expect(
			fetchProjectMutationPatch(projectId, [mutation('t')], { tasks: [task('t')] })
		).rejects.toThrow('offline');
	});
});

describe('project refresh queue', () => {
	it('retries the failed targeted request without broadening to a project refresh', async () => {
		const refresh = vi
			.fn()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValue(undefined);
		const queue = createProjectRefreshQueue(refresh, vi.fn());
		const receipt = summary([mutation('a')]);
		await queue.enqueue(receipt);
		await queue.retry();
		expect(refresh.mock.calls).toEqual([[[receipt]], [[receipt]]]);
	});
	it('coalesces same-tick notifications and drains a change received during a fetch', async () => {
		let finish!: () => void;
		const firstRead = new Promise<void>((resolve) => {
			finish = resolve;
		});
		const refresh = vi
			.fn()
			.mockImplementationOnce(() => firstRead)
			.mockResolvedValue(undefined);
		const queue = createProjectRefreshQueue(refresh, vi.fn());
		const a = summary([mutation('a')]);
		const b = summary([mutation('b')]);
		const c = summary([mutation('c')]);
		const done = queue.enqueue(a);
		void queue.enqueue(b);
		await Promise.resolve();
		expect(refresh).toHaveBeenCalledWith([a, b]);
		void queue.enqueue(c);
		finish();
		await done;
		expect(refresh).toHaveBeenCalledTimes(2);
		expect(refresh).toHaveBeenLastCalledWith([c]);
	});
	it('keeps queued work after a failed refresh and stops after disposal', async () => {
		const onError = vi.fn();
		const refresh = vi
			.fn()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValue(undefined);
		const queue = createProjectRefreshQueue(refresh, onError);
		await queue.enqueue(summary([mutation('a')]));
		await queue.enqueue(summary([mutation('b')]));
		expect(onError).toHaveBeenCalledTimes(1);
		expect(refresh).toHaveBeenCalledTimes(2);
		queue.dispose();
		await queue.enqueue();
		expect(refresh).toHaveBeenCalledTimes(2);
	});
});
