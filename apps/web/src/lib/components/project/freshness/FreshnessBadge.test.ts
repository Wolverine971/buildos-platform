// apps/web/src/lib/components/project/freshness/FreshnessBadge.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { FreshnessBadgeReadV1 } from '@buildos/shared-types';
import FreshnessBadge from './FreshnessBadge.svelte';
import OnTrackGauge from './OnTrackGauge.svelte';
import {
	PROJECT_FRESHNESS_CONTEXT_KEY,
	ProjectFreshnessState,
	type FreshnessBadgeFlag
} from './freshness-context.svelte';

const mutationMocks = vi.hoisted(() => ({ notifyDataMutation: vi.fn() }));
vi.mock('$lib/stores/projectDataMutations', () => ({
	notifyDataMutation: mutationMocks.notifyDataMutation
}));

function apiResponse(data: unknown, status = 200): Response {
	return new Response(
		JSON.stringify(
			status < 400 ? { success: true, data } : { success: false, error: String(data) }
		),
		{ status, headers: { 'Content-Type': 'application/json' } }
	);
}

function flag(overrides: Partial<FreshnessBadgeFlag> = {}): FreshnessBadgeFlag {
	return {
		flagId: 'flag-1',
		scanId: 'scan-1',
		entity: { kind: 'task', id: 'task-1' },
		probability: 0.78,
		label: 'may_be_out_of_date',
		evidenceExcerpt: 'the deck went out Tuesday',
		suggestionId: 'bundle-1',
		createdAt: '2026-09-18T15:00:00.000Z',
		undoableUntil: null,
		...overrides
	};
}

function badgeRead(flags: FreshnessBadgeFlag[]): FreshnessBadgeReadV1 {
	return {
		version: 'freshness_badges_v1',
		projectId: 'project-1',
		scannedAt: '2026-09-18T15:00:00.000Z',
		flags,
		gauges: [
			{
				entity: { kind: 'goal', id: 'goal-1' },
				gauge: 'at_risk',
				score: 1.1,
				scoredAt: '2026-09-18T15:00:00.000Z',
				scanId: 'scan-1'
			}
		]
	};
}

async function stateWith(read: FreshnessBadgeReadV1, post: Response[] = []) {
	const fetchFn = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
		if (!init?.method) return apiResponse(read);
		const next = post.shift();
		if (!next) throw new Error('unexpected POST');
		return next;
	});
	const state = new ProjectFreshnessState('project-1', fetchFn as typeof fetch);
	await state.refresh();
	return { state, fetchFn };
}

function renderBadge(state: ProjectFreshnessState | null, props = { kind: 'task', id: 'task-1' }) {
	return render(FreshnessBadge, {
		props: props as { kind: 'task'; id: string },
		context: new Map(state ? [[PROJECT_FRESHNESS_CONTEXT_KEY, state]] : [])
	});
}

afterEach(() => {
	vi.useRealTimers();
	mutationMocks.notifyDataMutation.mockReset();
});

describe('ProjectFreshnessState', () => {
	it('keeps one badge per entity, preferring an automatic update, and indexes gauges', async () => {
		const { state, fetchFn } = await stateWith(
			badgeRead([
				flag({ flagId: 'a', probability: 0.95 }),
				flag({ flagId: 'b', label: 'updated_automatically', probability: 0.91 }),
				flag({ flagId: 'c', entity: { kind: 'document', id: 'doc-1' } })
			])
		);
		expect(fetchFn).toHaveBeenCalledWith(
			'/api/onto/projects/project-1/freshness',
			expect.objectContaining({ cache: 'no-store' })
		);
		expect(state.flagFor('task', 'task-1')?.flagId).toBe('b');
		expect(state.flaggedIds('document')).toEqual(['doc-1']);
		expect(state.gaugeFor('goal', 'goal-1')?.gauge).toBe('at_risk');
		expect(state.gaugeFor('milestone', 'goal-1')).toBeNull();
	});

	it('keeps the last good read when a refresh fails', async () => {
		const { state, fetchFn } = await stateWith(badgeRead([flag()]));
		fetchFn.mockResolvedValueOnce(apiResponse('boom', 500));
		await state.refresh();
		expect(state.flagFor('task', 'task-1')?.flagId).toBe('flag-1');
	});
});

