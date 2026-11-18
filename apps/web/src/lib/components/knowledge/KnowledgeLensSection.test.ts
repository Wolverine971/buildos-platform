// apps/web/src/lib/components/knowledge/KnowledgeLensSection.test.ts
// @vitest-environment jsdom
// What a collaborator sees of someone else's entry in a shared project (tasker 168): the public
// and in-project details, a count of what stays private with Ask, and the asked state. The
// per-fact rules themselves are proven in supabase/tests/knowledge_sharing.check.sql; this checks
// the card shows what the lens returns and never more.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KnowledgeLensSection from './KnowledgeLensSection.svelte';
import type { LensEntry } from './sharing-types';

vi.mock('$lib/stores/toast.store', () => ({
	toastService: { success: vi.fn(), info: vi.fn(), error: vi.fn() }
}));

const kyle = (over: Partial<LensEntry> = {}): LensEntry => ({
	owner: { user_id: 'alice', name: 'Alice' },
	entity: { id: 'e1', kind: 'person', name: 'Kyle Kulinski', summary: null },
	record_ids: ['t1'],
	quotes: ['Kyle Kulinski'],
	facts: [
		{
			id: 'f1',
			predicate: 'headline',
			value: 'Host of Secular Talk',
			object_name: null,
			object_kind: null,
			qualifiers: null,
			source_url: 'https://example.test/kyle',
			via: 'shared'
		},
		{
			id: 'f2',
			predicate: 'phone',
			value: '+14105550199',
			object_name: null,
			object_kind: null,
			qualifiers: null,
			source_url: null,
			via: 'shared'
		}
	],
	hidden: { contact: 2, other: 0 },
	ask: null,
	grant: null,
	...over
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('KnowledgeLensSection', () => {
	it('shows the owner, the shared details and a count of the private ones with Ask', () => {
		render(KnowledgeLensSection, { entries: [kyle()], projectId: 'p1' });
		expect(screen.getByText("From Alice's People")).toBeTruthy();
		expect(screen.getByText(/Host of Secular Talk/)).toBeTruthy();
		expect(screen.getByText('(410) 555-0199')).toBeTruthy();
		expect(screen.getByText('in this project')).toBeTruthy();
		expect(screen.getByText('Alice has 2 contact details')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Ask' })).toBeTruthy();
	});

	it('asks for contact details for this project, then shows it was asked', async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({ success: true, data: { status: 'requested', id: 's1' } }),
					{
						status: 200
					}
				)
		);
		vi.stubGlobal('fetch', fetchMock);
		render(KnowledgeLensSection, { entries: [kyle()], projectId: 'p1' });
		await fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
		await waitFor(() => expect(screen.getByText(/Asked Alice/)).toBeTruthy());
		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('/api/knowledge/shares');
		expect(JSON.parse(String(init.body))).toEqual({
			action: 'ask',
			entity_id: 'e1',
			project_id: 'p1',
			what: 'contact'
		});
	});

	it('says the owner kept them private after a decline, with no Ask', () => {
		render(KnowledgeLensSection, {
			entries: [
				kyle({ ask: { id: 's1', status: 'declined', created_at: '2026-11-17T00:00:00Z' } })
			],
			projectId: 'p1'
		});
		expect(screen.getByText('Alice kept these private.')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Ask' })).toBeNull();
	});

	it('labels granted details as shared and drops the private count once nothing is hidden', () => {
		const granted = kyle({
			hidden: { contact: 0, other: 0 },
			grant: { id: 'g1', what: 'contact', duration: 'membership', expires_at: null },
			facts: [
				{
					id: 'f3',
					predicate: 'email',
					value: 'kyle@example.test',
					object_name: null,
					object_kind: null,
					qualifiers: null,
					source_url: null,
					via: 'grant'
				}
			]
		});
		render(KnowledgeLensSection, { entries: [granted], projectId: 'p1' });
		expect(screen.getByText('kyle@example.test')).toBeTruthy();
		expect(screen.getByText('shared')).toBeTruthy();
		expect(screen.getByText(/Shared by Alice/)).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Ask' })).toBeNull();
	});
});
