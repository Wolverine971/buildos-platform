// apps/web/src/lib/components/inbox/InboxCleanupTriage.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectCleanupItem, ProjectCleanupView } from '@buildos/shared-types';
import InboxCleanupTriage from './InboxCleanupTriage.svelte';
import type { TriageProject } from './cleanup-triage';

function row(id: string, fingerprint: string | null) {
	return {
		suggestion_id: id,
		kind: 'doc_org' as const,
		title: `Row ${id}`,
		operation_count: fingerprint ? 1 : 0,
		verified_headline: null,
		verified_fingerprint: fingerprint,
		updated_at: '2026-09-29T12:00:00.000Z'
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

const tenex = item({
	id: 'tenex',
	title: 'Archive task Tenex',
	rows: [row('s-tenex', 'fp-tenex')]
});
const genesis = item({
	id: 'genesis',
	title: 'Archive task Genesis follow-up',
	rows: [row('s-genesis', 'fp-genesis')]
});
const salary = item({
	id: 'salary',
	section: 'needs_call',
	source: 'audit',
	title: 'Set the salary floor',
	executable: false,
	rows: [row('s-salary', null)]
});
const owners = item({
	id: 'owners',
	section: 'note',
	source: 'audit',
	title: 'Confirm owners for recruiter follow-ups',
	executable: false,
	rows: [row('s-owners', null)]
});

function project(projectId: string, name: string, items: ProjectCleanupItem[]): TriageProject {
	return {
		projectId,
		projectName: name,
		inboxItemId: `inbox-${projectId}`,
		view: {
			project_id: projectId,
			items,
			groups: [],
			bottom_line: null,
			recommendation: null,
			synthesized_at: null,
			latest_run_id: null,
			latest_audit: null,
			counts: { total: items.length, safe_cleanup: 0, needs_call: 0, note: 0 },
			recently_closed: []
		} as ProjectCleanupView
	};
}

function jsonResponse(data: unknown) {
	return new Response(JSON.stringify({ success: true, data }), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
}

describe('InboxCleanupTriage', () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		fetchMock.mockReset();
		fetchMock.mockImplementation(async () => jsonResponse({ outcomes: [], view: null }));
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	function setup(projects: TriageProject[], extra: Record<string, unknown> = {}) {
		const onExit = vi.fn();
		const onSendNote = vi.fn(async () => ({ ok: true, message: 'Kept it.' }));
		const onOpenChat = vi.fn();
		const utils = render(InboxCleanupTriage, {
			props: { projects, undoWindowMs: 20, onExit, onSendNote, onOpenChat, ...extra }
		});
		return { ...utils, onExit, onSendNote, onOpenChat };
	}

	it('applies the ready batch in one tap, then walks calls and notes by keyboard', async () => {
		const { container, onExit } = setup([
			project('p1', 'Job Search', [tenex, genesis, salary, owners])
		]);
		const root = container.querySelector('[aria-label="Triage"]') as HTMLElement;

		expect(screen.getByText('2 changes ready to apply')).toBeInTheDocument();
		expect(screen.getByText('1 of 4')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: /Apply 2/ }));

		expect(screen.getByRole('heading', { name: 'Set the salary floor' })).toBeInTheDocument();
		expect(screen.getByText('3 of 4')).toBeInTheDocument();
		await fireEvent.keyDown(root, { key: 'n' });

		expect(
			screen.getByRole('heading', { name: 'Confirm owners for recruiter follow-ups' })
		).toBeInTheDocument();
		await fireEvent.keyDown(root, { key: 'a' });

		expect(screen.getByText("You're through the list")).toBeInTheDocument();
		expect(screen.getByText('2 applied · 1 done · 1 not needed')).toBeInTheDocument();

		// Everything for one project saves in a single request once the undo window passes.
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(fetchMock.mock.calls[0]![0]).toBe('/api/onto/projects/p1/cleanup');
		expect(JSON.parse(fetchMock.mock.calls[0]![1].body).decisions).toEqual([
			{ suggestion_id: 's-tenex', action: 'approve', expected_fingerprint: 'fp-tenex' },
			{ suggestion_id: 's-genesis', action: 'approve', expected_fingerprint: 'fp-genesis' },
			{ suggestion_id: 's-salary', action: 'dismiss', reason: 'not_relevant' },
			{
				suggestion_id: 's-owners',
				action: 'address',
				note: 'Handled from the project cleanup list'
			}
		]);

		await fireEvent.click(screen.getByRole('button', { name: 'Back to inbox' }));
		await waitFor(() =>
			expect(onExit).toHaveBeenCalledWith({ handled: 4, projectIds: ['p1'] })
		);
	});

	it('undoes the last decision before it saves', async () => {
		const { container } = setup([project('p1', 'Job Search', [salary, owners])], {
			undoWindowMs: 10_000
		});
		const root = container.querySelector('[aria-label="Triage"]') as HTMLElement;

		await fireEvent.keyDown(root, { key: 'n' });
		expect(
			screen.getByRole('heading', { name: 'Confirm owners for recruiter follow-ups' })
		).toBeInTheDocument();
		await fireEvent.keyDown(root, { key: 'z' });
		expect(screen.getByRole('heading', { name: 'Set the salary floor' })).toBeInTheDocument();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('hands an item to Jev with a note and keeps going', async () => {
		const { container, onSendNote } = setup([project('p1', 'Job Search', [salary, owners])]);
		const root = container.querySelector('[aria-label="Triage"]') as HTMLElement;

		await fireEvent.keyDown(root, { key: 'd' });
		const box = screen.getByRole('textbox');
		await fireEvent.input(box, { target: { value: 'Floor is 180k, remote or DC only' } });
		await fireEvent.keyDown(box, { key: 'Enter' });

		expect(onSendNote).toHaveBeenCalledWith(
			expect.objectContaining({ projectId: 'p1' }),
			salary,
			'Floor is 180k, remote or DC only'
		);
		expect(
			screen.getByRole('heading', { name: 'Confirm owners for recruiter follow-ups' })
		).toBeInTheDocument();
		await waitFor(() => expect(screen.getByText(/Kept it\./)).toBeInTheDocument());
	});

	it('goes one by one through a batch, skips, and tells you when the next project starts', async () => {
		const { container } = setup([
			project('p1', 'Job Search', [tenex, genesis]),
			project('p2', 'BuildOS', [salary])
		]);
		const root = container.querySelector('[aria-label="Triage"]') as HTMLElement;

		await fireEvent.click(screen.getByRole('button', { name: /One by one/ }));
		expect(screen.getByRole('heading', { name: 'Archive task Tenex' })).toBeInTheDocument();
		await fireEvent.keyDown(root, { key: 's' });
		await fireEvent.keyDown(root, { key: 'ArrowRight' });

		expect(screen.getByRole('heading', { name: 'Set the salary floor' })).toBeInTheDocument();
		expect(screen.getByText(/is done\. Next up:/)).toBeInTheDocument();
	});

	it('opens the full chat instead of a note', async () => {
		const { container, onOpenChat } = setup([project('p1', 'Job Search', [salary])]);
		const root = container.querySelector('[aria-label="Triage"]') as HTMLElement;

		await fireEvent.keyDown(root, { key: 'd' });
		await fireEvent.click(screen.getByRole('button', { name: /Open the full chat instead/ }));
		expect(onOpenChat).toHaveBeenCalledWith(
			expect.objectContaining({ projectId: 'p1' }),
			salary
		);
	});
});
