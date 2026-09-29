// apps/web/src/lib/components/inbox/InboxProjectCleanup.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectCleanupItem, ProjectCleanupView } from '@buildos/shared-types';
import InboxProjectCleanup from './InboxProjectCleanup.svelte';

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
	title: 'Archive Political Analysis',
	summary: 'Empty since May and nothing links to it.',
	seen_count: 3,
	rows: [row('s-political', 'fp-political')]
});
const archiveStubs = item({
	id: 'stubs',
	title: 'Archive the empty blog stubs',
	rows: [row('s-stub-1', 'fp-stub-1'), row('s-stub-2', 'fp-stub-2')]
});
const goalCall = item({
	id: 'goal',
	kind: 'drift',
	section: 'needs_call',
	source: 'audit',
	title: 'Maryland Content Authority goal drifted',
	executable: false,
	rows: [row('s-goal', null)]
});
const radar = item({
	id: 'radar',
	kind: 'freshness_update',
	source: 'radar',
	section: 'needs_call',
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
	title: 'Archive the Rod folder',
	rows: [row('s-rod', 'fp-rod', { cautions: ['This folder has 4 documents inside.'] })]
});

function cleanupView(overrides: Partial<ProjectCleanupView> = {}): ProjectCleanupView {
	return {
		project_id: 'project-1',
		items: [archivePolitical, archiveStubs, goalCall, radar, cautious],
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
			}
		],
		bottom_line: 'Nine stale docs can go; one goal needs a new direction.',
		recommendation: 'Archive the stale docs, then decide the Maryland goal.',
		synthesized_at: '2026-09-29T06:00:00.000Z',
		latest_run_id: 'run-1',
		latest_audit: null,
		counts: { total: 5, safe_cleanup: 2, needs_call: 3, note: 0 },
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

