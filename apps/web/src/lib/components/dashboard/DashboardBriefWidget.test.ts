// apps/web/src/lib/components/dashboard/DashboardBriefWidget.test.ts
// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	client: null as { from: ReturnType<typeof vi.fn> } | null,
	row: null as Record<string, unknown> | null,
	ensureTodaysBrief: vi.fn(),
	completed: null as unknown as import('svelte/store').Writable<{
		briefDate: string;
		timestamp: number;
	} | null>
}));

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/supabase/context', () => ({ getSupabaseContext: () => mocks.client }));
vi.mock('$lib/services/ensure-today-brief', () => ({
	ensureTodaysBrief: mocks.ensureTodaysBrief
}));
vi.mock('$lib/services/briefClient.service', async () => {
	const { writable: store } = await import('svelte/store');
	mocks.completed = store(null);
	return {
		BriefClientService: { startStreamingGeneration: vi.fn() },
		streamingStatus: store(null),
		briefGenerationCompleted: mocks.completed
	};
});

import DashboardBriefWidget from './DashboardBriefWidget.svelte';

const TODAY = '2026-10-06';

function queryClient() {
	const chain: Record<string, unknown> = {};
	for (const method of ['select', 'eq', 'order', 'limit']) {
		chain[method] = vi.fn(() => chain);
	}
	chain.maybeSingle = vi.fn(async () => ({ data: mocks.row, error: null }));
	return { from: vi.fn(() => chain) };
}

const user = { id: 'user-1', timezone: 'UTC' };

describe('DashboardBriefWidget', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(`${TODAY}T15:00:00Z`));
		mocks.client = queryClient();
		mocks.row = {
			id: 'brief-1',
			user_id: 'user-1',
			brief_date: TODAY,
			executive_summary: null,
			llm_analysis: 'Ship the fix today.',
			priority_actions: ['Fix brief chip', 'Write tests'],
			generation_status: 'completed',
			created_at: `${TODAY}T08:00:00Z`,
			updated_at: `${TODAY}T08:00:00Z`
		};
		mocks.ensureTodaysBrief.mockReset().mockResolvedValue(null);
		mocks.completed.set(null);
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	it("opens today's brief with the shared row mapping (summary falls back to the analysis)", async () => {
		const onviewbrief = vi.fn();
		render(DashboardBriefWidget, { props: { user, onviewbrief } });

		const chip = await screen.findByRole('button', { name: /Today's brief/ });
		expect(chip).toHaveTextContent('2 priorities');
		expect(mocks.ensureTodaysBrief).not.toHaveBeenCalled();

		chip.click();
		expect(onviewbrief).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'brief-1',
				chat_brief_id: 'brief-1',
				summary_content: 'Ship the fix today.'
			})
		);
	});

	it('queries once on mount even when an earlier completion event is still in the store', async () => {
		mocks.completed.set({ briefDate: TODAY, timestamp: Date.now() });

		render(DashboardBriefWidget, { props: { user } });
		await screen.findByRole('button', { name: /Today's brief/ });

		expect(mocks.client!.from).toHaveBeenCalledTimes(1);
	});

	it('refetches when generation completes while mounted', async () => {
		mocks.row = null;
		render(DashboardBriefWidget, { props: { user } });
		await screen.findByRole('button', { name: /Generate brief/ });
		expect(mocks.ensureTodaysBrief).toHaveBeenCalledTimes(1);

		mocks.row = {
			id: 'brief-2',
			user_id: 'user-1',
			brief_date: TODAY,
			executive_summary: 'Fresh brief',
			priority_actions: [],
			generation_status: 'completed'
		};
		mocks.completed.set({ briefDate: TODAY, timestamp: Date.now() });

		await screen.findByRole('button', { name: /Today's brief/ });
		expect(mocks.client!.from).toHaveBeenCalledTimes(2);
	});

	it('shows the generate chip instead of crashing when no client is available', async () => {
		mocks.client = null;
		render(DashboardBriefWidget, { props: { user } });

		await waitFor(() =>
			expect(screen.getByRole('button', { name: /Generate brief/ })).toBeInTheDocument()
		);
	});
});
