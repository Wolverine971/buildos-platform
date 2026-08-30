// apps/web/src/routes/notifications/page.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import NotificationsPage from './+page.svelte';
import type { ActivityEntry, ActivityTimelinePage } from '$lib/types/activity-timeline';

function entry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
	return {
		id: 'entry-1',
		lane: 'agent',
		kind: 'project_audit',
		occurred_at: new Date().toISOString(),
		title: 'Project audit — BuildOS',
		body: 'Docs are drifting from the plan.',
		project_id: 'project-1',
		project_name: 'BuildOS',
		actor: 'agent',
		actor_label: 'Audit agent · scheduled pass',
		status: 'warn',
		stats: [{ label: 'Unresolved', value: 3 }],
		href: '/projects/project-1',
		children: [],
		count: 1,
		...overrides
	};
}

function page(overrides: Partial<ActivityTimelinePage> = {}): ActivityTimelinePage {
	return { entries: [entry()], nextCursor: null, hasMore: false, degraded: [], ...overrides };
}

beforeEach(() => {
	// jsdom has no IntersectionObserver; the sentinel effect needs one to exist.
	vi.stubGlobal(
		'IntersectionObserver',
		class {
			observe() {}
			disconnect() {}
			unobserve() {}
		}
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('/notifications activity timeline', () => {
	it('renders an entry with its actor, body, stats, and link', () => {
		render(NotificationsPage, { props: { data: { page: page(), error: null } } });

		expect(screen.getByText('Audit agent · scheduled pass')).toBeInTheDocument();
		expect(screen.getByText('Docs are drifting from the plan.')).toBeInTheDocument();
		expect(screen.getByText('Unresolved')).toBeInTheDocument();
		// The title is the card's click target, so the whole card opens the entry.
		expect(screen.getByRole('link', { name: 'Project audit — BuildOS' })).toHaveAttribute(
			'href',
			'/projects/project-1'
		);
	});

	it('links the project separately when the card opens something else', () => {
		render(NotificationsPage, {
			props: {
				data: {
					page: page({
						entries: [
							entry({
								kind: 'chat_session',
								lane: 'you',
								title: 'Reactivation planning',
								actor_label: 'Chat · BuildOS',
								href: '/history?id=chat-1&itemType=chat_session'
							})
						]
					}),
					error: null
				}
			}
		});

		expect(screen.getByRole('link', { name: 'Reactivation planning' })).toHaveAttribute(
			'href',
			'/history?id=chat-1&itemType=chat_session'
		);
		expect(screen.getByRole('link', { name: 'BuildOS' })).toHaveAttribute(
			'href',
			'/projects/project-1'
		);
		// The project has its own link, so it is not repeated in the actor line.
		expect(screen.getByText('Chat')).toBeInTheDocument();
	});

	it('does not offer a second link to a project the card already opens', () => {
		render(NotificationsPage, { props: { data: { page: page(), error: null } } });

		expect(screen.queryByRole('link', { name: 'BuildOS' })).not.toBeInTheDocument();
	});

	it('links review-pass children to their project even without an entity', () => {
		render(NotificationsPage, {
			props: {
				data: {
					page: page({
						entries: [
							entry({
								kind: 'loop_run',
								title: 'Reviewed 3 projects',
								href: null,
								project_id: null,
								project_name: null,
								children: [
									{
										id: 'loop:1',
										label: 'BuildOS',
										detail: '4 suggestions',
										at: new Date().toISOString(),
										project_id: 'project-9'
									}
								]
							})
						]
					}),
					error: null
				}
			}
		});

		fireEvent.click(screen.getByRole('button', { name: /1 detail/ }));

		return waitFor(() =>
			expect(screen.getByRole('link', { name: 'BuildOS' })).toHaveAttribute(
				'href',
				'/projects/project-9'
			)
		);
	});

	it('separates entries into day headings', () => {
		const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
		render(NotificationsPage, {
			props: {
				data: {
					page: page({
						entries: [
							entry({ id: 'today-1' }),
							entry({ id: 'old-1', occurred_at: twoDaysAgo })
						]
					}),
					error: null
				}
			}
		});

		expect(screen.getByText('Today')).toBeInTheDocument();
		// Anything older than yesterday is labelled by weekday or date, never "Today".
		expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
	});

	it('hides grouped details until the entry is expanded', async () => {
		render(NotificationsPage, {
			props: {
				data: {
					page: page({
						entries: [
							entry({
								kind: 'entity_changes',
								lane: 'you',
								title: 'Updated 2 tasks in BuildOS',
								children: [
									{
										id: 'child-1',
										label: 'Ship the timeline',
										detail: 'Updated · task',
										at: new Date().toISOString(),
										entity_type: 'task',
										entity_id: 'task-1',
										project_id: 'project-1'
									}
								]
							})
						]
					}),
					error: null
				}
			}
		});

		expect(screen.queryByText('Ship the timeline')).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: /1 detail/ }));

		expect(screen.getByText('Ship the timeline')).toBeInTheDocument();
	});

	it('shows the empty state when there is no activity', () => {
		render(NotificationsPage, {
			props: { data: { page: page({ entries: [] }), error: null } }
		});

		expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
	});

	it('surfaces a load error from the server', () => {
		render(NotificationsPage, {
			props: { data: { page: page({ entries: [] }), error: 'Failed to load activity.' } }
		});

		expect(screen.getByText('Failed to load activity.')).toBeInTheDocument();
	});

	it('names the sources that failed so a partial page is not read as complete', () => {
		render(NotificationsPage, {
			props: { data: { page: page({ degraded: ['audits', 'chats'] }), error: null } }
		});

		expect(screen.getByText(/audits, chats/)).toBeInTheDocument();
	});

	it('refetches scoped to a lane when a filter is chosen', async () => {
		const fetchMock = vi.fn(async (_input: RequestInfo | URL) => ({
			ok: true,
			json: async () => ({
				success: true,
				data: page({
					entries: [entry({ id: 'ping-1', lane: 'ping', title: 'Brief ready' })]
				})
			})
		}));
		vi.stubGlobal('fetch', fetchMock);

		render(NotificationsPage, { props: { data: { page: page(), error: null } } });

		await fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(String(fetchMock.mock.calls[0]![0])).toContain('lanes=ping');
		await waitFor(() => expect(screen.getByText('Brief ready')).toBeInTheDocument());
		expect(screen.queryByText('Project audit — BuildOS')).not.toBeInTheDocument();
	});

	it('appends the next page and drops entries already on screen', async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			json: async () => ({
				success: true,
				data: page({
					// `entry-1` is already rendered: the inclusive cursor can repeat a
					// boundary entry, and it must not render twice.
					entries: [entry(), entry({ id: 'entry-2', title: 'Older audit' })],
					nextCursor: null,
					hasMore: false
				})
			})
		}));
		vi.stubGlobal('fetch', fetchMock);

		render(NotificationsPage, {
			props: {
				data: {
					page: page({ nextCursor: '2026-07-20T00:00:00.000Z', hasMore: true }),
					error: null
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

		await waitFor(() => expect(screen.getByText('Older audit')).toBeInTheDocument());
		expect(screen.getAllByText('Project audit — BuildOS')).toHaveLength(1);
	});

	it('stops paging when the feed stops advancing', async () => {
		const stuckCursor = '2026-07-20T00:00:00.000Z';
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				json: async () => ({
					success: true,
					// Same entry, same cursor: the feed cannot make progress.
					data: page({ entries: [entry()], nextCursor: stuckCursor, hasMore: true })
				})
			}))
		);

		render(NotificationsPage, {
			props: { data: { page: page({ nextCursor: stuckCursor, hasMore: true }), error: null } }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

		await waitFor(() =>
			expect(screen.getByText("That's the whole timeline.")).toBeInTheDocument()
		);
		expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
	});

	it('reports a failed page fetch instead of spinning', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: false,
				json: async () => ({ success: false, error: 'nope' })
			}))
		);

		render(NotificationsPage, {
			props: {
				data: {
					page: page({ nextCursor: '2026-07-20T00:00:00.000Z', hasMore: true }),
					error: null
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

		await waitFor(() =>
			expect(screen.getByText('Could not load more activity.')).toBeInTheDocument()
		);
	});
});
