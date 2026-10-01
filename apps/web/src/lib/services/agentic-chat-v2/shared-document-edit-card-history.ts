// apps/web/src/lib/services/agentic-chat-v2/shared-document-edit-card-history.ts
//
// Shared-document confirm cards in chat history (project hierarchy Phase 2).
// The user resolves a card by clicking it, between chat turns, so the next turn
// cannot see that from the conversation text. Each card row in the history
// window (already loaded with the continuity rows, so no extra query) becomes
// one structured system note right after the assistant reply that showed it:
// the card's state (pending, applied, copied, cancelled, stale, unknown) read
// from the receipt and the resolution the click recorded on it. Nothing here
// reads user or model prose.
import {
	isSharedDocumentEditPreview,
	parseSharedDocumentEditCardReceipt,
	type SharedDocumentEditCardReceiptV1
} from '@buildos/shared-agent-ops/ontology/shared-document-edit-card';
import type {
	FastChatHistoryMessageWithLineage,
	InterruptedToolExecutionSummaryRow
} from './session-service';

/** Filter before LIMIT so ordinary document saves cannot crowd out continuity. */
export const CHAT_CONTINUITY_EXECUTION_FILTER =
	'tool_name.in.(skill_load,request_turn_clarification),and(tool_name.eq.update_onto_document,result->>confirmation_kind.eq.shared_document_edit_v1,result->>status.eq.confirmation_required)';

/** Only the latest cards in the window ride along; older ones are settled history. */
export const SHARED_DOCUMENT_EDIT_CARD_NOTE_LIMIT = 3;

const NOTE_HEADER =
	'Shared-document edit card status (recorded by BuildOS from the card; the user’s click is the only consent):';

/** Any shared-document preview row: it changed nothing, so it is never a saved write. */
export function isSharedDocumentEditCardRow(row: InterruptedToolExecutionSummaryRow): boolean {
	return Boolean(
		row.success &&
			row.tool_name === 'update_onto_document' &&
			isSharedDocumentEditPreview(row.result)
	);
}

function meaning(card: SharedDocumentEditCardReceiptV1): string {
	const resolution = card.card_resolution;
	switch (resolution?.outcome) {
		case undefined:
			return 'The user has not chosen yet and nothing changed. If they want the change, point them to the card; do not repeat the edit.';
		case 'applied':
			return 'The user chose Update shared doc. The edit is saved in the owner project and every sub-project sees it.';
		case 'copied':
			return resolution.copy?.edit_applied
				? 'The user chose Copy here. This project now has its own copy (copy_document_id) with the edit; the shared copy is unchanged. Make further edits to that copy.'
				: 'The user chose Copy here. This project now has its own copy (copy_document_id), but the edit could not be applied to it; the shared copy is unchanged.';
		case 'cancelled':
			return 'The user cancelled. Nothing changed.';
		case 'stale':
			return 'The shared copy changed before the user chose, so nothing was saved. Propose the edit again only if they still want it.';
		case 'unknown':
			return 'BuildOS could not confirm whether the edit saved. Ask the user to check the document before trying again.';
	}
}

export function renderSharedDocumentEditCardNote(card: SharedDocumentEditCardReceiptV1): string {
	const action = card.client_action;
	const resolution = card.card_resolution;
	return `${NOTE_HEADER} ${JSON.stringify({
		card_id: card.card_id,
		document_id: action.document_id,
		document_title: action.document_title,
		owner_project: action.parent_name,
		owner_project_id: action.parent_project_id,
		shared_with_count: action.shared_with_count,
		state: resolution?.outcome ?? 'pending',
		...(resolution ? { resolved_at: resolution.resolved_at } : { expires_at: action.expires_at }),
		...(resolution?.copy
			? {
					copy_document_id: resolution.copy.document_id,
					copy_project_id: resolution.copy.project_id
				}
			: {}),
		meaning: meaning(card)
	})}`;
}

/**
 * One note per card, keyed by the assistant message that showed it. Rows must
 * arrive in history order; only the latest SHARED_DOCUMENT_EDIT_CARD_NOTE_LIMIT
 * cards are kept. Retired typed-"yes" previews produce nothing.
 */
export function sharedDocumentEditCardNotes(
	rows: readonly InterruptedToolExecutionSummaryRow[]
): Map<string, FastChatHistoryMessageWithLineage[]> {
	const cards = rows.flatMap((row) => {
		if (!row.message_id || !isSharedDocumentEditCardRow(row)) return [];
		const card = parseSharedDocumentEditCardReceipt(row.result);
		return card ? [{ messageId: row.message_id, card }] : [];
	});
	const notes = new Map<string, FastChatHistoryMessageWithLineage[]>();
	for (const { messageId, card } of cards.slice(-SHARED_DOCUMENT_EDIT_CARD_NOTE_LIMIT)) {
		const existing = notes.get(messageId) ?? [];
		existing.push({
			role: 'system',
			content: renderSharedDocumentEditCardNote(card),
			continuityKind: 'shared_document_edit_card_v1',
			sourceMessageId: null
		});
		notes.set(messageId, existing);
	}
	return notes;
}
