// apps/web/src/lib/components/dashboard/DashboardInboxModal.check-ins.test.ts
// @vitest-environment jsdom
// Check-ins in the AI Inbox modal: they join the rail by project, lead the project's
// panel, and quiet projects sit under "Gone quiet".

import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckInProject } from '$lib/types/inbox-check-ins';

vi.mock('$app/paths', () => ({
	resolve: (path: string, params?: Record<string, string>) =>
		params?.id ? path.replace('[id]', params.id) : path
}));

const setAiInboxRemainingCount = vi.hoisted(() => vi.fn());
vi.mock('$lib/stores/aiInboxCount.store', () => ({ setAiInboxRemainingCount }));

import DashboardInboxModal from './DashboardInboxModal.svelte';

const WAYNE = 'project-wayne';
const CEO = 'project-ceo';

function checkInProject(overrides: Partial<CheckInProject>): CheckInProject {
	return {
		project_id: WAYNE,
		project_name: 'Wayne Strategies',
		project_state: 'active',
		project_updated_at: '2026-10-20T00:00:00Z',
		last_touched_at: '2026-10-28T00:00:00Z',
		last_touched_date: '2026-10-28',
		quiet: false,
		overdue_count: 2,
		oldest_due_date: '2026-10-07',
		newest_due_date: '2026-10-07',
		truncated: false,
		groups: [
			{
				key: `${WAYNE}:2026-10-07`,
				due_date: '2026-10-07',
				label: 'Oct 7',
				task_count: 2,
				tasks: [
					{
						id: 't1',
						title: 'Call Dauntless Dogs',
						state_key: 'todo',
						due_at: '2026-10-07T13:00:00Z'
					},
					{
						id: 't2',
						title: "Walk in: Cindy's Hot Shots",
						state_key: 'todo',
						due_at: '2026-10-07T14:00:00Z'
					}
				]
			}
		],
		...overrides
	};
}

function json(data: unknown) {
	return new Response(JSON.stringify({ success: true, data }), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
}

describe('DashboardInboxModal check-ins', () => {
	beforeEach(() => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/api/inbox/check-ins')) {
				return json({
					projects: [
						checkInProject({}),
						checkInProject({
							project_id: CEO,
							project_name: 'BuildOS CEO Training Sprint',
							quiet: true,
							last_touched_at: '2026-08-11T00:00:00Z',
							last_touched_date: '2026-08-11',
							overdue_count: 12,
							oldest_due_date: '2026-07-10',
							groups: []
						})
					],
					time_zone: 'America/New_York',
					today: '2026-10-29',
					card_count: 2,
					task_count: 14
				});
			}
			return json({ items: [], total: 0, heldTotal: 0 });
		});
		vi.stubGlobal('fetch', fetchMock);
		// jsdom has no scrolling; the modal's scroll lock calls it on close.
		vi.stubGlobal('scrollTo', vi.fn());
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('lists check-in projects in the rail and opens the first one’s cards', async () => {
		render(DashboardInboxModal, { props: { isOpen: true, onClose: vi.fn() } });

		const rail = await screen.findByRole('tablist', { name: 'Inbox groups' });
		const tabs = within(rail).getAllByRole('tab');
		expect(tabs.map((tab) => tab.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
			expect.stringContaining('Wayne Strategies'),
			expect.stringContaining('BuildOS CEO Training Sprint')
		]);
		expect(within(rail).getByText('2 to confirm')).toBeInTheDocument();
		expect(within(rail).getByText('Still on?')).toBeInTheDocument();
		expect(within(rail).getByText('Gone quiet')).toBeInTheDocument();

		expect(await screen.findByRole('heading', { name: 'Oct 7 · 2 tasks' })).toBeInTheDocument();
		expect(screen.getByText('2 items need attention')).toBeInTheDocument();
		await waitFor(() => expect(setAiInboxRemainingCount).toHaveBeenLastCalledWith(2));
	});
});
