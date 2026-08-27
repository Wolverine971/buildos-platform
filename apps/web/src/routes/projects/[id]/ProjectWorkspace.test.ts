// apps/web/src/routes/projects/[id]/ProjectWorkspace.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pushState } from '$app/navigation';
import { createCompleteProjectTasksCoverage } from '$lib/utils/project-task-board';
import ProjectWorkspace from './ProjectWorkspace.svelte';

const mocks = vi.hoisted(() => ({
	trackLoopEvent: vi.fn()
}));

vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	pushState: vi.fn(),
	replaceState: vi.fn()
}));

vi.mock('$app/state', () => ({
	page: { state: {} }
}));

vi.mock('$lib/services/loop-telemetry', () => ({
	trackLoopEvent: mocks.trackLoopEvent
}));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const LONG_NAME =
	'International multi-market research, launch operations, customer migration, partner enablement, and post-launch learning program';
const LONG_BRIEF = `Build a durable operating system for a complex launch spanning product, research, partnerships, customer migration, and post-launch learning. The team needs one place to understand the decision, the current constraint, and what changes next.

The work crosses several owners and time zones. This brief deliberately contains enough detail to test whether the page preserves scan speed without hiding the full context from people who need it.

Success means the team can see the current objective, understand the sequence of commitments, and recover the reasoning behind important changes without scheduling another status meeting.`;
const CONTEXT_DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';

function apiResponse(data: Record<string, unknown>) {
	return new Response(JSON.stringify({ success: true, data }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
}

function contextDocument() {
	const content = [
		'# START HERE - Project',
		'',
		'<!-- managed:status v=1 -->',
		'**State:** active · **Stage:** execution',
		'**Now:** 4 open tasks · 1 overdue',
		'**Next step:** Ship the launch email.',
		'_Last refreshed 2026-07-22T12:00:00.000Z from project snapshot._',
		'<!-- /managed:status -->',
		'',
		'## What this is',
		'This is the canonical project brief.'
	].join('\n');
	return {
		id: CONTEXT_DOCUMENT_ID,
		project_id: PROJECT_ID,
		title: 'START HERE - Project',
		type_key: 'document.context.project',
		state_key: 'active',
		content,
		props: {},
		created_at: '2026-07-01T12:00:00.000Z',
		updated_at: '2026-07-22T12:00:00.000Z',
		deleted_at: null
	};
}

function projectDocument() {
	return {
		id: '44444444-4444-4444-8444-444444444444',
		project_id: PROJECT_ID,
		title: 'Launch research',
		type_key: 'document',
		state_key: 'active',
		content: '# Launch research',
		props: {},
		created_by: '22222222-2222-4222-8222-222222222222',
		created_at: '2026-08-01T12:00:00.000Z',
		updated_at: '2026-08-14T12:00:00.000Z',
		deleted_at: null
	};
}

function projectData(overrides: Record<string, unknown> = {}) {
	return {
		skeleton: false,
		projectId: PROJECT_ID,
		access: {
			canEdit: true,
			canAdmin: true,
			canInvite: true,
			canViewLogs: true,
			isOwner: true,
			isAuthenticated: true,
			currentActorId: '22222222-2222-4222-8222-222222222222'
		},
		project: {
			id: PROJECT_ID,
			name: 'Project',
			description: null,
			state_key: 'active',
			type_key: 'project',
			next_step_short: null,
			start_at: '2026-07-01T12:00:00.000Z',
			end_at: '2027-02-28T12:00:00.000Z',
			doc_structure: null,
			props: {},
			icon_svg: null,
			icon_concept: null,
			created_by: '22222222-2222-4222-8222-222222222222',
			created_at: '2026-07-01T12:00:00.000Z',
			updated_at: '2026-07-22T12:00:00.000Z'
		},
		tasks: [],
		tasks_coverage: createCompleteProjectTasksCoverage([]),
		documents: [],
		goals: [],
		plans: [],
		milestones: [],
		risks: [],
		events: [],
		context_document: null,
		images: [],
		...overrides
	};
}

function goals(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		id: `goal-${index}`,
		name: `Goal ${index + 1}`,
		state_key: 'active',
		target_date: '2027-01-15T12:00:00.000Z',
		deleted_at: null
	}));
}

function plans(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		id: `plan-${index}`,
		name: `Plan ${index + 1}`,
		description: 'Coordinate the launch workstreams.',
		state_key: 'active',
		deleted_at: null
	}));
}

