// apps/web/src/lib/components/inbox/InboxProjectCleanup.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	ProjectCleanupAsk,
	ProjectCleanupItem,
	ProjectCleanupView
} from '@buildos/shared-types';
import InboxProjectCleanup from './InboxProjectCleanup.svelte';
import { CLEANUP_CHANGED_MESSAGE } from './project-cleanup-presentation';

function row(id: string, fingerprint: string | null, extra: Record<string, unknown> = {}) {
	return {
		suggestion_id: id,
		kind: 'doc_org' as const,
		title: `Row ${id}`,
		operation_count: fingerprint ? 1 : 0,
		verified_headline: fingerprint ? `Archive ${id}` : null,
		verified_fingerprint: fingerprint,
		...(fingerprint
			? {
					verified_operations: [
						{
							key: `${id}-op`,
							action: 'update',
							actionLabel: 'Archive',
							entityLabel: 'document',
							target: `Doc ${id}`,
							summary: null,
							changes: [{ label: 'State', value: 'archived', before: 'active' }]
						}
					]
				}
			: {}),
		updated_at: '2026-09-29T12:00:00.000Z',
		...extra
	};
}

function item(overrides: Partial<ProjectCleanupItem>): ProjectCleanupItem {
	return {
		id: 'item',
		source: 'review',
		kind: 'doc_org',
		section: 'safe_cleanup',
		title: 'Item',
		summary: null,
		why_now: null,
		executable: true,
		rows: [],
		evidence_refs: [],
		seen_count: 1,
		first_seen_at: '2026-09-04T12:00:00.000Z',
		updated_at: '2026-09-29T12:00:00.000Z',
		...overrides
	};
}

const archivePolitical = item({
	id: 'political',
	ask_kind: 'tidy',
	title: 'Archive Political Analysis',
	summary: 'Empty since May and nothing links to it.',
	seen_count: 3,
	rows: [
		row('s-political', 'fp-political', {
			tree_operations: [
				{ tool: 'archive_onto_document', args: { document_id: 'doc-political' } }
			]
		})
	]
});
const archiveStubs = item({
	id: 'stubs',
	ask_kind: 'tidy',
	title: 'Archive the empty blog stubs',
	rows: [
		row('s-stub-1', 'fp-stub-1', {
			tree_operations: [
				{ tool: 'archive_onto_document', args: { document_id: 'doc-stub-1' } }
			]
		}),
		row('s-stub-2', 'fp-stub-2')
	]
});
const goalCall = item({
	id: 'goal',
	kind: 'drift',
	section: 'needs_call',
	ask_kind: 'stale',
	title: 'Maryland Content Authority goal drifted',
	executable: false,
	rows: [row('s-goal', null)]
});
const radar = item({
	id: 'radar',
	kind: 'freshness_update',
	source: 'radar',
	section: 'needs_call',
	ask_kind: 'stale',
	title: 'Two records look out of date',
	executable: false,
	rows: [row('s-radar', null)],
	review_items: [
		{
			concern_id: 'c-1',
			entity_type: 'goal',
			entity_id: 'goal-1',
			title: 'Rod goal',
			reason: 'Rod moved to Beyond Exit Planning.',
			fix_in_chat_prompt: 'Move the Rod goal to Beyond Exit Planning'
		}
	]
});
const cautious = item({
	id: 'cautious',
	section: 'needs_call',
	ask_kind: 'path',
	title: 'Archive the Rod folder',
	rows: [row('s-rod', 'fp-rod', { cautions: ['This folder has 4 documents inside.'] })]
});
const offer = item({
	id: 'offer',
	kind: 'audit_recommendation',
	source: 'audit',
	section: 'note',
	ask_kind: 'offer',
	title: 'Name the next decision and what could change it',
	summary: 'I would read the outreach tasks, then ask two or three questions.',
	executable: false,
	rows: [row('s-offer', null)]
});

function cleanupView(overrides: Partial<ProjectCleanupView> = {}): ProjectCleanupView {
	return {
		project_id: 'project-1',
		items: [archivePolitical, archiveStubs, goalCall, radar, cautious, offer],
		groups: [
			{
				title: 'Archive stale docs',
				section: 'safe_cleanup',
				item_ids: ['political', 'stubs'],
				recommendation: 'None of these have been touched since May.'
			},
			{
				title: 'Needs your call',
				section: 'needs_call',
				item_ids: ['goal', 'radar', 'cautious'],
				recommendation: null
			},
			{ title: 'Worth knowing', section: 'note', item_ids: ['offer'], recommendation: null }
		],
		bottom_line: 'Nine stale docs can go; one goal needs a new direction.',
		recommendation: 'Archive the stale docs, then decide the Maryland goal.',
		synthesized_at: '2026-09-29T06:00:00.000Z',
		latest_run_id: 'run-1',
		latest_audit: null,
		counts: { total: 6, safe_cleanup: 2, needs_call: 3, note: 1 },
		recently_closed: [
			{
				lineage_id: 'closed-1',
				title: 'Book Research folder',
				reason: 'subject_archived',
				detail: '',
				at: '2026-09-29T06:00:00.000Z'
			},
			{
				lineage_id: 'closed-2',
				title: 'Biz Expo notes',
				reason: 'revised',
				detail: '',
				at: '2026-09-29T06:00:00.000Z'
			}
		],
		...overrides
	};
}

