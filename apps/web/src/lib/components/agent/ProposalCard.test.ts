// apps/web/src/lib/components/agent/ProposalCard.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import ProposalCard from './ProposalCard.svelte';
import { clearProposalCardState } from './proposal-card-state.svelte';
import {
	CHILD,
	PARENT,
	SESSION,
	UPCOMING_BLOCKED_IMPACT,
	card,
	combineDigest,
	combinePayload,
	jsonResponse,
	parentPayload,
	resolution,
	undoView
} from './proposal-cards.fixture';

const BOB_ONLY = '00000000-0000-4000-8000-000000000099';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => (resolve = done));
	return { promise, resolve };
}

function stubFetch(...responses: Array<Response | Promise<Response>>) {
	const fetchMock = vi.fn();
	for (const response of responses) fetchMock.mockImplementationOnce(() => response);
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

function body(call: unknown[] | undefined) {
	return JSON.parse(String((call?.[1] as RequestInit | undefined)?.body ?? '{}'));
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	clearProposalCardState();
});

describe('ProposalCard — nest', () => {
	it('asks plainly and offers two labelled choices', () => {
		render(ProposalCard, { card: card('project_parent', parentPayload()) });
		expect(screen.getByText('Needs your choice')).toBeTruthy();
		expect(
			screen.getByRole('heading', { name: 'Put Content Ops inside Wayne Strategies' })
		).toBeTruthy();
		expect(screen.getByText('Nothing moves. You can take it out any time.')).toBeTruthy();
		expect(
			screen.getByText(
				'No one gains or loses access. David, Ian and Phillip still see only Content Ops.'
			)
		).toBeTruthy();
		expect(
			screen.getByRole('button', { name: 'Move under Wayne Strategies' })
		).not.toBeDisabled();
		expect(screen.getByRole('button', { name: 'Not now' })).not.toBeDisabled();
		// Nest has no server preview, so no Check again.
		expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
	});

	it('waits for the reply to finish before taking a choice', () => {
		render(ProposalCard, {
			card: card('project_parent', parentPayload()),
			turnActive: true
		});
		expect(screen.getByRole('button', { name: 'Move under Wayne Strategies' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Not now' })).toBeDisabled();
		expect(screen.getByText('You can choose when the reply finishes.')).toBeTruthy();
	});

	it('applies once on a double click, shows working, then resolves in place with Undo', async () => {
		const nest = card('project_parent', parentPayload());
		const reply = deferred<Response>();
		const fetchMock = stubFetch(reply.promise);
		const onResolved = vi.fn();
		const { container } = render(ProposalCard, { card: nest, onResolved });

		const apply = screen.getByRole('button', { name: 'Move under Wayne Strategies' });
		await fireEvent.click(apply);
		await fireEvent.click(apply);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/chat/proposal-cards/${nest.card_id}`);
		expect(body(fetchMock.mock.calls[0])).toMatchObject({
			choice: 'apply',
			session_id: SESSION
		});
		expect(screen.getByRole('button', { name: 'Moving…' })).toBeDisabled();
		expect(container.querySelector('[data-state="working"]')).toBeTruthy();

		reply.resolve(jsonResponse(200, { success: true, data: { resolution: resolution(nest) } }));
		await waitFor(() =>
			expect(screen.getByTestId('proposal-card-result').textContent).toContain(
				'Content Ops is now inside Wayne Strategies'
			)
		);
		expect(screen.getByText('Done')).toBeTruthy();
		expect(screen.getByRole('link', { name: /Open/ }).getAttribute('href')).toBe(
			`/projects/${CHILD}`
		);
		expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
		expect(onResolved).toHaveBeenCalledWith(
			expect.objectContaining({ phase: 'decide', outcome: 'applied' })
		);
		expect(onResolved.mock.calls[0]?.[0].projectIds.sort()).toEqual([CHILD, PARENT].sort());
	});

	it('confirms Undo with where it goes back, then shows the undone line', async () => {
		const nest = card('project_parent', parentPayload());
		const fetchMock = stubFetch(
			jsonResponse(200, {
				success: true,
				data: {
					undo: {
						version: 1,
						card_id: nest.card_id,
						kind: 'project_parent',
						outcome: 'undone',
						undone_at: new Date().toISOString(),
						reason_code: null,
						receipt: null
					}
				}
			})
		);
		render(ProposalCard, { card: { ...nest, card_resolution: resolution(nest) } });

		await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
		expect(screen.getByText('Put Content Ops back at the top level?')).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
		await waitFor(() =>
			expect(screen.getByTestId('proposal-card-result').textContent).toContain(
				'Undone. Content Ops is back at the top level.'
			)
		);
		expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/chat/proposal-cards/${nest.card_id}/undo`);
		expect(body(fetchMock.mock.calls[0])).toEqual({ session_id: SESSION });
		expect(screen.getByText('Undone')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
	});

	it('shows cancelled, stale and unknown outcomes from a reloaded card without a request', () => {
		const fetchMock = stubFetch();
		const cancelled = card('project_parent', parentPayload());
		const stale = card('project_parent', parentPayload());
		const unknown = card('project_parent', parentPayload());
		render(ProposalCard, {
			card: {
				...cancelled,
				card_resolution: resolution(cancelled, {
					outcome: 'cancelled',
					choice: 'cancel',
					receipt: null
				})
			}
		});
		render(ProposalCard, {
			card: {
				...stale,
				card_resolution: resolution(stale, {
					outcome: 'stale',
					reason_code: 'project_has_children',
					receipt: null
				})
			}
		});
		render(ProposalCard, {
			card: {
				...unknown,
				card_resolution: resolution(unknown, { outcome: 'unknown', receipt: null })
			}
		});
		const lines = screen.getAllByTestId('proposal-card-result').map((node) => node.textContent);
		expect(lines[0]).toContain('Cancelled. Nothing changed.');
		expect(lines[1]).toContain('Content Ops now has its own sub-projects');
		expect(lines[2]).toContain('couldn’t confirm whether this saved');
		expect(screen.getByText('Not applied')).toBeTruthy();
		expect(screen.getByText('Check needed')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('closes an expired card, client-side or when the server says so', async () => {
		const old = card('project_parent', parentPayload());
		render(ProposalCard, {
			card: {
				...old,
				client_action: { ...old.client_action, expires_at: '2026-01-01T00:00:00.000Z' }
			}
		});
		expect(screen.getByText('This card expired. Ask again. Nothing changed.')).toBeTruthy();
		cleanup();

		stubFetch(
			jsonResponse(410, {
				success: false,
				error: 'This card expired after 24 hours. Ask again. Nothing changed.',
				code: 'CARD_EXPIRED'
			})
		);
		render(ProposalCard, { card: card('project_parent', parentPayload()) });
		await fireEvent.click(screen.getByRole('button', { name: 'Move under Wayne Strategies' }));
		await waitFor(() => expect(screen.getByText('Expired')).toBeTruthy());
		expect(
			screen.getAllByText('This card expired after 24 hours. Ask again. Nothing changed.')
				.length
		).toBeGreaterThan(0);
		expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull();
	});

	it('keeps the card open with the reason when access is missing', async () => {
		stubFetch(
			jsonResponse(403, {
				success: false,
				error: 'You need admin access to both projects.',
				code: 'ACCESS_REQUIRED'
			})
		);
		render(ProposalCard, { card: card('project_parent', parentPayload()) });
		await fireEvent.click(screen.getByRole('button', { name: 'Move under Wayne Strategies' }));
		await waitFor(() =>
			expect(screen.getByRole('alert').textContent).toContain('admin access to both projects')
		);
		expect(
			screen.getByRole('button', { name: 'Move under Wayne Strategies' })
		).not.toBeDisabled();
	});
});

describe('ProposalCard — combine', () => {
	it('names who loses access and requires a pick before combining', async () => {
		const combine = card('project_combine', combinePayload());
		const fetchMock = stubFetch(
			jsonResponse(200, { success: true, data: { resolution: resolution(combine) } })
		);
		render(ProposalCard, { card: combine });

		expect(
			screen.getByRole('heading', { name: 'Combine Content Ops into DJ Internal' })
		).toBeTruthy();
		expect(
			screen.getByText(/12 docs, 7 tasks and 1 goal move into DJ Internal\./)
		).toBeTruthy();
		expect(screen.getByText(/Docs land in a “From Content Ops” folder\./)).toBeTruthy();
		expect(
			screen.getByText(/Content Ops is archived and forwards to DJ Internal\./)
		).toBeTruthy();
		expect(screen.getByText(/Its 3 chats continue there\./)).toBeTruthy();
		expect(
			screen.getByText(/Alice and Bob\s+can open Content Ops but not DJ Internal\./)
		).toBeTruthy();
		expect(
			screen.getByText(/16 past\s+events stay with Content Ops as\s+history/)
		).toBeTruthy();
		expect(screen.getByTestId('combine-undo-limits').textContent).toContain(
			'People removed before combining aren’t re-added, and'
		);

		const main = screen.getByRole('button', { name: 'Combine projects' });
		expect(main).toBeDisabled();
		expect(
			screen.getByText(/Choose what happens to those 2 people’s access first/)
		).toBeTruthy();

		await fireEvent.click(screen.getByRole('radio', { name: /They lose access/ }));
		const remove = screen.getByRole('button', { name: 'Remove 2 and combine' });
		expect(remove).not.toBeDisabled();
		await fireEvent.click(remove);
		await waitFor(() =>
			expect(screen.getByTestId('proposal-card-result').textContent).toContain(
				'Combined Content Ops into DJ Internal · removed Alice and Bob'
			)
		);
		expect(body(fetchMock.mock.calls[0])).toEqual({
			choice: 'combine_remove_members',
			session_id: SESSION,
			seen_digest: combineDigest(combine.client_action.payload as never)
		});
	});

	it('names upcoming events, keeps Combine off, and Check again picks up the cleared state', async () => {
		const blocked = card('project_combine', combinePayload(UPCOMING_BLOCKED_IMPACT));
		const cleared = combinePayload();
		const fetchMock = stubFetch(
			jsonResponse(200, {
				success: true,
				data: { view: cleared, digest: combineDigest(cleared) }
			})
		);
		render(ProposalCard, { card: blocked });

		const events = screen.getByTestId('combine-upcoming-events');
		expect(events.textContent).toContain('2 upcoming');
		expect(events.textContent).toContain('Webinar dry run');
		expect(events.textContent).toContain('Client review');
		await fireEvent.click(screen.getByRole('radio', { name: /Add them to DJ Internal/ }));
		expect(screen.getByRole('button', { name: 'Add 2 and combine' })).toBeDisabled();

		await fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
		await waitFor(() => expect(screen.queryByTestId('combine-upcoming-events')).toBeNull());
		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			`/api/chat/proposal-cards/${blocked.card_id}/preview?session_id=${SESSION}`
		);
		expect(screen.getByTestId('proposal-card-notice').textContent).toContain(
			'Something changed'
		);
		// Same people, so the pick stands; Combine is now available.
		expect(screen.getByRole('button', { name: 'Add 2 and combine' })).not.toBeDisabled();
	});

	it('shows the fresh view on PREVIEW_CHANGED, clears a stale pick, and sends the new digest next', async () => {
		const combine = card('project_combine', combinePayload());
		const fresh = combinePayload({
			members_missing: [BOB_ONLY],
			members: [
				{
					actor_id: BOB_ONLY,
					name: 'Bob',
					role_key: 'viewer',
					access: 'read',
					destination_access: null,
					named_for_addition: false
				}
			]
		});
		const fetchMock = stubFetch(
			jsonResponse(409, {
				success: false,
				error: 'The projects changed since you looked. Here is the latest. Nothing changed.',
				code: 'PREVIEW_CHANGED',
				details: { view: fresh, digest: combineDigest(fresh) }
			}),
			jsonResponse(200, { success: true, data: { resolution: resolution(combine) } })
		);
		render(ProposalCard, { card: combine });
		await fireEvent.click(screen.getByRole('radio', { name: /They lose access/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Remove 2 and combine' }));

		await waitFor(() =>
			expect(screen.getByTestId('proposal-card-notice').textContent).toContain(
				'The projects changed since you looked'
			)
		);
		expect(screen.getByText(/Bob\s+can open Content Ops but not DJ Internal\./)).toBeTruthy();
		// Different people now: the pick is cleared and Combine waits for a new one.
		expect(screen.getByRole('button', { name: 'Combine projects' })).toBeDisabled();
		await fireEvent.click(screen.getByRole('radio', { name: /They lose access/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Remove 1 and combine' }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		expect(body(fetchMock.mock.calls[1]).seen_digest).toBe(combineDigest(fresh));
	});

	it('offers only "Add them" when an owner is among the people missing', () => {
		render(ProposalCard, {
			card: card(
				'project_combine',
				combinePayload({
					members: [
						{
							actor_id: BOB_ONLY,
							name: 'Co-owner',
							role_key: 'owner',
							access: 'admin',
							destination_access: null,
							named_for_addition: false
						}
					],
					members_missing: [BOB_ONLY]
				})
			)
		});
		expect(screen.getByRole('radio', { name: /They lose access/ })).toBeDisabled();
		expect(
			screen.getByText(/Co-owner\s+owns\s+Content Ops and can’t be removed\./)
		).toBeTruthy();
		expect(screen.getByRole('radio', { name: /Add them to DJ Internal/ })).not.toBeDisabled();
	});

	it('confirms Undo with what comes back and what stays, then undoes with the undo digest', async () => {
		const combine = card('project_combine', combinePayload());
		const fetchMock = stubFetch(
			jsonResponse(200, {
				success: true,
				data: { view: undoView(), digest: 'd'.repeat(64) }
			}),
			jsonResponse(200, {
				success: true,
				data: {
					undo: {
						version: 1,
						card_id: combine.card_id,
						kind: 'project_combine',
						outcome: 'undone',
						undone_at: new Date().toISOString(),
						reason_code: null,
						receipt: {
							fold_id: '00000000-0000-4000-8000-000000000012',
							moved_back: 18,
							staying: 1,
							folder_removed: true,
							parent_restored: false,
							members_added_by_fold_stay: 0,
							replayed: false
						}
					}
				}
			})
		);
		render(ProposalCard, { card: { ...combine, card_resolution: resolution(combine) } });

		await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
		const confirm = await screen.findByTestId('proposal-card-undo-confirm');
		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			`/api/chat/proposal-cards/${combine.card_id}/undo-preview?session_id=${SESSION}`
		);
		expect(confirm.textContent).toContain('18');
		expect(confirm.textContent).toMatch(
			/items go back to\s+Content Ops, and it becomes active again\./
		);
		expect(confirm.textContent).toMatch(
			/1 edited since combining\s+stays\s+in\s+DJ Internal\./
		);
		expect(confirm.textContent).toContain('The “From Content Ops” folder is removed.');
		expect(confirm.textContent).toMatch(
			/Alice and Bob\s+were removed before\s+combining and\s+aren’t re-added\./
		);
		expect(confirm.textContent).toContain('You can only undo once.');

		await fireEvent.click(screen.getByRole('button', { name: 'Undo combine' }));
		await waitFor(() =>
			expect(screen.getByTestId('proposal-card-result').textContent).toContain(
				'Undone. Content Ops is back; 1 edited item stays in DJ Internal.'
			)
		);
		expect(body(fetchMock.mock.calls[1])).toEqual({
			session_id: SESSION,
			seen_digest: 'd'.repeat(64)
		});
	});

	it('keeps Undo off while the undo preview reports a blocker', async () => {
		const combine = card('project_combine', combinePayload());
		stubFetch(
			jsonResponse(200, {
				success: true,
				data: {
					view: undoView({ blockers: ['unfold_source_changed'] }),
					digest: 'e'.repeat(64)
				}
			})
		);
		render(ProposalCard, { card: { ...combine, card_resolution: resolution(combine) } });
		await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
		await screen.findByText(/Undo is blocked right now/);
		expect(screen.getByRole('button', { name: 'Undo combine' })).toBeDisabled();
		await fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
		expect(screen.queryByTestId('proposal-card-undo-confirm')).toBeNull();
	});
});