describe('ProjectWorkspace edge states', () => {
	beforeEach(() => {
		window.history.replaceState({}, '', '/workspace?view=overview');
		vi.stubGlobal('scrollTo', vi.fn());
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith(`/api/projects/${PROJECT_ID}/briefs/latest`)) {
					return apiResponse({
						brief: {
							id: 'brief-1',
							project_id: PROJECT_ID,
							brief_content:
								"# Today's focus\n\nShip the simplified project workspace.",
							brief_date: '2026-08-14',
							generation_status: 'completed',
							generation_error: null,
							metadata: null,
							created_at: '2026-08-14T12:00:00.000Z',
							updated_at: '2026-08-14T12:00:00.000Z'
						}
					});
				}
				if (url.endsWith(`/api/onto/projects/${PROJECT_ID}/notification-settings`)) {
					return apiResponse({
						settings: {
							project_id: PROJECT_ID,
							member_count: 2,
							is_shared_project: true,
							project_default_enabled: true,
							member_enabled: true,
							effective_enabled: true,
							member_overridden: false,
							can_manage_default: true
						}
					});
				}
				if (url.includes(`/api/onto/projects/${PROJECT_ID}/logs?`)) {
					return apiResponse({ logs: [], total: 0, hasMore: false });
				}
				if (url.includes(`/api/onto/projects/${PROJECT_ID}/recent-chats?`)) {
					return apiResponse({
						chats: [
							{
								id: 'chat-1',
								title: 'Launch positioning review',
								summary: 'Compared the launch narrative with customer research.',
								chat_topics: ['positioning'],
								context_type: 'project',
								entity_id: PROJECT_ID,
								message_count: 8,
								status: 'completed',
								focus_label: 'Launch plan',
								focus_type: 'plan',
								created_at: '2026-08-20T10:00:00.000Z',
								updated_at: '2026-08-20T11:00:00.000Z',
								last_message_at: '2026-08-20T11:00:00.000Z',
								last_activity_at: '2026-08-20T11:00:00.000Z'
							}
						],
						total: 1,
						hasMore: false
					});
				}
				throw new Error(`Unexpected fetch: ${url}`);
			})
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('keeps the persistent shell focused on project identity, the brief, and workspace tabs', async () => {
		const { container } = render(ProjectWorkspace, {
			props: {
				data: projectData({ context_document: contextDocument() }) as any
			}
		});

		await waitFor(() => {
			expect(
				screen.getByRole('navigation', { name: 'Project workspace views' })
			).toBeInTheDocument();
		});

		const briefButton = screen.getByRole('button', {
			name: 'Open Brief / Start Here'
		});
		expect(briefButton).toBeInTheDocument();
		expect(screen.getByTitle('Open project graph')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Project options' })).toBeInTheDocument();
		expect(screen.getAllByRole('tab').map((tab) => tab.textContent?.trim())).toEqual([
			'Overview',
			'Tasks 0',
			'Docs 0',
			'Activity'
		]);

		expect(container.querySelector('[aria-label="Project focus"]')).not.toBeInTheDocument();
		expect(
			container.querySelector('[aria-label="Project status summary"]')
		).not.toBeInTheDocument();
		expect(screen.queryByText('ACTIVE NOW')).not.toBeInTheDocument();
		expect(screen.queryByText('RECOMMENDED NEXT')).not.toBeInTheDocument();
		expect(
			container.querySelector('header [aria-label="All projects"]')
		).not.toBeInTheDocument();
		expect(container.querySelector('header .rounded-full')).not.toBeInTheDocument();

		await fireEvent.click(briefButton);
		await waitFor(() => {
			expect(screen.getByRole('dialog', { name: 'Brief / Start Here' })).toBeInTheDocument();
		});
		const briefDialog = screen.getByRole('dialog', { name: 'Brief / Start Here' });
		expect(screen.getByRole('tab', { name: 'Daily Brief' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: "Today's focus" })).toBeInTheDocument();
		});
		expect(
			within(briefDialog).queryByRole('heading', { name: 'Project' })
		).not.toBeInTheDocument();
		expect(within(briefDialog).getByLabelText(/^Brief date:/)).toHaveAttribute(
			'datetime',
			'2026-08-14'
		);

		await fireEvent.click(screen.getByRole('tab', { name: 'Start Here Document' }));
		expect(
			within(briefDialog).getByText('This is the canonical project brief.')
		).toBeInTheDocument();
		expect(
			within(briefDialog).queryByText('Canonical project context')
		).not.toBeInTheDocument();
		expect(
			within(briefDialog).getAllByRole('heading', { name: 'START HERE - Project' })
		).toHaveLength(1);
		await fireEvent.click(screen.getByRole('button', { name: 'Open document' }));
		expect(pushState).toHaveBeenCalledOnce();
		const briefUrl = vi.mocked(pushState).mock.calls[0]?.[0];
		expect(typeof briefUrl).toBe('string');
		const parsedBriefUrl = new URL(briefUrl as string, window.location.origin);
		expect(parsedBriefUrl.searchParams.get('entity')).toBe('document');
		expect(parsedBriefUrl.searchParams.get('entity_id')).toBe(CONTEXT_DOCUMENT_ID);
	});

	it('surfaces the live Start Here snapshot and deep-links to its canonical document', async () => {
		render(ProjectWorkspace, {
			props: {
				data: projectData({ context_document: contextDocument() }) as any
			}
		});

		const memory = await screen.findByRole('region', { name: 'Project memory' });
		expect(within(memory).getByText('4 open tasks · 1 overdue')).toBeInTheDocument();
		expect(within(memory).getByText('Ship the launch email.')).toBeInTheDocument();
		expect(
			within(memory).getByText('This is the canonical project brief.')
		).toBeInTheDocument();
		await waitFor(() => {
			expect(mocks.trackLoopEvent).toHaveBeenCalledWith(
				'memory_snapshot_shown',
				'project',
				expect.objectContaining({
					project_id: PROJECT_ID,
					document_id: CONTEXT_DOCUMENT_ID,
					rendered: true,
					freshness: 'refreshed'
				})
			);
		});

		await fireEvent.click(within(memory).getByRole('button', { name: 'Open Start Here' }));
		expect(mocks.trackLoopEvent).toHaveBeenCalledWith(
			'start_here_opened',
			'project',
			expect.objectContaining({ source: 'memory_card' })
		);
		expect(pushState).toHaveBeenCalledOnce();
	});

	it('defaults to Overview when the URL does not select a workspace view', async () => {
		window.history.replaceState({}, '', '/workspace');
		render(ProjectWorkspace, {
			props: { data: projectData() as any }
		});

		expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		expect(screen.getByRole('tab', { name: 'Tasks 0' })).toHaveAttribute(
			'aria-selected',
			'false'
		);
		expect(screen.getByRole('tabpanel', { name: 'Overview' })).toBeInTheDocument();
	});

	it('restores the original project options without crowding the header', async () => {
		render(ProjectWorkspace, {
			props: {
				data: projectData({ context_document: contextDocument() }) as any
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Project options' }));
		const menu = await screen.findByRole('menu', { name: 'Project options' });
		expect(menu).toBeInTheDocument();
		expect(menu.parentElement).toBe(document.body);
		expect(document.querySelector('[data-project-options-dismiss-layer]')?.parentElement).toBe(
			document.body
		);
		expect(
			screen.getByRole('menuitem', { name: 'Collaboration settings' })
		).toBeInTheDocument();
		expect(screen.getByRole('menuitem', { name: 'Edit project' })).toBeInTheDocument();
		expect(screen.getByRole('menuitem', { name: 'Calendar settings' })).toBeInTheDocument();
		expect(screen.getByRole('menuitem', { name: 'Delete project' })).toBeInTheDocument();
		await waitFor(() => {
			expect(screen.getByRole('menuitem', { name: 'Turn notifications off' })).toBeEnabled();
		});
	});

	it('constrains long identity text without repeating the brief in Overview', async () => {
		render(ProjectWorkspace, {
			props: {
				data: projectData({
					project: {
						...projectData().project,
						name: LONG_NAME,
						description: LONG_BRIEF
					}
				}) as any
			}
		});

		await waitFor(() => {
			expect(screen.getByRole('tabpanel', { name: 'Overview' })).toBeInTheDocument();
		});

		const title = screen.getByRole('heading', { level: 1, name: LONG_NAME });
		expect(title).toHaveClass('min-w-0', 'flex-1', 'truncate');
		expect(document.title).toBe(`${LONG_NAME} · BuildOS`);

		const overview = screen.getByRole('tabpanel', { name: 'Overview' });
		expect(
			within(overview).queryByRole('heading', { name: 'Project map' })
		).not.toBeInTheDocument();
		expect(within(overview).queryByText(LONG_BRIEF)).not.toBeInTheDocument();
		expect(within(overview).queryByText('PROJECT BRIEF')).not.toBeInTheDocument();
		expect(within(overview).queryByText('STATUS')).not.toBeInTheDocument();
		expect(within(overview).queryByText('TARGET')).not.toBeInTheDocument();
		expect(within(overview).getByRole('heading', { name: 'Progress' })).toBeInTheDocument();
		expect(within(overview).getByText('Task completion')).toBeInTheDocument();
		expect(within(overview).getByText('Milestone timeline')).toBeInTheDocument();
	});

	it('keeps dense direction lists curated until the user asks for all items', async () => {
		render(ProjectWorkspace, {
			props: {
				data: projectData({ goals: goals(12), plans: plans(8) }) as any
			}
		});

		await waitFor(() => {
			expect(screen.getByText('12 goals · 8 plans')).toBeInTheDocument();
		});

		expect(
			screen.getByRole('button', { name: 'Goal 5 0 milestones · target Jan 15' })
		).toBeInTheDocument();
		expect(
			screen.queryByRole('button', { name: 'Goal 6 0 milestones · target Jan 15' })
		).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Show all 12 goals' }));
		expect(
			screen.getByRole('button', { name: 'Goal 12 0 milestones · target Jan 15' })
		).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Show fewer goals' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
	});

	it('keeps an empty Overview compact and free of Brief or Activity content', async () => {
		render(ProjectWorkspace, {
			props: {
				data: projectData({
					context_document: contextDocument(),
					events: [
						{
							id: 'event-1',
							title: 'Launch review',
							start_at: '2027-01-20T12:00:00.000Z',
							all_day: false
						}
					]
				}) as any
			}
		});

		await waitFor(() => {
			expect(screen.getByText('No direction set yet')).toBeInTheDocument();
		});

		const overview = screen.getByRole('tabpanel', { name: 'Overview' });
		expect(overview.querySelectorAll('.section-empty-state')).toHaveLength(3);
		expect(overview.querySelector('.empty-row')).not.toBeInTheDocument();
		expect(within(overview).queryByText('Coming up')).not.toBeInTheDocument();
		expect(within(overview).queryByText('Launch review')).not.toBeInTheDocument();
		expect(within(overview).queryByText('START HERE - Project')).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole('tab', { name: 'Docs 0' }));
		await waitFor(() => {
			expect(screen.getByRole('tabpanel', { name: 'Docs 0' })).toBeInTheDocument();
		});
		expect(screen.queryByText('RECENTLY UPDATED')).not.toBeInTheDocument();
	});

	it('gives documents one full-width hierarchy without a duplicate recent list', async () => {
		const document = projectDocument();
		render(ProjectWorkspace, {
			props: {
				data: projectData({
					documents: [document],
					project: {
						...projectData().project,
						doc_structure: {
							version: 1,
							root: [{ id: document.id, order: 0 }]
						}
					}
				}) as any
			}
		});

		await fireEvent.click(screen.getByRole('tab', { name: 'Docs 1' }));
		const docs = await screen.findByRole('tabpanel', { name: 'Docs 1' });

		expect(
			within(docs).getByRole('heading', { name: 'Project documents' })
		).toBeInTheDocument();
		expect(
			within(docs).queryByText('Find, open, and organize the knowledge behind this project.')
		).not.toBeInTheDocument();
		expect(await within(docs).findByLabelText('Project document tree')).toBeInTheDocument();
		expect(within(docs).getByText('Launch research')).toBeInTheDocument();
		expect(within(docs).queryByText('RECENTLY UPDATED')).not.toBeInTheDocument();
		expect(within(docs).queryByText('Quick access')).not.toBeInTheDocument();
	});

	it('keeps Activity focused on recent chats, change history, and the project schedule', async () => {
		render(ProjectWorkspace, {
			props: {
				data: projectData({
					events: [
						{
							id: 'event-1',
							title: 'Launch review',
							state_key: 'scheduled',
							start_at: '2027-01-20T12:00:00.000Z',
							end_at: '2027-01-20T13:00:00.000Z',
							all_day: false,
							deleted_at: null
						}
					]
				}) as any
			}
		});

		await fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
		const activity = await screen.findByRole('tabpanel', { name: 'Activity' });

		expect(
			within(activity).getByRole('heading', { name: 'Project activity' })
		).toBeInTheDocument();
		expect(
			within(activity).queryByText(
				'See recent chats, project changes, and what is scheduled.'
			)
		).not.toBeInTheDocument();
		expect(
			await within(activity).findByRole('heading', { name: 'Recent chats' })
		).toBeInTheDocument();
		expect(
			await within(activity).findByRole('button', {
				name: 'Reopen chat: Launch positioning review'
			})
		).toBeInTheDocument();
		expect(within(activity).getAllByText('Change history').length).toBeGreaterThan(0);
		expect(within(activity).getAllByText('Schedule').length).toBeGreaterThan(0);
		expect(within(activity).queryByText('Up next')).not.toBeInTheDocument();
		expect(screen.queryByRole('region', { name: 'Project search' })).not.toBeInTheDocument();
		expect(screen.queryByPlaceholderText('Find a project entity...')).not.toBeInTheDocument();
	});
});