// A pre-written question that settles a stale goal and a ready archive together.
const rodGoal = item({
	id: 'rod-goal',
	kind: 'drift',
	section: 'needs_call',
	ask_kind: 'stale',
	title: 'Goal: Launch Rob Chamberlin book website',
	executable: false,
	rows: [row('s-rod-goal', null)]
});
const rodPlan = item({
	id: 'rod-plan',
	ask_kind: 'tidy',
	title: 'Archive: Rod Chamberlin Project Recovery Plan',
	rows: [row('s-rod-plan', 'fp-rod-plan')]
});

function rodAsk(answers: ProjectCleanupAsk['answers']): ProjectCleanupAsk {
	return {
		id: 'rod',
		question: 'Is the Rod Chamberlin website still happening?',
		context: 'Two items on this card are really this one question.',
		item_ids: ['rod-goal', 'rod-plan'],
		answers
	};
}

function askView(answers: ProjectCleanupAsk['answers']): ProjectCleanupView {
	return cleanupView({
		items: [rodGoal, rodPlan, archivePolitical],
		groups: [
			{
				title: 'Ready',
				section: 'safe_cleanup',
				item_ids: ['rod-plan', 'political'],
				recommendation: null
			},
			{
				title: 'Calls',
				section: 'needs_call',
				item_ids: ['rod-goal'],
				recommendation: null
			}
		],
		counts: { total: 3, safe_cleanup: 2, needs_call: 1, note: 0 },
		asks: [rodAsk(answers)]
	});
}

const ROD_ANSWERS: ProjectCleanupAsk['answers'] = [
	{
		label: 'Still going',
		effect: "I'll update the Rod doc with where it stands.",
		action: 'chat',
		recommended: false
	},
	{
		label: 'On hold',
		effect: 'Mark the goal on hold with a date.',
		action: 'note',
		recommended: true
	},
	{
		label: "It's over",
		effect: 'Archive the recovery plan.',
		action: 'apply',
		recommended: false
	}
];

