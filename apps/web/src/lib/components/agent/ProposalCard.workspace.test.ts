// apps/web/src/lib/components/agent/ProposalCard.workspace.test.ts
// @vitest-environment jsdom
//
// The Workspace cards in the chat (tasker 146): what moves is listed by title, the
// main button files or starts the project with the digest the card showed, a changed
// Workspace redraws the card from the server's fresh view, and Undo confirms first.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import {
	workspaceFileDigest,
	workspaceProjectDigest,
	type WorkspaceFileProposalPayloadV1,
	type WorkspaceProjectProposalPayloadV1
} from '@buildos/shared-agent-ops/chat-cards/proposal-card';
import ProposalCard from './ProposalCard.svelte';
import { clearProposalCardState } from './proposal-card-state.svelte';
import { SESSION, card, fixtureId, jsonResponse } from './proposal-cards.fixture';

const WORKSPACE = fixtureId(60);
const TARGET = fixtureId(61);
const NOTE = fixtureId(62);
const TASK = fixtureId(63);
const BATCH = fixtureId(64);

function filePayload(
	overrides: Partial<WorkspaceFileProposalPayloadV1> = {}
): WorkspaceFileProposalPayloadV1 {
	return {
		version: 1,
		workspace: { id: WORKSPACE, name: 'Workspace' },
		target: { id: TARGET, name: 'BuildOS' },
		items: [
			{ entity: 'document', id: NOTE, kind: 'note', title: 'Pricing thought' },
			{ entity: 'task', id: TASK, kind: 'task', title: 'Email Cadre' }
		],
		nested_documents: 1,
		suggestion_id: null,
		reason: 'Both are about pricing.',
		checked_at: new Date().toISOString(),
		...overrides
	};
}

function stubFetch(...responses: Response[]) {
	const fetchMock = vi.fn();
	for (const response of responses) fetchMock.mockImplementationOnce(async () => response);
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

const body = (call: unknown[] | undefined) =>
	JSON.parse(String((call?.[1] as RequestInit | undefined)?.body ?? '{}'));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	clearProposalCardState();
});

describe('ProposalCard: Workspace filing', () => {
	it('lists what moves and files it with the digest it showed', async () => {
		const payload = filePayload();
		const filing = card('workspace_file', payload);
		const fetchMock = stubFetch(
			jsonResponse(200, {
				success: true,
				data: {
					resolution: {
						version: 1,
						card_id: filing.card_id,
						kind: 'workspace_file',
						choice: 'apply',
						outcome: 'applied',
						resolved_at: new Date().toISOString(),
						reason_code: null,
						receipt: {
							target_project_id: TARGET,
							batch_id: BATCH,
							moved: 2,
							suggestion_id: null,
							suggestion_updated: false
						}
					}
				}
			})
		);
		render(ProposalCard, { card: filing });

		expect(screen.getByRole('heading', { name: 'File 2 items into BuildOS' })).toBeTruthy();
		expect(screen.getByText('Moves into BuildOS')).toBeTruthy();
		expect(screen.getByText('Pricing thought')).toBeTruthy();
		expect(screen.getByText('Email Cadre')).toBeTruthy();
		expect(screen.getByText('Both are about pricing.')).toBeTruthy();
		expect(screen.getByText('Plus 1 doc filed inside them.')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'File them' }));
		expect(body(fetchMock.mock.calls[0])).toEqual({
			choice: 'apply',
			session_id: SESSION,
			seen_digest: workspaceFileDigest(payload)
		});
		await waitFor(() =>
			expect(screen.getByTestId('proposal-card-result').textContent).toContain(
				'Filed 2 items into BuildOS'
			)
		);
		expect(screen.getByRole('link', { name: /Open/ }).getAttribute('href')).toBe(
			`/projects/${TARGET}`
		);
		expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
	});

	it('redraws from the fresh view when the Workspace changed, then sends its digest', async () => {
		const payload = filePayload();
		const fresh = filePayload({ items: [payload.items[1]!], nested_documents: 0 });
		const fetchMock = stubFetch(
			jsonResponse(409, {
				success: false,
				code: 'PREVIEW_CHANGED',
				error: 'Your Workspace changed since this card. Here is what’s there now. Nothing changed.',
				details: { view: fresh, digest: workspaceFileDigest(fresh) }
			}),
			jsonResponse(500, { success: false, error: 'Try again.' })
		);
		render(ProposalCard, { card: card('workspace_file', payload) });

		await fireEvent.click(screen.getByRole('button', { name: 'File them' }));
		await waitFor(() =>
			expect(screen.getByTestId('proposal-card-notice').textContent).toContain(
				'Your Workspace changed'
			)
		);
		expect(screen.queryByText('Pricing thought')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'File it' }));
		expect(body(fetchMock.mock.calls[1]).seen_digest).toBe(workspaceFileDigest(fresh));
	});

	it('confirms Undo before moving the items back', async () => {
		const filing = card('workspace_file', filePayload());
		const fetchMock = stubFetch(
			jsonResponse(200, {
				success: true,
				data: {
					undo: {
						version: 1,
						card_id: filing.card_id,
						kind: 'workspace_file',
						outcome: 'undone',
						undone_at: new Date().toISOString(),
						reason_code: null,
						receipt: { batch_id: BATCH }
					}
				}
			})
		);
		render(ProposalCard, {
			card: {
				...filing,
				card_resolution: {
					version: 1,
					card_id: filing.card_id,
					kind: 'workspace_file',
					choice: 'apply',
					outcome: 'applied',
					resolved_at: new Date().toISOString(),
					reason_code: null,
					receipt: {
						target_project_id: TARGET,
						batch_id: BATCH,
						moved: 2,
						suggestion_id: null,
						suggestion_updated: false
					}
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
		expect(screen.getByText('Move these items back to your Workspace?')).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
		await waitFor(() =>
			expect(screen.getByTestId('proposal-card-result').textContent).toContain(
				'Undone. The items are back in your Workspace.'
			)
		);
		expect(body(fetchMock.mock.calls[0])).toEqual({ session_id: SESSION });
	});
});

describe('ProposalCard: start a project from the Workspace', () => {
	it('names the new project and starts it on click', async () => {
		const payload: WorkspaceProjectProposalPayloadV1 = {
			version: 1,
			workspace: { id: WORKSPACE, name: 'Workspace' },
			name: 'Pricing',
			description: 'Everything about the new price.',
			items: filePayload().items,
			nested_documents: 0,
			suggestion_id: null,
			checked_at: new Date().toISOString()
		};
		const fetchMock = stubFetch(jsonResponse(500, { success: false, error: 'Try again.' }));
		render(ProposalCard, { card: card('workspace_project', payload) });

		expect(
			screen.getByRole('heading', { name: 'Start Pricing from 2 Workspace items' })
		).toBeTruthy();
		expect(screen.getByText('Moves into the new project Pricing')).toBeTruthy();
		expect(screen.getByText('Everything about the new price.')).toBeTruthy();
		expect(screen.getByText('It also gets its own Start Here doc.')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Start the project' }));
		expect(body(fetchMock.mock.calls[0])).toMatchObject({
			choice: 'apply',
			seen_digest: workspaceProjectDigest(payload)
		});
		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Try again.'));
	});
});
