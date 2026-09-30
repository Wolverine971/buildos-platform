// apps/worker/tests/organizeTaskSync.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
	processOrganizeTaskSync,
	isOrganizeTaskSync,
	organizeLeaseToken
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
		mappings?: { user_id: string | null; project_calendar_id: string | null }[];
		calendars?: { user_id: string }[];
		deletedEvent?: Record<string, unknown>;
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
				neq: () => q,
				in: () => q,
				maybeSingle: async () => ({
					data: { id: 'task', project_id: overrides.project ?? 'dest' },
					error: null
				}),
				single: async () => ({ data: { id: 'actor' }, error: null }),
				is: () => q,
				insert: vi.fn(() => q),
				then: (resolve: any) =>
					Promise.resolve({
						data:
							table === 'onto_events' && overrides.orphan
								? [{ id: 'orphan' }]
								: table === 'onto_event_sync'
									? (overrides.mappings ?? [])
									: table === 'project_calendars'
										? (overrides.calendars ?? [])
										: [],
						error: null
					}).then(resolve)
			};
			return q;
		})
	};
	const ports: any = {
		events: {
			deleteEvent: vi.fn(async () => ({
				id: 'old',
				project_id: 'source',
				updated_at: '2026-09-30T20:00:00.000Z',
				...(overrides.deletedEvent ?? {})
			}))
		},
		tasks: {
			syncTaskEvents: vi.fn(async () => {
				if (overrides.failed) throw new Error('transient');
				return {};
			})
		}
	};
	const job: any = {
		id: 'organize-task-sync:task:1',
		queueRowId: '6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60',
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
	it('claims with a token that is stable across retries of the same job', async () => {
		const first = setup();
		await processOrganizeTaskSync(first.job, first.admin, first.ports);
		const retry = setup();
		retry.job.attempts = 2;
		await processOrganizeTaskSync(retry.job, retry.admin, retry.ports);
		const claimToken = (s: ReturnType<typeof setup>) =>
			s.admin.rpc.mock.calls.find(
				([name]: [string]) => name === 'claim_organize_calendar_sync'
			)[1].p_token;
		expect(claimToken(first)).toBe('6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60');
		expect(claimToken(retry)).toBe(claimToken(first));
		const release = first.admin.rpc.mock.calls.find(
			([name]: [string]) => name === 'release_organize_calendar_sync'
		)[1];
		expect(release.p_token).toBe(claimToken(first));
	});
	it('derives a deterministic UUID token when the queue row id is missing', () => {
		const a = organizeLeaseToken({ id: 'organize-task-sync:task:1' });
		expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		expect(organizeLeaseToken({ id: 'organize-task-sync:task:1' })).toBe(a);
		expect(organizeLeaseToken({ id: 'organize-task-sync:task:2' })).not.toBe(a);
		expect(organizeLeaseToken({ id: 'x', queueRowId: 'not-a-uuid' })).not.toBe('not-a-uuid');
	});
	it("queues a delete for the task owner's calendar copy when a collaborator moved it", async () => {
		const s = setup({
			mappings: [
				{ user_id: 'owner', project_calendar_id: null },
				{ user_id: 'user', project_calendar_id: null },
				{ user_id: null, project_calendar_id: 'pc-shared' }
			],
			calendars: [{ user_id: 'calendar-holder' }]
		});
		await processOrganizeTaskSync(s.job, s.admin, s.ports);
		const deletes = s.admin.rpc.mock.calls
			.filter(([name]: [string]) => name === 'add_queue_job')
			.map(([, args]: [string, any]) => args);
		expect(deletes.map((args: any) => args.p_user_id).sort()).toEqual([
			'calendar-holder',
			'owner'
		]);
		expect(deletes[0]).toMatchObject({
			p_job_type: 'sync_calendar',
			p_metadata: expect.objectContaining({
				kind: 'onto_project_event_sync',
				action: 'delete',
				eventId: 'old',
				projectId: 'source',
				triggeredByUserId: 'user',
				createCalendarIfMissing: false,
				eventUpdatedAt: '2026-09-30T20:00:00.000Z'
			})
		});
		expect(deletes[0].p_dedup_key).toBe(
			`onto-project-event-sync:delete:old:${deletes[0].p_user_id}:2026-09-30T20:00:00.000Z`
		);
	});
	it('queues no extra deletes when only the mover holds a copy', async () => {
		const s = setup({ mappings: [{ user_id: 'user', project_calendar_id: null }] });
		await processOrganizeTaskSync(s.job, s.admin, s.ports);
		expect(
			s.admin.rpc.mock.calls.filter(([name]: [string]) => name === 'add_queue_job')
		).toHaveLength(0);
	});
});