function jsonResponse(data: unknown, status = 200) {
	return new Response(JSON.stringify(status < 400 ? { success: true, data } : data), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function card(name: string | RegExp) {
	return within(screen.getByRole('article', { name }));
}

describe('InboxProjectCleanup', () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		fetchMock.mockReset();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('sorts items into blocks by what they ask, with checkboxes only for tidy-ups', () => {
		render(InboxProjectCleanup, {
			props: { view: cleanupView(), projectId: 'project-1', canDecide: true }
		});

		expect(
			screen.getByText('Nine stale docs can go; one goal needs a new direction.')
		).toBeInTheDocument();
		expect(
			screen.getByText('Archive the stale docs, then decide the Maryland goal.')
		).toBeInTheDocument();
		const open = screen.getByRole('list', { name: "What's open" });
		expect(open).toHaveTextContent(/1\s*path to pick/);
		expect(open).toHaveTextContent(/2\s*tidy-ups/);
		expect(open).toHaveTextContent(/2\s*out of date/);
		expect(open).toHaveTextContent(/1\s*offer/);

		const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
		expect(headings.map((text) => text?.replace(/\s+/g, ' ').trim())).toEqual([
			'Pick a path (1)',
			'Tidy-ups (2)',
			'Out of date (2)',
			'Want me to…? (1)'
		]);

		// Tidy-ups are picked; the path is answered.
		expect(
			screen.getByRole('checkbox', { name: 'Archive Political Analysis' })
		).toBeInTheDocument();
		expect(screen.getByRole('checkbox', { name: 'Select all 2' })).toBeInTheDocument();
		expect(screen.getAllByRole('checkbox')).toHaveLength(3);
		const rod = card('Archive the Rod folder');
		expect(rod.getByRole('button', { name: /Make this change\s*Recommended/ })).toBeEnabled();
		expect(rod.getByRole('button', { name: /Keep as is/ })).toBeEnabled();
		expect(rod.getByText('This folder has 4 documents inside.')).toBeInTheDocument();
		expect(rod.getByText('What changes')).toBeInTheDocument();

		expect(screen.getByText(/^Seen in 3 reviews since /)).toBeInTheDocument();
		expect(
			screen.getByText("Anything you don't pick stays here for later.")
		).toBeInTheDocument();
		// No one-size-fits-all "Done" on audit offers.
		expect(screen.queryByRole('button', { name: /^Done/ })).not.toBeInTheDocument();
	});

	it('applies the picked tidy-ups and reports per-item results', async () => {
		const nextView = cleanupView({
			items: [archiveStubs, goalCall, radar, cautious, offer],
			groups: [],
			counts: { total: 5, safe_cleanup: 1, needs_call: 3, note: 1 }
		});
		fetchMock.mockResolvedValue(
			jsonResponse({
				outcomes: [
					{ suggestion_id: 's-political', ok: true, status: 'applied' },
					{ suggestion_id: 's-stub-1', ok: true, status: 'applied' },
					{
						suggestion_id: 's-stub-2',
						ok: false,
						status: 'failed',
						message: 'The document is locked.'
					}
				],
				view: nextView
			})
		);
		const onDecided = vi.fn();
		render(InboxProjectCleanup, {
			props: { view: cleanupView(), projectId: 'project-1', canDecide: true, onDecided }
		});

		const apply = screen.getByRole('button', { name: /Apply 0 selected/ });
		expect(apply).toBeDisabled();
		await fireEvent.click(screen.getByRole('button', { name: 'Select all ready' }));
		await fireEvent.click(screen.getByRole('button', { name: /Apply 2 selected/ }));

		await waitFor(() => expect(onDecided).toHaveBeenCalled());
		expect(fetchMock).toHaveBeenCalledWith('/api/onto/projects/project-1/cleanup', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: expect.any(String)
		});
		expect(JSON.parse(fetchMock.mock.calls[0]![1].body).decisions).toEqual([
			{
				suggestion_id: 's-political',
				action: 'approve',
				expected_fingerprint: 'fp-political'
			},
			{ suggestion_id: 's-stub-1', action: 'approve', expected_fingerprint: 'fp-stub-1' },
			{ suggestion_id: 's-stub-2', action: 'approve', expected_fingerprint: 'fp-stub-2' }
		]);
		expect(onDecided).toHaveBeenCalledWith({ handled: 1, view: nextView });

		expect(screen.getByText('Applied:')).toBeInTheDocument();
		expect(screen.getByText(/— The document is locked\./)).toBeInTheDocument();
		expect(
			screen.queryByRole('checkbox', { name: 'Archive Political Analysis' })
		).not.toBeInTheDocument();
		expect(
			screen.getByRole('checkbox', { name: 'Archive the empty blog stubs' })
		).not.toBeChecked();
	});

	it('marks a tidy-up not needed in one tap, without asking why', async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({
				outcomes: [{ suggestion_id: 's-political', ok: true, status: 'rejected' }],
				view: cleanupView()
			})
		);
		render(InboxProjectCleanup, {
			props: { view: cleanupView(), projectId: 'project-1', canDecide: true }
		});

		await fireEvent.click(
			screen.getByRole('button', { name: 'Not needed: Archive Political Analysis' })
		);

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(JSON.parse(fetchMock.mock.calls[0]![1].body).decisions).toEqual([
			{ suggestion_id: 's-political', action: 'dismiss', reason: 'not_relevant' }
		]);
		await waitFor(() => expect(screen.getByText('Marked not needed:')).toBeInTheDocument());
	});

	it('selects every ready tidy-up from the block header', async () => {
		render(InboxProjectCleanup, {
			props: { view: cleanupView(), projectId: 'project-1', canDecide: true }
		});

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select all 2' }));
		expect(screen.getByRole('checkbox', { name: 'Archive Political Analysis' })).toBeChecked();
		expect(
			screen.getByRole('checkbox', { name: 'Archive the empty blog stubs' })
		).toBeChecked();
		expect(screen.getByRole('button', { name: /Apply 2 selected/ })).toBeEnabled();
		expect(screen.getByText(/Previewing the 2 you picked\./)).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select all 2' }));
		expect(
			screen.getByRole('checkbox', { name: 'Archive Political Analysis' })
		).not.toBeChecked();
	});

	it('answers a change in one tap and leaves a receipt in its place', async () => {
		const nextView = cleanupView({
			items: [archivePolitical, archiveStubs, goalCall, radar, offer],
			counts: { total: 5, safe_cleanup: 2, needs_call: 2, note: 1 }
		});
		fetchMock.mockResolvedValue(
			jsonResponse({
				outcomes: [{ suggestion_id: 's-rod', ok: true, status: 'applied' }],
				view: nextView
			})
		);
		const onDecided = vi.fn();
		render(InboxProjectCleanup, {
			props: { view: cleanupView(), projectId: 'project-1', canDecide: true, onDecided }
		});

		await fireEvent.click(
			card('Archive the Rod folder').getByRole('button', { name: /Make this change/ })
		);

		await waitFor(() => expect(onDecided).toHaveBeenCalledWith({ handled: 1, view: nextView }));
		expect(JSON.parse(fetchMock.mock.calls[0]![1].body).decisions).toEqual([
			{ suggestion_id: 's-rod', action: 'approve', expected_fingerprint: 'fp-rod' }
		]);
		const rod = card('Archive the Rod folder');
		expect(rod.getByRole('status')).toHaveTextContent('Make this change.');
		expect(rod.queryByRole('button', { name: /Keep as is/ })).not.toBeInTheDocument();
		// The receipt lives on the card, not in the "Just now" list.
		expect(screen.queryByText('Applied:')).not.toBeInTheDocument();
	});

	it('keeps the options when the change moved under it', async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({
				outcomes: [
					{
						suggestion_id: 's-rod',
						ok: false,
						status: 'changed',
						message: CLEANUP_CHANGED_MESSAGE
					}
				],
				view: cleanupView()
			})
		);
		render(InboxProjectCleanup, {
			props: { view: cleanupView(), projectId: 'project-1', canDecide: true }
		});

		await fireEvent.click(
			card('Archive the Rod folder').getByRole('button', { name: /Keep as is/ })
		);

		await waitFor(() =>
			expect(card('Archive the Rod folder').getByRole('alert')).toHaveTextContent(
				CLEANUP_CHANGED_MESSAGE
			)
		);
		expect(JSON.parse(fetchMock.mock.calls[0]![1].body).decisions).toEqual([
			{ suggestion_id: 's-rod', action: 'dismiss', reason: 'not_relevant' }
		]);
		expect(
			card('Archive the Rod folder').getByRole('button', { name: /Keep as is/ })
		).toBeEnabled();
	});

	it('shows a pre-written question with what it settles, once per item', () => {
		render(InboxProjectCleanup, {
			props: { view: askView(ROD_ANSWERS), projectId: 'project-1', canDecide: true }
		});

		const rod = card('Is the Rod Chamberlin website still happening?');
		expect(
			rod.getByText('Two items on this card are really this one question.')
		).toBeInTheDocument();
		expect(rod.getByRole('button', { name: /On hold\s*Recommended/ })).toBeInTheDocument();
		expect(rod.getByText('Mark the goal on hold with a date.')).toBeInTheDocument();
		const settles = rod.getByRole('list', { name: 'Settles' });
		expect(
			within(settles)
				.getAllByRole('listitem')
				.map((li) => li.textContent?.trim())
		).toEqual([rodGoal.title, rodPlan.title]);
		// Covered items are answered here, not in their own blocks.
		expect(screen.queryByRole('checkbox', { name: rodPlan.title })).not.toBeInTheDocument();
		expect(screen.queryByRole('heading', { name: /Out of date/ })).not.toBeInTheDocument();
		expect(screen.getByRole('checkbox', { name: archivePolitical.title })).toBeInTheDocument();
	});

	it('runs each answer action through the right channel', async () => {
		const onDiscuss = vi.fn();
		const answers = (action: ProjectCleanupAsk['answers'][number]['action']) => [
			{ label: 'Yes', effect: 'Do the thing.', action, recommended: true },
			{ label: 'Talk', effect: null, action: 'chat' as const, recommended: false }
		];

		// chat: opens the conversation on the first item, no save.
		let utils = render(InboxProjectCleanup, {
			props: {
				view: askView(ROD_ANSWERS),
				projectId: 'project-1',
				canDecide: true,
				onDiscuss
			}
		});
		await fireEvent.click(
			card(/Rod Chamberlin website/).getByRole('button', { name: /Still going/ })
		);
		expect(onDiscuss).toHaveBeenCalledWith(rodGoal);
		await fireEvent.click(
			card(/Rod Chamberlin website/).getByRole('button', { name: 'Talk it through' })
		);
		expect(onDiscuss).toHaveBeenCalledTimes(2);
		expect(fetchMock).not.toHaveBeenCalled();
		utils.unmount();

		// apply: only the covered item with a verified change.
		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				outcomes: [{ suggestion_id: 's-rod-plan', ok: true, status: 'applied' }],
				view: null
			})
		);
		utils = render(InboxProjectCleanup, {
			props: { view: askView(ROD_ANSWERS), projectId: 'project-1', canDecide: true }
		});
		await fireEvent.click(
			card(/Rod Chamberlin website/).getByRole('button', { name: /It's over/ })
		);
		await waitFor(() =>
			expect(card(/Rod Chamberlin website/).getByRole('status')).toHaveTextContent(
				"It's over. Archive the recovery plan."
			)
		);
		expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body).decisions).toEqual([
			{ suggestion_id: 's-rod-plan', action: 'approve', expected_fingerprint: 'fp-rod-plan' }
		]);
		utils.unmount();

		// dismiss and done: every covered item.
		for (const [action, expected] of [
			[
				'dismiss',
				[
					{ suggestion_id: 's-rod-goal', action: 'dismiss', reason: 'not_relevant' },
					{ suggestion_id: 's-rod-plan', action: 'dismiss', reason: 'not_relevant' }
				]
			],
			[
				'done',
				[
					{
						suggestion_id: 's-rod-goal',
						action: 'address',
						note: 'Handled from the project cleanup list'
					},
					{
						suggestion_id: 's-rod-plan',
						action: 'address',
						note: 'Handled from the project cleanup list'
					}
				]
			]
		] as const) {
			fetchMock.mockResolvedValueOnce(
				jsonResponse({
					outcomes: expected.map((decision) => ({
						suggestion_id: decision.suggestion_id,
						ok: true,
						status: action === 'dismiss' ? 'rejected' : 'addressed'
					})),
					view: null
				})
			);
			utils = render(InboxProjectCleanup, {
				props: { view: askView(answers(action)), projectId: 'project-1', canDecide: true }
			});
			await fireEvent.click(
				card(/Rod Chamberlin website/).getByRole('button', { name: /^Yes/ })
			);
			await waitFor(() =>
				expect(card(/Rod Chamberlin website/).getByRole('status')).toHaveTextContent(
					'Yes. Do the thing.'
				)
			);
			expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body).decisions).toEqual(expected);
			utils.unmount();
		}
	});

	it('hands a note answer to the note reader for each item it settles', async () => {
		const nextView = cleanupView({
			items: [archivePolitical],
			groups: [],
			counts: { total: 1, safe_cleanup: 1, needs_call: 0, note: 0 },
			asks: []
		});
		fetchMock
			.mockResolvedValueOnce(
				jsonResponse({
					decision: 'agent',
					reply: 'Marked the goal on hold until January.',
					agent_run_id: 'run-9',
					view: null
				})
			)
			.mockResolvedValueOnce(
				jsonResponse({
					decision: 'not_needed',
					reply: 'Kept the recovery plan for now.',
					agent_run_id: null,
					view: nextView
				})
			);
		const onDecided = vi.fn();
		render(InboxProjectCleanup, {
			props: {
				view: askView(ROD_ANSWERS),
				projectId: 'project-1',
				canDecide: true,
				onDecided
			}
		});

		await fireEvent.click(
			card(/Rod Chamberlin website/).getByRole('button', { name: /On hold/ })
		);

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		const note =
			'Is the Rod Chamberlin website still happening? — On hold: Mark the goal on hold with a date.';
		expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
			'/api/onto/projects/project-1/cleanup/note',
			'/api/onto/projects/project-1/cleanup/note'
		]);
		expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
			cleanup_item_id: 'rod-goal',
			note,
			expected_fingerprints: { 's-rod-goal': null }
		});
		expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toMatchObject({
			cleanup_item_id: 'rod-plan',
			note
		});
		// The question stays in place with its receipt after the view drops it.
		const receipt = await waitFor(() => card(/Rod Chamberlin website/).getByRole('status'));
		expect(receipt).toHaveTextContent('On hold. Mark the goal on hold with a date.');
		expect(receipt).toHaveTextContent(
			'Marked the goal on hold until January. Kept the recovery plan for now.'
		);
		expect(onDecided).toHaveBeenCalledWith({ handled: 2, view: nextView });
	});

	it('disables an apply answer when nothing it covers can be applied', () => {
		const view = askView(ROD_ANSWERS);
		render(InboxProjectCleanup, {
			props: {
				view: { ...view, asks: [{ ...rodAsk(ROD_ANSWERS), item_ids: ['rod-goal'] }] },
				projectId: 'project-1',
				canDecide: true
			}
		});
		const over = card(/Rod Chamberlin website/).getByRole('button', { name: /It's over/ });
		expect(over).toBeDisabled();
		expect(over).toHaveTextContent('Not ready to apply from here. Talk it through instead.');
	});

	it('sends a quick note on a change and shows the reply', async () => {
		const nextView = cleanupView({
			items: [archivePolitical, archiveStubs, goalCall, radar, offer],
			counts: { total: 5, safe_cleanup: 2, needs_call: 2, note: 1 }
		});
		fetchMock.mockResolvedValue(
			jsonResponse({
				decision: 'not_needed',
				reply: 'Kept it. You still need that folder.',
				agent_run_id: null,
				outcomes: [{ suggestion_id: 's-rod', ok: true, status: 'rejected' }],
				view: nextView
			})
		);
		const onDiscuss = vi.fn();
		const onDecided = vi.fn();
		render(InboxProjectCleanup, {
			props: {
				view: cleanupView(),
				projectId: 'project-1',
				canDecide: true,
				onDiscuss,
				onDecided
			}
		});

		await fireEvent.click(
			screen.getByRole('button', { name: 'Add a note: Archive the Rod folder' })
		);
		expect(onDiscuss).not.toHaveBeenCalled();
		const box = screen.getByRole('textbox');
		await fireEvent.input(box, { target: { value: 'Keep it, I still use those docs' } });
		await fireEvent.keyDown(box, { key: 'Enter' });

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(fetchMock.mock.calls[0]![0]).toBe('/api/onto/projects/project-1/cleanup/note');
		expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
			cleanup_item_id: 'cautious',
			note: 'Keep it, I still use those docs',
			expected_fingerprints: { 's-rod': 'fp-rod' }
		});
		await waitFor(() =>
			expect(screen.getByText('Kept it. You still need that folder.')).toBeInTheDocument()
		);
		expect(onDecided).toHaveBeenCalledWith({ handled: 1, view: nextView });
		expect(
			screen.queryByRole('button', { name: 'Add a note: Archive the Rod folder' })
		).not.toBeInTheDocument();
	});

	it('offers triage and the full chat from the note box', async () => {
		const onDiscuss = vi.fn();
		const onTriage = vi.fn();
		render(InboxProjectCleanup, {
			props: {
				view: cleanupView(),
				projectId: 'project-1',
				canDecide: true,
				onDiscuss,
				onTriage
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /Triage 6 items/ }));
		expect(onTriage).toHaveBeenCalled();

		await fireEvent.click(
			screen.getByRole('button', { name: 'Add a note: Archive the Rod folder' })
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Open the full chat' }));
		expect(onDiscuss).toHaveBeenCalledWith(cautious);
	});

	it('handles out-of-date findings and records', async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({
				outcomes: [{ suggestion_id: 's-goal', ok: true, status: 'addressed' }],
				view: cleanupView()
			})
		);
		const onDiscuss = vi.fn();
		const onFixInChat = vi.fn();
		const onSnooze = vi.fn();
		render(InboxProjectCleanup, {
			props: {
				view: cleanupView(),
				projectId: 'project-1',
				canDecide: true,
				onDiscuss,
				onFixInChat,
				onSnooze
			}
		});

		await fireEvent.click(
			screen.getByRole('button', {
				name: 'Already handled: Maryland Content Authority goal drifted'
			})
		);
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(JSON.parse(fetchMock.mock.calls[0]![1].body).decisions).toEqual([
			{
				suggestion_id: 's-goal',
				action: 'address',
				note: 'Handled from the project cleanup list'
			}
		]);
		await waitFor(() => expect(screen.getByText('Already handled:')).toBeInTheDocument());

		await fireEvent.click(
			screen.getByRole('button', {
				name: 'Talk it through: Maryland Content Authority goal drifted'
			})
		);
		expect(onDiscuss).toHaveBeenLastCalledWith(goalCall);

		await fireEvent.click(screen.getByRole('button', { name: 'Fix in chat: Rod goal' }));
		expect(onFixInChat).toHaveBeenCalledWith(radar.review_items![0], radar);

		await fireEvent.click(screen.getByRole('button', { name: 'Discuss cleanup' }));
		expect(onDiscuss).toHaveBeenLastCalledWith(null);
		await fireEvent.click(screen.getByRole('button', { name: 'Snooze' }));
		expect(onSnooze).toHaveBeenCalled();
	});

	it('turns audit homework into offers: yes opens chat, no sets it aside', async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({
				outcomes: [{ suggestion_id: 's-offer', ok: true, status: 'rejected' }],
				view: null
			})
		);
		const onDiscuss = vi.fn();
		render(InboxProjectCleanup, {
			props: { view: cleanupView(), projectId: 'project-1', canDecide: true, onDiscuss }
		});

		await fireEvent.click(screen.getByRole('button', { name: `Yes, ask me: ${offer.title}` }));
		expect(onDiscuss).toHaveBeenCalledWith(offer);
		expect(fetchMock).not.toHaveBeenCalled();

		await fireEvent.click(
			screen.getByRole('button', { name: `Not for this project: ${offer.title}` })
		);
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(JSON.parse(fetchMock.mock.calls[0]![1].body).decisions).toEqual([
			{ suggestion_id: 's-offer', action: 'dismiss', reason: 'not_relevant' }
		]);
		await waitFor(() => expect(screen.getByText('Not for this project:')).toBeInTheDocument());
	});

	it('lists changes made without asking and undoes one', async () => {
		const autoApplied = [
			{
				item_id: 'auto-1',
				suggestion_id: 's-auto-1',
				title: 'Moved Templates under Processes & Specs',
				applied_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
				reason: 'Templates are process documents.',
				undoable: true
			},
			{
				item_id: 'auto-2',
				suggestion_id: 's-auto-2',
				title: 'Archived Book Research',
				applied_at: new Date(Date.now() - 3_600_000).toISOString(),
				reason: null,
				undoable: false
			}
		];
		const nextView = cleanupView({ auto_applied: [autoApplied[1]!] });
		fetchMock
			.mockResolvedValueOnce(jsonResponse({ error: 'Already changed' }, 409))
			.mockResolvedValueOnce(jsonResponse({ ok: true, view: nextView }));
		const onUndone = vi.fn();
		render(InboxProjectCleanup, {
			props: {
				view: cleanupView({ auto_applied: autoApplied }),
				projectId: 'project-1',
				canDecide: true,
				onUndone
			}
		});

		expect(screen.getByRole('heading', { name: /Done for you \(2\)/ })).toBeInTheDocument();
		expect(screen.getByText('Templates are process documents.')).toBeInTheDocument();
		expect(screen.getByText('Applied 2 hours ago')).toBeInTheDocument();
		// Only reversible changes offer Undo.
		expect(
			screen.queryByRole('button', { name: 'Undo: Archived Book Research' })
		).not.toBeInTheDocument();

		const undo = screen.getByRole('button', {
			name: 'Undo: Moved Templates under Processes & Specs'
		});
		await fireEvent.click(undo);
		await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Already changed'));
		expect(fetchMock).toHaveBeenCalledWith('/api/onto/projects/project-1/cleanup/undo', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ suggestion_id: 's-auto-1' })
		});

		await fireEvent.click(undo);
		await waitFor(() =>
			expect(onUndone).toHaveBeenCalledWith({ suggestionId: 's-auto-1', view: nextView })
		);
		expect(screen.getByText('Undone:')).toBeInTheDocument();
		expect(
			screen.queryByRole('button', { name: 'Undo: Moved Templates under Processes & Specs' })
		).not.toBeInTheDocument();
		expect(screen.getByRole('heading', { name: /Done for you \(1\)/ })).toBeInTheDocument();
	});

	it('previews the document tree now and after the tidy-ups', async () => {
		const move = item({
			id: 'move',
			ask_kind: 'tidy',
			title: 'Move Templates under Processes & Specs',
			rows: [
				row('s-move', 'fp-move', {
					tree_operations: [
						{
							tool: 'move_document_in_tree',
							args: { document_id: 'templates', new_parent_id: 'specs' }
						}
					]
				})
			]
		});
		const archive = item({
			id: 'archive',
			ask_kind: 'tidy',
			title: 'Archive Book Research',
			rows: [
				row('s-archive', 'fp-archive', {
					tree_operations: [
						{ tool: 'archive_onto_document', args: { document_id: 'book' } }
					]
				})
			]
		});
		fetchMock.mockResolvedValue(
			jsonResponse({
				structure: {
					version: 1,
					root: [
						{ id: 'specs', order: 0, children: [{ id: 'spec-1', order: 0 }] },
						{ id: 'templates', order: 1 },
						{ id: 'book', order: 2 },
						{ id: 'log', order: 3 }
					]
				},
				documents: {
					specs: { id: 'specs', title: 'Processes & Specs', state_key: 'draft' },
					'spec-1': { id: 'spec-1', title: 'Referral spec', state_key: 'draft' },
					templates: { id: 'templates', title: 'Templates', state_key: 'draft' },
					book: { id: 'book', title: 'Book Research', state_key: 'draft' },
					log: { id: 'log', title: 'Thinking log', state_key: 'draft' }
				},
				unlinked: [],
				archived: []
			})
		);
		render(InboxProjectCleanup, {
			props: {
				view: cleanupView({
					items: [move, archive],
					groups: [],
					counts: { total: 2, safe_cleanup: 2, needs_call: 0, note: 0 }
				}),
				projectId: 'project-1',
				canDecide: true
			}
		});

		expect(screen.getByText('1 move and 1 archive')).toBeInTheDocument();
		expect(fetchMock).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('button', { name: 'Now' }));
		await waitFor(() =>
			expect(screen.getByRole('list', { name: 'Documents now' })).toBeInTheDocument()
		);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/onto/projects/project-1/doc-tree?include_content=false'
		);
		expect(screen.getByText(/Top level: 4 → 2\./)).toBeInTheDocument();
		const now = screen.getByRole('list', { name: 'Documents now' });
		expect(now).toHaveTextContent(/Templates\s*→ Processes & Specs/);
		expect(now).toHaveTextContent(/Book Research\s*archive/);
		expect(now).toHaveTextContent(/Processes & Specs\s*· 1 inside/);

		await fireEvent.click(screen.getByRole('button', { name: 'After' }));
		expect(screen.getByRole('button', { name: 'After' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		const after = screen.getByRole('list', { name: 'Documents after the tidy-ups' });
		expect(after).toHaveTextContent(/Templates\s*moved here/);
		expect(after).toHaveTextContent('+ 1 more');
		expect(after).not.toHaveTextContent('Book Research');
		expect(screen.getByRole('list', { name: 'Archived documents' })).toHaveTextContent(
			'Book Research'
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('hides the tree toggle when the tree cannot load and keeps the list', async () => {
		fetchMock.mockResolvedValue(jsonResponse({ error: 'nope' }, 500));
		const move = item({
			id: 'move',
			ask_kind: 'tidy',
			title: 'Move Templates',
			rows: [
				row('s-move', 'fp-move', {
					tree_operations: [
						{
							tool: 'move_document_in_tree',
							args: { document_id: 'templates', new_parent_id: null }
						}
					]
				})
			]
		});
		render(InboxProjectCleanup, {
			props: {
				view: cleanupView({ items: [move], groups: [] }),
				projectId: 'project-1',
				canDecide: true
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'After' }));
		await waitFor(() =>
			expect(screen.queryByRole('button', { name: 'After' })).not.toBeInTheDocument()
		);
		expect(screen.getByRole('checkbox', { name: 'Move Templates' })).toBeInTheDocument();
	});

	it('explains what closed and shows the decoded change', async () => {
		render(InboxProjectCleanup, {
			props: { view: cleanupView(), projectId: 'project-1', canDecide: true }
		});

		expect(screen.getByText('Closed since the last review (2)')).toBeInTheDocument();
		expect(screen.getByText('— archived')).toBeInTheDocument();
		expect(screen.getByText('— replaced by an updated version')).toBeInTheDocument();
		expect(screen.getAllByText('What changes').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Archive document')[0]).toBeInTheDocument();
	});

	it('is read-only without write access and shows an empty state when clear', () => {
		const { unmount } = render(InboxProjectCleanup, {
			props: {
				view: askView(ROD_ANSWERS),
				projectId: 'project-1',
				canDecide: false,
				decisionDisabledReason: 'View-only project access'
			}
		});
		expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
		expect(screen.queryByRole('button', { name: /Not needed/ })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /On hold/ })).not.toBeInTheDocument();
		expect(
			card(/Rod Chamberlin website/).getByRole('list', { name: 'Options' })
		).toHaveTextContent('On hold (recommended) — Mark the goal on hold with a date.');
		expect(screen.getByText('View-only project access')).toBeInTheDocument();
		unmount();

		render(InboxProjectCleanup, {
			props: {
				view: cleanupView({
					items: [],
					groups: [],
					bottom_line: null,
					recommendation: null,
					counts: { total: 0, safe_cleanup: 0, needs_call: 0, note: 0 },
					recently_closed: []
				}),
				projectId: 'project-1',
				canDecide: true
			}
		});
		expect(screen.getByText('Nothing to clean up right now')).toBeInTheDocument();
		expect(screen.getByText('Nothing open')).toBeInTheDocument();
	});

	it('opens the latest audit report inline', async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({
				audit: {
					id: 'audit-1',
					summary: 'Two documents overlap.',
					recommendations: [
						{
							title: 'Merge the two positioning docs',
							summary: 'Keep Tacemus Vision 2.0 as the main one.',
							category: 'document_quality'
						}
					]
				},
				childSuggestions: []
			})
		);
		render(InboxProjectCleanup, {
			props: {
				view: cleanupView({
					latest_audit: {
						id: 'audit-1',
						created_at: '2026-09-18T12:00:00.000Z',
						summary: 'Two documents overlap.'
					}
				}),
				projectId: 'project-1',
				canDecide: true
			}
		});

		const link = screen.getByRole('button', { name: /audit — open report/ });
		await fireEvent.click(link);
		await waitFor(() =>
			expect(screen.getByText('Merge the two positioning docs')).toBeInTheDocument()
		);
		expect(fetchMock).toHaveBeenCalledWith('/api/onto/projects/project-1/audits/audit-1');
		expect(link).toHaveAttribute('aria-expanded', 'true');
	});
});
