// apps/worker/tests/organizeTaskSync.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
	processOrganizeTaskSync,
	isOrganizeTaskSync
} from '../src/workers/calendar/organizeTaskSync';
const metadata = {
	kind: 'onto_organize_task_sync' as const,
	taskId: 'task',
	sourceProjectId: 'source',
	destinationProjectId: 'dest',
	removedEvents: [{ id: 'old', project_id: 'source' }]
};
function setup(
	overrides: {
		busy?: boolean;
		project?: string;
		denied?: boolean;
		failed?: boolean;
		orphan?: boolean;
	} = {}
) {
	const admin: any = {
		rpc: vi.fn(async (name: string) => ({
			data:
				name === 'claim_organize_calendar_sync'
					? !overrides.busy
					: name === 'actor_has_project_member_access'
						? !overrides.denied
						: null,
			error: null
		})),
		from: vi.fn((table: string) => {
			const q: any = {
				select: () => q,
				eq: () => q,
				maybeSingle: async () => ({
					data: { id: 'task', project_id: overrides.project ?? 'dest' },
					error: null
				}),
				single: async () => ({ data: { id: 'actor' }, error: null }),
				is: () => q,
				insert: vi.fn(() => q),
				then: (resolve: any) =>
					Promise.resolve({
						data: table === 'onto_events' && overrides.orphan ? [{ id: 'orphan' }] : [],
						error: null
					}).then(resolve)
			};
			return q;
		})
	};
	const ports: any = {
		events: { deleteEvent: vi.fn(async () => ({})) },
		tasks: {
			syncTaskEvents: vi.fn(async () => {
				if (overrides.failed) throw new Error('transient');
				return {};
			})
		}
	};
	const job: any = {
		data: metadata,
		userId: 'user',
		signal: new AbortController().signal,
		log: vi.fn()
	};
	return { admin, ports, job };
}
describe('durable Organize calendar reconciliation', () => {
	it('validates source event identity before processing', () => {
		expect(isOrganizeTaskSync(metadata)).toBe(true);
		expect(
			isOrganizeTaskSync({ ...metadata, removedEvents: [{ id: 'old', project_id: 'other' }] })
		).toBe(false);
	});
	it('removes old events and reconciles against the current project after another move', async () => {
		const s = setup({ project: 'third' });
		await processOrganizeTaskSync(s.job, s.admin, s.ports);
		expect(s.ports.events.deleteEvent).toHaveBeenCalledWith(
			'user',
			expect.objectContaining({ eventId: 'old', projectId: 'source' })
		);
		expect(s.ports.tasks.syncTaskEvents).toHaveBeenCalledWith(
			'user',
			'actor',
			expect.objectContaining({ project_id: 'third' }),
			expect.anything()
		);
		expect(s.admin.rpc).toHaveBeenCalledWith(
			'release_organize_calendar_sync',
			expect.anything()
		);
	});
	it('repairs an event left without its edge after an interrupted attempt', async () => {
		const s = setup({ orphan: true });
		await processOrganizeTaskSync(s.job, s.admin, s.ports);
		const edgeQuery = s.admin.from.mock.results
			.filter(
				(_: unknown, index: number) => s.admin.from.mock.calls[index][0] === 'onto_edges'
			)
			.at(-1).value;
		expect(edgeQuery.insert).toHaveBeenCalledWith([
			expect.objectContaining({ dst_id: 'orphan', src_id: 'task', project_id: 'dest' })
		]);
	});
	it('retries a busy task without duplicate event writes', async () => {
		const s = setup({ busy: true });
		await expect(processOrganizeTaskSync(s.job, s.admin, s.ports)).rejects.toThrow('busy');
		expect(s.ports.events.deleteEvent).not.toHaveBeenCalled();
		expect(s.ports.tasks.syncTaskEvents).not.toHaveBeenCalled();
	});
	it('releases its lease when synchronization fails so the job can retry', async () => {
		const s = setup({ failed: true });
		await expect(processOrganizeTaskSync(s.job, s.admin, s.ports)).rejects.toThrow('transient');
		expect(s.admin.rpc).toHaveBeenCalledWith(
			'release_organize_calendar_sync',
			expect.anything()
		);
	});
	it('does not create new events after project access is removed', async () => {
		const s = setup({ denied: true });
		expect(await processOrganizeTaskSync(s.job, s.admin, s.ports)).toMatchObject({
			outcome: 'access_removed'
		});
		expect(s.ports.tasks.syncTaskEvents).not.toHaveBeenCalled();
	});
	it('honors worker cancellation before mutation', async () => {
		const s = setup();
		s.job.signal = AbortSignal.abort();
		await expect(processOrganizeTaskSync(s.job, s.admin, s.ports)).rejects.toThrow();
		expect(s.ports.events.deleteEvent).not.toHaveBeenCalled();
	});
});