function jsonResponse(data: unknown, status = 200) {
	return new Response(JSON.stringify(status < 400 ? { success: true, data } : data), {
		status,
		headers: { 'content-type': 'application/json' }
	});
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

	it('leads with the bottom line and offers checkboxes only for verified changes', () => {
		render(InboxProjectCleanup, {
			props: { view: cleanupView(), projectId: 'project-1', canDecide: true }
		});

		expect(
			screen.getByText('Nine stale docs can go; one goal needs a new direction.')
		).toBeInTheDocument();
		expect(
			screen.getByText('Archive the stale docs, then decide the Maryland goal.')
		).toBeInTheDocument();
		expect(screen.getByRole('list', { name: "What's open" })).toHaveTextContent(
			/2\s*Ready to apply/
		);
		expect(screen.getByRole('heading', { name: /Archive stale docs/ })).toBeInTheDocument();
		expect(screen.getByText('None of these have been touched since May.')).toBeInTheDocument();

		expect(
			screen.getByRole('checkbox', { name: 'Archive Political Analysis' })
		).toBeInTheDocument();
		expect(
			screen.getByRole('checkbox', { name: 'Archive the Rod folder' })
		).toBeInTheDocument();
		expect(
			screen.queryByRole('checkbox', { name: 'Maryland Content Authority goal drifted' })
		).not.toBeInTheDocument();
		expect(screen.getAllByRole('checkbox')).toHaveLength(3);

		expect(screen.getByText(/^Seen in 3 reviews since /)).toBeInTheDocument();
		expect(screen.getByText('This folder has 4 documents inside.')).toBeInTheDocument();
		expect(screen.getByText('Audit')).toBeInTheDocument();
		expect(screen.getByText('Freshness')).toBeInTheDocument();
		expect(
			screen.getByText("Anything you don't pick stays here for later.")
		).toBeInTheDocument();
	});

	it('applies every row of the picked items and reports per-item results', async () => {
		const nextView = cleanupView({
			items: [goalCall, radar, cautious],
			groups: [
				{
					title: 'Needs your call',
					section: 'needs_call',
					item_ids: ['goal', 'radar', 'cautious'],
					recommendation: null
				}
			],
			counts: { total: 3, safe_cleanup: 0, needs_call: 3, note: 0 }
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
					},
					{
						suggestion_id: 's-rod',
						ok: false,
						status: 'changed',
						message: 'This item changed since you opened it — review the new version.'
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
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Archive the Rod folder' }));
		await fireEvent.click(screen.getByRole('button', { name: /Apply 3 selected/ }));

		await waitFor(() => expect(onDecided).toHaveBeenCalled());
		expect(fetchMock).toHaveBeenCalledWith('/api/onto/projects/project-1/cleanup', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: expect.any(String)
		});
		const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
		expect(body.decisions).toEqual([
			{
				suggestion_id: 's-political',
				action: 'approve',
				expected_fingerprint: 'fp-political'
			},
			{ suggestion_id: 's-stub-1', action: 'approve', expected_fingerprint: 'fp-stub-1' },
			{ suggestion_id: 's-stub-2', action: 'approve', expected_fingerprint: 'fp-stub-2' },
			{ suggestion_id: 's-rod', action: 'approve', expected_fingerprint: 'fp-rod' }
		]);
		expect(onDecided).toHaveBeenCalledWith({ handled: 1, view: nextView });

		expect(screen.getByText('Applied:')).toBeInTheDocument();
		expect(screen.getByText(/— The document is locked\./)).toBeInTheDocument();
		// The revised item stays, flagged for another look; the applied ones are gone.
		expect(screen.getAllByText('Updated — review again').length).toBeGreaterThanOrEqual(1);
		expect(
			screen.queryByRole('checkbox', { name: 'Archive Political Analysis' })
		).not.toBeInTheDocument();
		expect(screen.getByRole('checkbox', { name: 'Archive the Rod folder' })).not.toBeChecked();
	});

	it('records a real rejection with a reason and optional note', async () => {
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
		const picker = screen.getByRole('group', { name: "Why isn't this needed?" });
		await fireEvent.click(within(picker).getByRole('radio', { name: 'Too risky' }));
		await fireEvent.input(within(picker).getByLabelText('Note (optional)'), {
			target: { value: 'Still quoting it in the book' }
		});
		await fireEvent.click(within(picker).getByRole('button', { name: 'Mark not needed' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(JSON.parse(fetchMock.mock.calls[0]![1].body).decisions).toEqual([
			{
				suggestion_id: 's-political',
				action: 'dismiss',
				reason: 'too_risky',
				note: 'Still quoting it in the book'
			}
		]);
		await waitFor(() =>
			expect(
				screen.queryByRole('group', { name: "Why isn't this needed?" })
			).not.toBeInTheDocument()
		);
		expect(screen.getByText('Marked not needed:')).toBeInTheDocument();
	});

	it('marks findings done and hands judgment calls to chat', async () => {
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

		expect(
			screen.queryByRole('button', { name: 'Done: Archive Political Analysis' })
		).not.toBeInTheDocument();
		await fireEvent.click(
			screen.getByRole('button', { name: 'Done: Maryland Content Authority goal drifted' })
		);
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(JSON.parse(fetchMock.mock.calls[0]![1].body).decisions).toEqual([
			{
				suggestion_id: 's-goal',
				action: 'address',
				note: 'Handled from the project cleanup list'
			}
		]);

		await fireEvent.click(screen.getByRole('button', { name: 'Fix in chat: Rod goal' }));
		expect(onFixInChat).toHaveBeenCalledWith(radar.review_items![0], radar);

		await fireEvent.click(
			screen.getByRole('button', { name: 'Discuss: Archive the Rod folder' })
		);
		expect(onDiscuss).toHaveBeenCalledWith(cautious);

		await fireEvent.click(screen.getByRole('button', { name: 'Discuss cleanup' }));
		expect(onDiscuss).toHaveBeenLastCalledWith(null);
		await fireEvent.click(screen.getByRole('button', { name: 'Snooze' }));
		expect(onSnooze).toHaveBeenCalled();
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
				view: cleanupView(),
				projectId: 'project-1',
				canDecide: false,
				decisionDisabledReason: 'View-only project access'
			}
		});
		expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
		expect(screen.queryByRole('button', { name: /Not needed/ })).not.toBeInTheDocument();
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
