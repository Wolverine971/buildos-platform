// apps/web/src/lib/components/agent/agent-chat-step-outcomes.ts
//
// What happened to a change after its step ran: the person undid it, approved a held change,
// or turned it down. The cards below the reply already know (Undo on a document or table card,
// a shared-document confirm card, a proposal card); this carries the same fact back to the
// step row, the header receipt and the lit phrase, so they never keep saying "Updated" about
// a change that was undone, or "Needs your choice" about one that was approved.
//
// Pure, and built from structured data only: change-card messages (`undone`), receipts
// (`document_change`, `table_change`), and card resolutions (live maps first, then the copy
// the server mirrors onto the tool result, which is what a reload sees).

import type { SharedDocumentEditResolutionV1 } from '@buildos/shared-agent-ops/ontology/shared-document-edit-card';
import type {
	ProposalCardResolutionV1,
	ProposalCardUndoV1
} from '@buildos/shared-agent-ops/chat-cards/proposal-card';
import type { ActivityEntry, ThinkingBlockMessage, UIMessage } from './agent-chat.types';
import type { StepSettlement } from './agent-chat-turn-cards';
import { extractDocumentChangeReceipt, type DocumentChangeCard } from './document-change-cards';
import { extractProposalCard } from './proposal-cards';
import { extractSharedDocumentEditCard } from './shared-document-edit-cards';
import { extractTableChangeReceipt, type TableChangeCard } from './table-change-cards';

/** Resolutions made in this page session, by card id (the reactive maps the cards write). */
export type LiveCardOutcomes = {
	sharedEdit?: (cardId: string) => SharedDocumentEditResolutionV1 | undefined;
	proposalResolution?: (cardId: string) => ProposalCardResolutionV1 | undefined;
	proposalUndo?: (cardId: string) => ProposalCardUndoV1 | undefined;
};

export type StepSettlements = Readonly<Record<string, StepSettlement>>;

const UNDONE: StepSettlement = { state: 'undone', label: 'Undone' };

function sharedEditSettlement(
	resolution: SharedDocumentEditResolutionV1 | null | undefined
): StepSettlement | null {
	switch (resolution?.outcome) {
		case 'applied':
			return { state: 'approved', label: 'Updated' };
		case 'copied':
			return { state: 'approved', label: 'Saved as a copy' };
		case 'cancelled':
			return { state: 'declined', label: 'Not saved' };
		case 'stale':
			return { state: 'declined', label: 'Expired, not saved' };
		default:
			return null;
	}
}

function proposalSettlement(
	resolution: ProposalCardResolutionV1 | null | undefined,
	undo: ProposalCardUndoV1 | null | undefined
): StepSettlement | null {
	if (undo?.outcome === 'undone') return UNDONE;
	switch (resolution?.outcome) {
		case 'applied':
			return { state: 'approved', label: 'Approved' };
		case 'cancelled':
			return { state: 'declined', label: 'Declined' };
		case 'stale':
			return { state: 'declined', label: 'Expired, not applied' };
		default:
			return null;
	}
}

function receiptOf<T>(activity: ActivityEntry, extract: (value: unknown) => T | null): T | null {
	return extract(activity.metadata?.result) ?? extract(activity.metadata?.response);
}

function settleStep(
	activity: ActivityEntry,
	undone: { documents: ReadonlySet<string>; tables: ReadonlySet<string> },
	live: LiveCardOutcomes
): StepSettlement | null {
	if (activity.activityType !== 'tool_call' || activity.status !== 'completed') return null;
	const shared = extractSharedDocumentEditCard(activity);
	if (shared) {
		return sharedEditSettlement(live.sharedEdit?.(shared.action.card_id) ?? shared.resolution);
	}
	const proposal = extractProposalCard(activity);
	if (proposal) {
		return proposalSettlement(
			live.proposalResolution?.(proposal.card_id) ?? proposal.card_resolution,
			live.proposalUndo?.(proposal.card_id) ?? proposal.card_undo
		);
	}
	const document = receiptOf(activity, extractDocumentChangeReceipt);
	if (document && undone.documents.has(document.document_id)) return UNDONE;
	const table = receiptOf(activity, extractTableChangeReceipt);
	if (table && undone.tables.has(table.document_id)) return UNDONE;
	return null;
}

/**
 * Settlements for every turn in the list, keyed by thinking-block id, then step activity id.
 * A turn is a user message's answer: its thinking blocks and the change cards that follow.
 */
export function deriveStepSettlements(
	messages: readonly UIMessage[],
	live: LiveCardOutcomes = {}
): Map<string, StepSettlements> {
	const out = new Map<string, StepSettlements>();
	let blocks: ThinkingBlockMessage[] = [];
	let documents = new Set<string>();
	let tables = new Set<string>();
	const flush = () => {
		for (const block of blocks) {
			const settled: Record<string, StepSettlement> = {};
			for (const activity of block.activities ?? []) {
				const settlement = settleStep(activity, { documents, tables }, live);
				if (settlement) settled[activity.id] = settlement;
			}
			if (Object.keys(settled).length > 0) out.set(block.id, settled);
		}
		blocks = [];
		documents = new Set();
		tables = new Set();
	};
	for (const message of messages) {
		if (message.type === 'user') flush();
		else if (message.type === 'thinking_block') blocks.push(message as ThinkingBlockMessage);
		else if (message.type === 'document_changes') {
			for (const card of (message.data?.changes ?? []) as DocumentChangeCard[])
				if (card.undone) documents.add(card.documentId);
		} else if (message.type === 'table_changes') {
			for (const card of (message.data?.changes ?? []) as TableChangeCard[])
				if (card.undone) tables.add(card.documentId);
		}
	}
	flush();
	return out;
}