describe('FreshnessBadge', () => {
	it('renders nothing without a flag or without the page context', async () => {
		const { state } = await stateWith(badgeRead([]));
		renderBadge(state);
		expect(screen.queryByRole('button')).toBeNull();
		renderBadge(null);
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('opens a small panel with the estimate and the user’s words, and records "Not out of date"', async () => {
		const { state, fetchFn } = await stateWith(badgeRead([flag()]), [
			apiResponse({ flag: { status: 'dismissed' }, suggestionId: 'bundle-2' })
		]);
		renderBadge(state);
		const trigger = screen.getByRole('button', { name: 'May be out of date' });
		expect(trigger).toHaveAttribute('aria-expanded', 'false');
		await fireEvent.click(trigger);
		const dialog = screen.getByRole('dialog', { name: 'May be out of date' });
		expect(dialog).toHaveTextContent('78% · model estimate');
		expect(dialog).toHaveTextContent('“the deck went out Tuesday”');
		await fireEvent.click(screen.getByRole('button', { name: 'Not out of date' }));
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		const post = fetchFn.mock.calls.find(([, init]) => init?.method === 'POST')!;
		expect(post[0]).toBe('/api/onto/projects/project-1/freshness/flags/flag-1');
		expect(state.flagFor('task', 'task-1')).toBeNull();
		await waitFor(() =>
			expect(screen.queryByRole('button', { name: 'May be out of date' })).toBeNull()
		);
	});

	it('undoes an automatic update inside the window and tells the page to refresh', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-09-18T16:00:00.000Z'));
		const auto = flag({
			label: 'updated_automatically',
			undoableUntil: '2026-09-21T15:00:00.000Z'
		});
		const { state, fetchFn } = await stateWith(badgeRead([auto]), [
			apiResponse({ version: 'freshness_undo_v1', undone: ['flag-1'], skipped: [] })
		]);
		renderBadge(state);
		await fireEvent.click(screen.getByRole('button', { name: 'Updated automatically' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
		await waitFor(() => expect(state.flagFor('task', 'task-1')).toBeNull());
		const post = fetchFn.mock.calls.find(([, init]) => init?.method === 'POST')!;
		expect(post[0]).toBe('/api/onto/projects/project-1/freshness/scans/scan-1/undo');
		expect(JSON.parse(String(post[1]!.body))).toEqual({ flag_ids: ['flag-1'] });
		expect(mutationMocks.notifyDataMutation).toHaveBeenCalledWith(
			expect.objectContaining({ affectedProjectIds: ['project-1'] })
		);
	});

	it('explains an undo the server skipped because the task changed since', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-09-18T16:00:00.000Z'));
		const auto = flag({
			label: 'updated_automatically',
			undoableUntil: '2026-09-21T15:00:00.000Z'
		});
		const { state } = await stateWith(badgeRead([auto]), [
			apiResponse({
				version: 'freshness_undo_v1',
				undone: [],
				skipped: [{ flagId: 'flag-1', reason: 'changed_since' }]
			})
		]);
		renderBadge(state);
		await fireEvent.click(screen.getByRole('button', { name: 'Updated automatically' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
		expect(await screen.findByRole('status')).toHaveTextContent(
			'It changed since, so it was left as is.'
		);
		expect(state.flagFor('task', 'task-1')?.flagId).toBe('flag-1');
	});

	it('offers no undo after the window closes', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-09-22T16:00:00.000Z'));
		const { state } = await stateWith(
			badgeRead([
				flag({ label: 'updated_automatically', undoableUntil: '2026-09-21T15:00:00.000Z' })
			])
		);
		renderBadge(state);
		await fireEvent.click(screen.getByRole('button', { name: 'Updated automatically' }));
		expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
		expect(screen.getByText('The undo window has closed.')).toBeInTheDocument();
	});

	it('closes on Escape and returns focus to the badge', async () => {
		const { state } = await stateWith(badgeRead([flag()]));
		renderBadge(state);
		const trigger = screen.getByRole('button', { name: 'May be out of date' });
		await fireEvent.click(trigger);
		expect(screen.getByRole('dialog')).toBeInTheDocument();
		await fireEvent.keyDown(document, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(document.activeElement).toBe(trigger);
	});
});

describe('OnTrackGauge', () => {
	it('names the state in words, never by color alone', () => {
		render(OnTrackGauge, { gauge: 'off_track', subject: 'Launch' });
		expect(
			screen.getByRole('img', { name: 'Launch: off track (model estimate)' })
		).toHaveAttribute('data-gauge', 'off_track');
		expect(screen.getByText('Off track')).toBeInTheDocument();
	});
});
