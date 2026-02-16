// apps/web/src/lib/services/agentic-chat-v2/context-loader.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadFastChatPromptContext } from './context-loader';

type QueryResult = {
	data: any;
	error: any;
};

function createDailyBriefSupabaseMock(config: {
	dailyBrief: QueryResult;
	projectBriefs: QueryResult;
	entities: QueryResult;
}) {
	const from = vi.fn().mockImplementation((table: string) => {
		if (table === 'ontology_daily_briefs') {
			const maybeSingle = vi.fn().mockResolvedValue(config.dailyBrief);
			const eqUser = vi.fn().mockReturnValue({ maybeSingle });
			const eqId = vi.fn().mockReturnValue({ eq: eqUser });
			const select = vi.fn().mockReturnValue({ eq: eqId });
			return { select };
		}

		if (table === 'ontology_project_briefs') {
			const order = vi.fn().mockResolvedValue(config.projectBriefs);
			const eq = vi.fn().mockReturnValue({ order });
			const select = vi.fn().mockReturnValue({ eq });
			return { select };
		}

		if (table === 'ontology_brief_entities') {
			const order = vi.fn().mockResolvedValue(config.entities);
			const eq = vi.fn().mockReturnValue({ order });
			const select = vi.fn().mockReturnValue({ eq });
			return { select };
		}

		throw new Error(`Unexpected table in mock: ${table}`);
	});

	return { from } as any;
}

function createProjectRpcSupabaseMock(payload: Record<string, unknown>) {
	const rpc = vi.fn().mockResolvedValue({ data: payload, error: null });
	const from = vi.fn().mockImplementation(() => {
		throw new Error('Unexpected fallback query path for project RPC mock');
	});
	return { rpc, from } as any;
}

afterEach(() => {
	vi.useRealTimers();
});

describe('loadFastChatPromptContext daily_brief', () => {
	it('prefers ontology_brief_entities as mentioned-entity source', async () => {
		const supabase = createDailyBriefSupabaseMock({
			dailyBrief: {
				data: {
					id: 'brief-1',
					brief_date: '2026-02-14',
					executive_summary: 'Summary',
					priority_actions: ['Do the thing'],
					generation_status: 'completed',
					llm_analysis: null,
					metadata: { generatedVia: 'ontology_v1' }
				},
				error: null
			},
			projectBriefs: {
				data: [
					{
						id: 'pb-1',
						project_id: 'proj-1',
						brief_content: 'Project brief',
						metadata: {},
						created_at: '2026-02-14T10:00:00.000Z',
						project: { name: 'Alpha' }
					}
				],
				error: null
			},
			entities: {
				data: [
					{
						id: 'be-1',
						entity_kind: 'task',
						entity_id: 'task-123',
						project_id: 'proj-1',
						role: 'priority',
						project: { name: 'Alpha' }
					}
				],
				error: null
			}
		});

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'daily_brief',
			entityId: 'brief-1'
		});

		const data = context.data as Record<string, any>;
		expect(data.brief_id).toBe('brief-1');
		expect(data.mentioned_entities).toHaveLength(1);
		expect(data.mentioned_entities[0]).toMatchObject({
			entity_kind: 'task',
			entity_id: 'task-123',
			source: 'ontology_brief_entities'
		});
		expect(data.mentioned_entity_counts).toMatchObject({ task: 1 });
	});

	it('falls back to markdown-link parsing when ontology_brief_entities is empty', async () => {
		const supabase = createDailyBriefSupabaseMock({
			dailyBrief: {
				data: {
					id: 'brief-2',
					brief_date: '2026-02-14',
					executive_summary: 'See [Alpha](/projects/proj-1).',
					priority_actions: [],
					generation_status: 'completed',
					llm_analysis: null,
					metadata: {}
				},
				error: null
			},
			projectBriefs: {
				data: [
					{
						id: 'pb-2',
						project_id: 'proj-1',
						brief_content:
							'Ship auth fixes. [Fix auth blocker](/projects/proj-1/tasks/task-123)',
						metadata: {},
						created_at: '2026-02-14T11:00:00.000Z',
						project: { name: 'Alpha' }
					}
				],
				error: null
			},
			entities: {
				data: [],
				error: null
			}
		});

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'daily_brief',
			entityId: 'brief-2'
		});

		const data = context.data as Record<string, any>;
		expect(data.mentioned_entities.length).toBeGreaterThanOrEqual(1);
		expect(data.mentioned_entities).toContainEqual(
			expect.objectContaining({
				entity_kind: 'task',
				entity_id: 'task-123',
				source: 'markdown_link_fallback'
			})
		);
	});
});

