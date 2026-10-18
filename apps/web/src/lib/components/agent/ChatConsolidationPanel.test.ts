// apps/web/src/lib/components/agent/ChatConsolidationPanel.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import ChatConsolidationPanel from './ChatConsolidationPanel.svelte';
import { DEST, RUN, SOURCE, fixtureId, jsonResponse } from './proposal-cards.fixture';

const goto = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto }));

const FULL_RUN = fixtureId(40);
const DOC_A = fixtureId(41);
const DOC_B = fixtureId(42);

const checkedView = {
	run: {
		id: RUN,
		user_id: fixtureId(43),
		root_project_id: DEST,
		project_ids: [DEST, SOURCE],
		mode: 'check',
		request: null,
		status: 'checked',
		progress: { stage: 'done', documents: 2 },
		plan: {
			version: 1,
			projects: {
				[DEST]: { name: 'DJ Internal', parent: false },
				[SOURCE]: { name: 'Content Ops', parent: false }
			},
			documents: {
				[DOC_A]: { title: 'Rate card', project_id: DEST },
				[DOC_B]: { title: 'Rate card (copy)', project_id: SOURCE }
			},
			tasks: {},
			clusters: [
				{
					key: 'twins:1',
					kind: 'twins',
					title: 'Rate card',
					reason: 'Same text',
					document_ids: [DOC_A, DOC_B],
					task_ids: [],
					ops: [],
					question_id: null,
					vetoed: false
				}
			]
		},
		receipt: null,
		cost_usd: 0.03,
		error: null,
		created_at: '2026-10-17T22:08:54Z',
		updated_at: '2026-10-17T22:11:27Z',
		finished_at: '2026-10-17T22:11:27Z'
	},
	questions: [],
	merges: [],
	ready_count: 0,
	ready_ops: [],
	waiting: []
};

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	goto.mockReset();
});

describe('ChatConsolidationPanel', () => {
	it('shows the check beside the chat and starts the full review in place, without navigating', async () => {
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (url === '/api/consolidation/runs' && init?.method === 'POST')
				return jsonResponse(200, { success: true, data: { run_id: FULL_RUN } });
			if (url === `/api/consolidation/runs/${RUN}`)
				return jsonResponse(200, { success: true, data: checkedView });
			return jsonResponse(404, { success: false, error: 'not found' });
		});
		vi.stubGlobal('fetch', fetchMock);
		const onClose = vi.fn();
		const onOpenRun = vi.fn();
		render(ChatConsolidationPanel, { runId: RUN, onClose, onOpenRun });

		expect((await screen.findAllByText('DJ Internal')).length).toBeGreaterThan(0);
		expect(screen.getByText('Duplicate check')).toBeTruthy();
		// The page's own header and back link stay out of the panel.
		expect(screen.queryByRole('heading', { level: 1 })).toBeNull();

		screen.getByRole('button', { name: 'Review and merge' }).click();
		await vi.waitFor(() => expect(onOpenRun).toHaveBeenCalledWith(FULL_RUN));
		const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
		expect(JSON.parse(String(post?.[1]?.body))).toEqual({
			project_ids: [DEST, SOURCE],
			mode: 'full'
		});
		expect(goto).not.toHaveBeenCalled();

		screen.getByRole('button', { name: 'Close review' }).click();
		expect(onClose).toHaveBeenCalledOnce();
	});

	it('says so when the run cannot be loaded', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				jsonResponse(404, { success: false, error: 'Consolidation not found.' })
			)
		);
		render(ChatConsolidationPanel, { runId: RUN, onClose: vi.fn(), onOpenRun: vi.fn() });
		expect((await screen.findByRole('alert')).textContent).toContain(
			'Consolidation not found.'
		);
	});
});
