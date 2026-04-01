// apps/web/src/lib/services/agentic-chat/tools/core/executors/overview-helper.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildProjectOverviewPayload,
	buildWorkspaceOverviewPayload,
	resolveProjectMatch
} from './overview-helper';

describe('overview-helper', () => {
	it('builds a workspace overview across multiple projects', () => {
		const now = new Date('2026-03-30T12:00:00.000Z');
		const payload = buildWorkspaceOverviewPayload({
			now,
			maybeMore: true,
			projects: [
				{
					id: 'proj-1',
					name: '9takes',
					state_key: 'active',
					description: 'Main project',
					next_step_short: 'Ship the next cut',
					updated_at: '2026-03-30T10:00:00.000Z'
				},
				{
					id: 'proj-2',
					name: 'Shared Alpha',
					state_key: 'active',
					description: 'Shared project',
					next_step_short: null,
					updated_at: '2026-03-29T10:00:00.000Z'
				}
			],
			tasks: [
				{
					id: 'task-1',
					project_id: 'proj-1',
					title: 'Blocked task',
					state_key: 'blocked',
					priority: 5,
					due_at: '2026-03-29T12:00:00.000Z',
					completed_at: null,
					updated_at: '2026-03-30T09:00:00.000Z'
				},
				{
					id: 'task-2',
					project_id: 'proj-1',
					title: 'Due soon task',
					state_key: 'in_progress',
					priority: 3,
					due_at: '2026-04-02T12:00:00.000Z',
					completed_at: null,
					updated_at: '2026-03-30T08:00:00.000Z'
				},
				{
					id: 'task-3',
					project_id: 'proj-2',
					title: 'Shared task',
					state_key: 'todo',
					priority: 1,
					due_at: null,
					completed_at: null,
					updated_at: '2026-03-29T09:00:00.000Z'
				}
			],
			milestones: [
				{
					id: 'milestone-1',
					project_id: 'proj-1',
					title: 'Launch',
					state_key: 'pending',
					due_at: '2026-04-05T12:00:00.000Z',
					completed_at: null,
					updated_at: '2026-03-30T07:00:00.000Z'
				}
			],
			plans: [
				{
					id: 'plan-1',
					project_id: 'proj-1',
					name: 'Cutover plan',
					state_key: 'active',
					updated_at: '2026-03-30T06:00:00.000Z'
				}
			],
			risks: [
				{
					id: 'risk-1',
					project_id: 'proj-1',
					title: 'Launch risk',
					state_key: 'open',
					impact: 'high',
					updated_at: '2026-03-30T05:00:00.000Z'
				}
			],
			events: [
				{
					id: 'event-1',
					project_id: 'proj-1',
					title: 'Launch review',
					start_at: '2026-04-01T12:00:00.000Z',
					end_at: '2026-04-01T13:00:00.000Z',
					updated_at: '2026-03-30T04:00:00.000Z'
				}
			],
			projectLogs: [
				{
					project_id: 'proj-1',
					entity_type: 'task',
					entity_id: 'task-1',
					action: 'updated',
					created_at: '2026-03-30T11:30:00.000Z',
					after_data: { title: 'Blocked task' }
				}
			]
		});

		expect(payload.scope).toBe('workspace');
		expect(payload.projects_returned).toBe(2);
		expect(payload.maybe_more).toBe(true);
		expect(payload.totals.projects).toBe(2);
		expect(payload.totals.active_tasks).toBe(3);
		expect(payload.totals.blocked_tasks).toBe(1);
		expect(payload.totals.overdue_tasks).toBe(1);
		expect(payload.totals.due_soon_tasks).toBe(1);
		expect(payload.totals.open_milestones).toBe(1);
		expect(payload.totals.open_plans).toBe(1);
		expect(payload.totals.open_risks).toBe(1);
		expect(payload.totals.upcoming_events).toBe(1);
		expect(payload.projects[0]?.name).toBe('9takes');
		expect(payload.projects[0]?.recent_activity[0]?.title).toBe('Blocked task');
	});

	it('resolves exact project matches and returns ambiguity when multiple names fit', () => {
		const exact = resolveProjectMatch(
			[
				{ id: 'proj-1', name: '9takes', state_key: 'active', updated_at: null },
				{ id: 'proj-2', name: 'Alpha', state_key: 'active', updated_at: null }
			],
			'9takes'
		);
		expect(exact).toMatchObject({
			status: 'resolved',
			project: { id: 'proj-1', name: '9takes' }
		});

		const ambiguous = resolveProjectMatch(
			[
				{ id: 'proj-1', name: 'Alpha', state_key: 'active', updated_at: null },
				{ id: 'proj-2', name: 'Alpha', state_key: 'active', updated_at: null }
			],
			'Alpha'
		);
		expect(ambiguous.status).toBe('ambiguous');
		if (ambiguous.status === 'ambiguous') {
			expect(ambiguous.candidates).toHaveLength(2);
		}
	});

	it('builds a project overview that prioritizes blocked and overdue work', () => {
		const now = new Date('2026-03-30T12:00:00.000Z');
		const payload = buildProjectOverviewPayload({
			now,
			query: '9takes',
			project: {
				id: 'proj-1',
				name: '9takes',
				state_key: 'active',
				description: 'Main project',
				start_at: null,
				end_at: null,
				next_step_short: 'Ship the next cut',
				updated_at: '2026-03-30T10:00:00.000Z'
			},
			tasks: [
				{
					id: 'task-1',
					project_id: 'proj-1',
					title: 'Blocked task',
					state_key: 'blocked',
					priority: 1,
					due_at: '2026-03-29T12:00:00.000Z',
					completed_at: null,
					updated_at: '2026-03-30T09:00:00.000Z'
				},
				{
					id: 'task-2',
					project_id: 'proj-1',
					title: 'Due soon task',
					state_key: 'in_progress',
					priority: 2,
					due_at: '2026-04-01T12:00:00.000Z',
					completed_at: null,
					updated_at: '2026-03-30T08:00:00.000Z'
				},
				{
					id: 'task-3',
					project_id: 'proj-1',
					title: 'Completed task',
					state_key: 'done',
					priority: 3,
					due_at: '2026-03-28T12:00:00.000Z',
					completed_at: '2026-03-28T12:30:00.000Z',
					updated_at: '2026-03-28T12:30:00.000Z'
				}
			],
			milestones: [
				{
					id: 'milestone-1',
					project_id: 'proj-1',
					title: 'Launch',
					state_key: 'pending',
					due_at: '2026-04-05T12:00:00.000Z',
					completed_at: null,
					updated_at: '2026-03-30T07:00:00.000Z'
				}
			],
			plans: [
				{
					id: 'plan-1',
					project_id: 'proj-1',
					name: 'Cutover plan',
					state_key: 'active',
					updated_at: '2026-03-30T06:00:00.000Z'
				}
			],
			risks: [
				{
					id: 'risk-1',
					project_id: 'proj-1',
					title: 'Launch risk',
					state_key: 'open',
					impact: 'critical',
					updated_at: '2026-03-30T05:00:00.000Z'
				}
			],
			events: [
				{
					id: 'event-1',
					project_id: 'proj-1',
					title: 'Launch review',
					start_at: '2026-04-01T12:00:00.000Z',
					end_at: '2026-04-01T13:00:00.000Z',
					updated_at: '2026-03-30T04:00:00.000Z'
				}
			],
			projectLogs: [
				{
					project_id: 'proj-1',
					entity_type: 'task',
					entity_id: 'task-1',
					action: 'updated',
					created_at: '2026-03-30T11:30:00.000Z',
					after_data: { title: 'Blocked task' }
				}
			]
		});

		expect(payload.scope).toBe('project');
		expect(payload.match).toMatchObject({
			status: 'resolved',
			project_id: 'proj-1',
			query: '9takes'
		});
		expect(payload.counts).toMatchObject({
			active_tasks: 2,
			blocked_tasks: 1,
			overdue_tasks: 1,
			due_soon_tasks: 1,
			open_milestones: 1,
			open_plans: 1,
			open_risks: 1,
			upcoming_events: 1
		});
		expect(payload.tasks?.[0]?.id).toBe('task-1');
		expect(payload.tasks?.map((task) => task.id)).not.toContain('task-3');
		expect(payload.risks?.[0]?.impact).toBe('critical');
		expect(payload.upcoming_events?.[0]?.id).toBe('event-1');
	});
});