describe('loadFastChatPromptContext project event window', () => {
	it('time-boxes project events and emits events_window metadata from RPC payloads', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-02-15T20:07:18.308Z'));

		const supabase = createProjectRpcSupabaseMock({
			project: {
				id: 'proj-1',
				name: 'Project One',
				state_key: 'active',
				description: 'Test project',
				start_at: null,
				end_at: null,
				next_step_short: null,
				updated_at: '2026-02-15T20:00:00.000Z',
				doc_structure: {
					version: 1,
					root: [{ id: 'linked-doc', order: 0 }]
				}
			},
			goals: [],
			milestones: [],
			plans: [],
			tasks: [],
			documents: [
				{
					id: 'linked-doc',
					title: 'Linked Doc',
					state_key: 'draft',
					created_at: '2026-01-01T00:00:00.000Z',
					updated_at: '2026-02-01T00:00:00.000Z'
				},
				{
					id: 'unlinked-recent',
					title: 'Unlinked Recent',
					state_key: 'draft',
					created_at: '2026-02-12T00:00:00.000Z',
					updated_at: '2026-02-14T00:00:00.000Z'
				},
				{
					id: 'unlinked-old',
					title: 'Unlinked Old',
					state_key: 'draft',
					created_at: '2026-01-02T00:00:00.000Z',
					updated_at: '2026-01-03T00:00:00.000Z'
				}
			],
			events: [
				{
					id: 'in-window',
					title: 'In Window',
					description: null,
					state_key: 'scheduled',
					start_at: '2026-02-10T10:00:00.000Z',
					end_at: '2026-02-10T11:00:00.000Z',
					all_day: false,
					location: null,
					updated_at: '2026-02-10T11:00:00.000Z'
				},
				{
					id: 'too-old',
					title: 'Too Old',
					description: null,
					state_key: 'scheduled',
					start_at: '2026-02-07T20:07:18.307Z',
					end_at: '2026-02-07T21:07:18.307Z',
					all_day: false,
					location: null,
					updated_at: '2026-02-07T21:07:18.307Z'
				},
				{
					id: 'too-far',
					title: 'Too Far',
					description: null,
					state_key: 'scheduled',
					start_at: '2026-03-01T20:07:18.309Z',
					end_at: '2026-03-01T21:07:18.309Z',
					all_day: false,
					location: null,
					updated_at: '2026-03-01T21:07:18.309Z'
				}
			],
			members: []
		});

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'project',
			entityId: 'proj-1'
		});

		const data = context.data as Record<string, any>;
		expect(data.events).toHaveLength(1);
		expect(data.events[0].id).toBe('in-window');
		expect(data.documents).toHaveLength(3);
		expect(data.documents[0]).toMatchObject({
			id: 'unlinked-recent',
			is_unlinked: true,
			in_doc_structure: false
		});
		expect(data.documents[2]).toMatchObject({
			id: 'linked-doc',
			is_unlinked: false,
			in_doc_structure: true
		});
		expect(data.events_window).toMatchObject({
			timezone: 'UTC',
			past_days: 7,
			future_days: 14,
			now_at: '2026-02-15T20:07:18.308Z',
			start_at: '2026-02-08T20:07:18.308Z',
			end_at: '2026-03-01T20:07:18.308Z'
		});
		expect(data.context_meta).toMatchObject({
			generated_at: '2026-02-15T20:07:18.308Z',
			source: 'rpc',
			cache_age_seconds: 0,
			entity_scopes: {
				events: {
					returned: 1,
					total_matching: 1,
					is_complete: true,
					selection_strategy: 'start_at_asc_windowed'
				},
				documents: {
					returned: 3,
					total_matching: 3,
					is_complete: true,
					unlinked_total: 2,
					linked_total: 1
				}
			}
		});
	});

	it('applies member role defaults and sorts members by role and created_at', async () => {
		const supabase = createProjectRpcSupabaseMock({
			project: {
				id: 'proj-1',
				name: 'Project One',
				state_key: 'active',
				description: 'Test project',
				start_at: null,
				end_at: null,
				next_step_short: null,
				updated_at: '2026-02-15T20:00:00.000Z',
				doc_structure: null
			},
			goals: [],
			milestones: [],
			plans: [],
			tasks: [],
			documents: [],
			events: [],
			members: [
				{
					id: 'm-viewer',
					project_id: 'proj-1',
					actor_id: 'actor-viewer',
					role_key: 'viewer',
					access: 'read',
					role_name: '',
					role_description: '',
					created_at: '2026-02-03T00:00:00.000Z',
					actor: {
						id: 'actor-viewer',
						name: 'Viewer Person',
						email: 'viewer@example.com'
					}
				},
				{
					id: 'm-owner-late',
					project_id: 'proj-1',
					actor_id: 'actor-owner-late',
					role_key: 'owner',
					access: 'admin',
					role_name: ' ',
					role_description: null,
					created_at: '2026-02-02T00:00:00.000Z',
					actor_name: 'Owner Late',
					actor_email: 'owner-late@example.com'
				},
				{
					id: 'm-editor-early',
					project_id: 'proj-1',
					actor_id: 'actor-editor-early',
					role_key: 'editor',
					access: 'write',
					role_name: 'Delivery Lead',
					role_description: 'Owns day-to-day delivery coordination and follow-through.',
					created_at: '2026-02-01T12:00:00.000Z',
					actor_name: 'Editor Early',
					actor_email: 'editor-early@example.com'
				},
				{
					id: 'm-owner-early',
					project_id: 'proj-1',
					actor_id: 'actor-owner-early',
					role_key: 'owner',
					access: 'admin',
					role_name: null,
					role_description: null,
					created_at: '2026-02-01T00:00:00.000Z',
					actor_name: 'Owner Early',
					actor_email: 'owner-early@example.com'
				},
				{
					id: 'm-editor-late',
					project_id: 'proj-1',
					actor_id: 'actor-editor-late',
					role_key: 'editor',
					access: 'write',
					role_name: null,
					role_description: '   ',
					created_at: '2026-02-03T00:00:00.000Z',
					actor_name: 'Editor Late',
					actor_email: 'editor-late@example.com'
				}
			]
		});

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'project',
			entityId: 'proj-1'
		});

		const data = context.data as Record<string, any>;
		const members = data.members as Array<Record<string, any>>;

		expect(members.map((member) => member.id)).toEqual([
			'm-owner-early',
			'm-owner-late',
			'm-editor-early',
			'm-editor-late',
			'm-viewer'
		]);

		expect(members.find((member) => member.id === 'm-owner-late')).toMatchObject({
			role_name: 'Project Owner',
			role_description: 'Owns project direction, decision-making, and final approval.'
		});

		expect(members.find((member) => member.id === 'm-editor-late')).toMatchObject({
			role_name: 'Collaborator',
			role_description:
				'Contributes actively by creating, editing, and coordinating project work.'
		});

		expect(members.find((member) => member.id === 'm-editor-early')).toMatchObject({
			role_name: 'Delivery Lead',
			role_description: 'Owns day-to-day delivery coordination and follow-through.'
		});

		expect(members.find((member) => member.id === 'm-viewer')).toMatchObject({
			actor_name: 'Viewer Person',
			actor_email: 'viewer@example.com',
			role_name: 'Observer',
			role_description: 'Tracks progress and context, with read-only access to project work.'
		});
	});

	it('applies relevance priority and scope completeness metadata for project entities', async () => {
		vi.useFakeTimers();
		const now = new Date('2026-02-15T20:07:18.308Z');
		vi.setSystemTime(now);

		const dayMs = 24 * 60 * 60 * 1000;
		const isoFromDays = (daysFromNow: number): string =>
			new Date(now.getTime() + daysFromNow * dayMs).toISOString();

		const goals = [
			{
				id: 'goal-completed',
				name: 'Completed Goal',
				description: null,
				state_key: 'completed',
				target_date: isoFromDays(1),
				completed_at: isoFromDays(-1),
				updated_at: isoFromDays(0)
			},
			{
				id: 'goal-overdue',
				name: 'Overdue Goal',
				description: null,
				state_key: 'active',
				target_date: isoFromDays(-1),
				completed_at: null,
				updated_at: isoFromDays(-2)
			},
			{
				id: 'goal-due-soon',
				name: 'Soon Goal',
				description: null,
				state_key: 'active',
				target_date: isoFromDays(2),
				completed_at: null,
				updated_at: isoFromDays(-3)
			},
			{
				id: 'goal-future',
				name: 'Future Goal',
				description: null,
				state_key: 'active',
				target_date: isoFromDays(14),
				completed_at: null,
				updated_at: isoFromDays(-4)
			},
			...Array.from({ length: 9 }, (_, index) => ({
				id: `goal-open-${index + 1}`,
				name: `Open Goal ${index + 1}`,
				description: null,
				state_key: 'active',
				target_date: null,
				completed_at: null,
				updated_at: isoFromDays(-10 - index)
			}))
		];

		const milestones = [
			{
				id: 'milestone-completed',
				title: 'Completed Milestone',
				description: null,
				state_key: 'completed',
				due_at: isoFromDays(1),
				completed_at: isoFromDays(-1),
				updated_at: isoFromDays(0)
			},
			{
				id: 'milestone-overdue',
				title: 'Overdue Milestone',
				description: null,
				state_key: 'pending',
				due_at: isoFromDays(-1),
				completed_at: null,
				updated_at: isoFromDays(-2)
			},
			{
				id: 'milestone-due-soon',
				title: 'Soon Milestone',
				description: null,
				state_key: 'in_progress',
				due_at: isoFromDays(2),
				completed_at: null,
				updated_at: isoFromDays(-3)
			},
			{
				id: 'milestone-future',
				title: 'Future Milestone',
				description: null,
				state_key: 'pending',
				due_at: isoFromDays(14),
				completed_at: null,
				updated_at: isoFromDays(-4)
			},
			...Array.from({ length: 9 }, (_, index) => ({
				id: `milestone-open-${index + 1}`,
				title: `Open Milestone ${index + 1}`,
				description: null,
				state_key: 'pending',
				due_at: null,
				completed_at: null,
				updated_at: isoFromDays(-10 - index)
			}))
		];

		const plans = [
			{
				id: 'plan-completed',
				name: 'Completed Plan',
				description: null,
				state_key: 'completed',
				updated_at: isoFromDays(0)
			},
			{
				id: 'plan-active',
				name: 'Active Plan',
				description: null,
				state_key: 'active',
				updated_at: isoFromDays(-8)
			},
			{
				id: 'plan-blocked',
				name: 'Blocked Plan',
				description: null,
				state_key: 'blocked',
				updated_at: isoFromDays(-1)
			},
			{
				id: 'plan-todo',
				name: 'Todo Plan',
				description: null,
				state_key: 'todo',
				updated_at: isoFromDays(-2)
			},
			...Array.from({ length: 9 }, (_, index) => ({
				id: `plan-open-${index + 1}`,
				name: `Open Plan ${index + 1}`,
				description: null,
				state_key: 'todo',
				updated_at: isoFromDays(-10 - index)
			}))
		];

		const tasks = [
			{
				id: 'task-completed',
				title: 'Completed Task',
				description: null,
				state_key: 'completed',
				priority: 5,
				start_at: isoFromDays(-10),
				due_at: isoFromDays(-2),
				completed_at: isoFromDays(-0.5),
				updated_at: isoFromDays(0)
			},
			{
				id: 'task-overdue-inprogress',
				title: 'Overdue In Progress',
				description: null,
				state_key: 'in_progress',
				priority: 1,
				start_at: isoFromDays(-5),
				due_at: isoFromDays(-1),
				completed_at: null,
				updated_at: isoFromDays(-2)
			},
			{
				id: 'task-overdue-blocked',
				title: 'Overdue Blocked',
				description: null,
				state_key: 'blocked',
				priority: 5,
				start_at: isoFromDays(-5),
				due_at: isoFromDays(-1),
				completed_at: null,
				updated_at: isoFromDays(-1)
			},
			{
				id: 'task-due-soon-inprogress',
				title: 'Soon In Progress',
				description: null,
				state_key: 'in_progress',
				priority: 2,
				start_at: isoFromDays(-2),
				due_at: isoFromDays(2),
				completed_at: null,
				updated_at: isoFromDays(-2)
			},
			{
				id: 'task-future-inprogress',
				title: 'Future In Progress',
				description: null,
				state_key: 'in_progress',
				priority: 4,
				start_at: isoFromDays(-1),
				due_at: isoFromDays(14),
				completed_at: null,
				updated_at: isoFromDays(-1)
			},
			{
				id: 'task-no-due-inprogress',
				title: 'No Due In Progress',
				description: null,
				state_key: 'in_progress',
				priority: 3,
				start_at: isoFromDays(-3),
				due_at: null,
				completed_at: null,
				updated_at: isoFromDays(-3)
			},
			...Array.from({ length: 13 }, (_, index) => ({
				id: `task-open-${index + 1}`,
				title: `Open Task ${index + 1}`,
				description: null,
				state_key: 'todo',
				priority: index % 3,
				start_at: isoFromDays(-12 - index),
				due_at: null,
				completed_at: null,
				updated_at: isoFromDays(-10 - index)
			}))
		];

		const documents = [
			{
				id: 'doc-linked-old',
				title: 'Linked Old',
				state_key: 'draft',
				created_at: isoFromDays(-40),
				updated_at: isoFromDays(-30)
			},
			{
				id: 'doc-linked-recent',
				title: 'Linked Recent',
				state_key: 'draft',
				created_at: isoFromDays(-5),
				updated_at: isoFromDays(-2)
			},
			...Array.from({ length: 19 }, (_, index) => ({
				id: `doc-unlinked-${index + 1}`,
				title: `Unlinked ${index + 1}`,
				state_key: 'draft',
				created_at: isoFromDays(-20 - index),
				updated_at: isoFromDays(-index)
			}))
		];

		const supabase = createProjectRpcSupabaseMock({
			project: {
				id: 'proj-1',
				name: 'Project One',
				state_key: 'active',
				description: 'Test project',
				start_at: null,
				end_at: null,
				next_step_short: null,
				updated_at: isoFromDays(0),
				doc_structure: {
					version: 1,
					root: [
						{ id: 'doc-linked-old', order: 0 },
						{ id: 'doc-linked-recent', order: 1 }
					]
				}
			},
			goals,
			milestones,
			plans,
			tasks,
			documents,
			events: [],
			members: []
		});

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'project',
			entityId: 'proj-1'
		});

		const data = context.data as Record<string, any>;

		expect(data.goals).toHaveLength(12);
		expect(data.goals.map((goal: { id: string }) => goal.id)).not.toContain('goal-completed');
		expect(data.goals.slice(0, 3).map((goal: { id: string }) => goal.id)).toEqual([
			'goal-overdue',
			'goal-due-soon',
			'goal-future'
		]);

		expect(data.milestones).toHaveLength(12);
		expect(data.milestones.map((milestone: { id: string }) => milestone.id)).not.toContain(
			'milestone-completed'
		);
		expect(
			data.milestones.slice(0, 3).map((milestone: { id: string }) => milestone.id)
		).toEqual(['milestone-overdue', 'milestone-due-soon', 'milestone-future']);

		expect(data.plans).toHaveLength(12);
		expect(data.plans.map((plan: { id: string }) => plan.id)).not.toContain('plan-completed');
		expect(data.plans.slice(0, 3).map((plan: { id: string }) => plan.id)).toEqual([
			'plan-active',
			'plan-blocked',
			'plan-todo'
		]);

		expect(data.tasks).toHaveLength(18);
		expect(data.tasks.map((task: { id: string }) => task.id)).not.toContain('task-completed');
		expect(data.tasks.slice(0, 4).map((task: { id: string }) => task.id)).toEqual([
			'task-overdue-inprogress',
			'task-overdue-blocked',
			'task-due-soon-inprogress',
			'task-future-inprogress'
		]);

		expect(data.documents).toHaveLength(20);
		expect(data.documents[0]).toMatchObject({
			id: 'doc-unlinked-1',
			is_unlinked: true,
			in_doc_structure: false
		});
		expect(data.documents[19]).toMatchObject({
			id: 'doc-linked-recent',
			is_unlinked: false,
			in_doc_structure: true
		});
		expect(data.documents.map((doc: { id: string }) => doc.id)).not.toContain('doc-linked-old');

		expect(data.context_meta).toMatchObject({
			cache_age_seconds: 0,
			entity_scopes: {
				goals: {
					returned: 12,
					total_matching: 13,
					limit: 12,
					is_complete: false,
					selection_strategy: 'goal_priority_v1',
					filters: {
						deleted: 'excluded',
						states: 'all',
						due_soon_days: 7
					}
				},
				milestones: {
					returned: 12,
					total_matching: 13,
					limit: 12,
					is_complete: false,
					selection_strategy: 'milestone_priority_v1',
					filters: {
						deleted: 'excluded',
						states: 'all',
						due_soon_days: 7
					}
				},
				plans: {
					returned: 12,
					total_matching: 13,
					limit: 12,
					is_complete: false,
					selection_strategy: 'plan_priority_v1',
					filters: {
						deleted: 'excluded',
						states: 'all'
					}
				},
				tasks: {
					returned: 18,
					total_matching: 19,
					limit: 18,
					is_complete: false,
					selection_strategy: 'task_priority_v1',
					filters: {
						deleted: 'excluded',
						states: 'all',
						due_soon_days: 7
					}
				},
				documents: {
					returned: 20,
					total_matching: 21,
					limit: 20,
					is_complete: false,
					selection_strategy: 'unlinked_first_recent_activity_desc',
					filters: {
						deleted: 'excluded',
						include_unlinked: true
					},
					unlinked_total: 19,
					linked_total: 2
				}
			}
		});
	});
});
