// apps/web/src/lib/components/agent/SharedDocumentEditCard.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type {
	SharedDocumentEditClientActionV1,
	SharedDocumentEditResolutionV1
} from '@buildos/shared-agent-ops/ontology/shared-document-edit-card';
import SharedDocumentEditCard from './SharedDocumentEditCard.svelte';
import { sharedDocumentEditCardResolutions } from './shared-document-edit-card-state.svelte';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [SESSION, DOC, PARENT, CHILD, COPY] = Array.from({ length: 5 }, (_, n) => id(n + 1)) as [
	string,
	string,
	string,
	string,
	string
];
let cardSeq = 100;

function action(overrides: Partial<SharedDocumentEditClientActionV1> = {}) {
	const cardId = id(cardSeq++);
	return {
		kind: 'confirm_shared_document_edit',
		action_id: cardId,
		card_id: cardId,
		session_id: SESSION,
		document_id: DOC,
		document_title: 'Rate card',
		parent_project_id: PARENT,
		parent_name: 'Wayne Strategies',
		child_project_id: CHILD,
		shared_with_count: 5,
		change: {
			lines_added: 1,
			lines_removed: 1,
			hunks_truncated: false,
			hunks: [
				{
					old_start: 1,
					new_start: 1,
					lines: [
						{ kind: 'remove', text: 'Strategy session: $1,500' },
						{ kind: 'add', text: 'Strategy session: $1,800' }
					]
				}
			]
		},
		field_changes: [],
		expires_at: '2099-01-01T00:00:00.000Z',
		...overrides
	} as SharedDocumentEditClientActionV1;
}

function resolution(
	cardId: string,
	overrides: Partial<SharedDocumentEditResolutionV1> = {}
): SharedDocumentEditResolutionV1 {
	return {
		version: 1,
		card_id: cardId,
		choice: 'apply',
		outcome: 'applied',
		resolved_at: '2026-09-30T12:05:00.000Z',
		document_id: DOC,
		document_title: 'Rate card',
		parent_project_id: PARENT,
		parent_name: 'Wayne Strategies',
		shared_with_count: 5,
		copy: null,
		...overrides
	};
}

function respond(status: number, body: unknown) {
	return vi.fn(
		async () =>
			new Response(JSON.stringify(body), {
				status,
				headers: { 'Content-Type': 'application/json' }
			})
	);
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	sharedDocumentEditCardResolutions.clear();
});

describe('SharedDocumentEditCard', () => {
	it('shows the exact change, where it lives, and three labelled choices', () => {
		const { container } = render(SharedDocumentEditCard, {
			card: { action: action(), resolution: null }
		});
		expect(screen.getByRole('heading', { name: /Rate card · Wayne Strategies/ })).toBeTruthy();
		expect(screen.getByText('Shared with 5 sub-projects')).toBeTruthy();
		// The diff renderer splits changed words into spans; read the whole diff.
		const diff = container.querySelector('[id$="-diff"]')!.textContent ?? '';
		expect(diff).toContain('1,500');
		expect(diff).toContain('1,800');
		expect(diff).toContain('Strategy session');
		const group = screen.getByRole('group', { name: 'Choose what happens to this change' });
		expect(group).toBeTruthy();
		for (const name of ['Update shared doc', 'Copy here', 'Cancel'])
			expect(screen.getByRole('button', { name })).not.toBeDisabled();
	});

	it('waits for the reply to finish before taking a choice', () => {
		render(SharedDocumentEditCard, {
			card: { action: action(), resolution: null },
			turnActive: true
		});
		for (const name of ['Update shared doc', 'Copy here', 'Cancel'])
			expect(screen.getByRole('button', { name })).toBeDisabled();
		expect(screen.getByText('You can choose when Jev finishes replying.')).toBeTruthy();
	});

	it('applies on click, disables while in flight, then resolves in place and announces it', async () => {
		const card = action();
		let release: (value: Response) => void = () => {};
		const fetchMock = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					release = resolve;
				})
		);
		vi.stubGlobal('fetch', fetchMock);
		const onResolved = vi.fn();
		render(SharedDocumentEditCard, { card: { action: card, resolution: null }, onResolved });

		await fireEvent.click(screen.getByRole('button', { name: 'Update shared doc' }));
		expect(screen.getByRole('button', { name: /Updating/ })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Copy here' })).toBeDisabled();
		expect(fetchMock).toHaveBeenCalledWith(
			`/api/chat/shared-document-edits/${card.card_id}`,
			expect.objectContaining({
				body: JSON.stringify({ choice: 'apply', session_id: SESSION })
			})
		);

		release(
			new Response(
				JSON.stringify({ success: true, data: { resolution: resolution(card.card_id) } }),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			)
		);
		await waitFor(() =>
			expect(screen.getByTestId('shared-document-edit-card-result').textContent).toContain(
				'Updated in Wayne Strategies · shown in 5 projects'
			)
		);
		expect(screen.queryByRole('button', { name: 'Update shared doc' })).toBeNull();
		expect(screen.getByRole('link', { name: /Open/ })).toHaveAttribute(
			'href',
			`/projects/${PARENT}?doc=${DOC}`
		);
		expect(screen.getByRole('status').textContent).toContain('Updated in Wayne Strategies');
		expect(onResolved).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'applied' }));
	});

	it('renders a card resolved before reload, with no buttons', () => {
		const card = action();
		render(SharedDocumentEditCard, {
			card: {
				action: card,
				resolution: resolution(card.card_id, {
					choice: 'copy',
					outcome: 'copied',
					copy: {
						document_id: COPY,
						project_id: CHILD,
						project_name: 'Redline',
						title: 'Rate card',
						edit_applied: true
					}
				})
			}
		});
		expect(screen.getByText('Copied to Redline and edited')).toBeTruthy();
		expect(screen.getByRole('link', { name: /Open/ })).toHaveAttribute(
			'href',
			`/projects/${CHILD}?doc=${COPY}`
		);
		expect(screen.queryByRole('button')).toBeNull();
	});

	it.each([
		['cancelled', 'Cancelled'],
		['stale', 'The copy in Wayne Strategies changed since this preview. Ask Jev again.']
	] as const)('shows the %s outcome', (outcome, text) => {
		const card = action();
		render(SharedDocumentEditCard, {
			card: {
				action: card,
				resolution: resolution(card.card_id, {
					outcome,
					choice: outcome === 'cancelled' ? 'cancel' : 'apply'
				})
			}
		});
		expect(screen.getByText(text)).toBeTruthy();
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('keeps the choices open after a refused click and says why', async () => {
		vi.stubGlobal(
			'fetch',
			respond(403, {
				success: false,
				error: 'You can’t edit documents in Wayne Strategies. Copy here still works.',
				code: 'PARENT_WRITE_REQUIRED'
			})
		);
		render(SharedDocumentEditCard, { card: { action: action(), resolution: null } });
		await fireEvent.click(screen.getByRole('button', { name: 'Update shared doc' }));
		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Copy here'));
		expect(screen.getByRole('button', { name: 'Copy here' })).not.toBeDisabled();
	});

	it('closes an expired card without offering choices', () => {
		render(SharedDocumentEditCard, {
			card: { action: action({ expires_at: '2020-01-01T00:00:00.000Z' }), resolution: null }
		});
		expect(screen.getByText(/This preview expired/)).toBeTruthy();
		expect(screen.queryByRole('button')).toBeNull();
	});
});
