// packages/shared-agent-ops/src/ontology/shared-document-edit-card.test.ts
import { describe, expect, it } from 'vitest';
import {
	describeSharedDocumentEditResolution,
	isSharedDocumentEditCardExpired,
	isSharedDocumentEditPreview,
	parseSharedDocumentEditCardReceipt,
	parseSharedDocumentEditClientAction,
	parseSharedDocumentEditResolution,
	type SharedDocumentEditResolutionV1
} from './shared-document-edit-card';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [CARD, SESSION, DOC, PARENT, CHILD, FOLDER, MESSAGE, COPY] = Array.from({ length: 8 }, (_, n) =>
	id(n + 1)
);

function action() {
	return {
		kind: 'confirm_shared_document_edit',
		action_id: CARD,
		card_id: CARD,
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
		expires_at: '2026-10-01T12:00:00.000Z'
	};
}

function receipt() {
	return {
		status: 'confirmation_required',
		requires_user_action: true,
		confirmation_kind: 'shared_document_edit_v1',
		card_version: 2,
		card_id: CARD,
		source_user_message_id: MESSAGE,
		pending_edit: {
			document_id: DOC,
			child_project_id: CHILD,
			parent_project_id: PARENT,
			shared_folder_id: FOLDER,
			shared_with_count: 5,
			document_version: '2026-09-30T12:00:00.123456+00:00',
			arguments: {
				document_id: DOC,
				edits: [{ old_text: '$1,500', new_text: '$1,800' }]
			}
		},
		client_action: action(),
		message: 'Nothing has changed yet.'
	};
}

function resolution(
	overrides: Partial<SharedDocumentEditResolutionV1> = {}
): SharedDocumentEditResolutionV1 {
	return {
		version: 1,
		card_id: CARD,
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

describe('shared-document edit card contract', () => {
	it('parses the server-held card receipt and its display action', () => {
		const parsed = parseSharedDocumentEditCardReceipt(receipt());
		expect(parsed?.pending_edit.arguments).toEqual(receipt().pending_edit.arguments);
		expect(parsed?.client_action.change?.hunks[0]!.lines).toHaveLength(2);
		expect(parseSharedDocumentEditClientAction(action())?.card_id).toBe(CARD);
	});

	it('rejects the retired token preview, mismatched ids and malformed diffs', () => {
		const tokenPreview = {
			status: 'confirmation_required',
			confirmation_kind: 'shared_document_edit_v1',
			confirmation_token: CARD
		};
		expect(isSharedDocumentEditPreview(tokenPreview)).toBe(true);
		expect(parseSharedDocumentEditCardReceipt(tokenPreview)).toBeNull();

		const otherDoc = receipt();
		otherDoc.pending_edit.arguments.document_id = id(99);
		expect(parseSharedDocumentEditCardReceipt(otherDoc)).toBeNull();

		const otherParent = receipt();
		otherParent.client_action.parent_project_id = id(99);
		expect(parseSharedDocumentEditCardReceipt(otherParent)).toBeNull();

		const badDiff = action();
		(badDiff.change.hunks[0]!.lines[0] as { kind: string }).kind = 'move';
		expect(parseSharedDocumentEditClientAction(badDiff)).toBeNull();
	});

	it('carries a mirrored resolution only when it names the same card', () => {
		const resolved = { ...receipt(), card_resolution: resolution() };
		expect(parseSharedDocumentEditCardReceipt(resolved)?.card_resolution?.outcome).toBe(
			'applied'
		);
		const foreign = { ...receipt(), card_resolution: resolution({ card_id: id(99) }) };
		expect(parseSharedDocumentEditCardReceipt(foreign)?.card_resolution).toBeUndefined();
	});

	it('requires a copy for a copied outcome', () => {
		expect(
			parseSharedDocumentEditResolution(resolution({ choice: 'copy', outcome: 'copied' }))
		).toBeNull();
	});

	it('describes every outcome in the card’s words', () => {
		expect(describeSharedDocumentEditResolution(resolution())).toEqual({
			text: 'Updated in Wayne Strategies · shown in 5 projects',
			href: `/projects/${PARENT}?doc=${DOC}`
		});
		expect(
			describeSharedDocumentEditResolution(
				resolution({
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
			)
		).toEqual({ text: 'Copied to Redline and edited', href: `/projects/${CHILD}?doc=${COPY}` });
		expect(
			describeSharedDocumentEditResolution(
				resolution({ choice: 'cancel', outcome: 'cancelled' })
			).text
		).toBe('Cancelled');
		expect(describeSharedDocumentEditResolution(resolution({ outcome: 'stale' })).text).toBe(
			'The copy in Wayne Strategies changed since this preview. Ask Jev again.'
		);
	});

	it('expires a card at its deadline', () => {
		const deadline = Date.parse(action().expires_at);
		expect(isSharedDocumentEditCardExpired(action(), deadline - 1)).toBe(false);
		expect(isSharedDocumentEditCardExpired(action(), deadline)).toBe(true);
	});
});
