// apps/web/src/lib/services/agentic-chat-v2/proposal-card-history.ts
//
// Proposal cards in chat history (tasker 122, proposal-card rail). The user
// decides a card by clicking it between chat turns, so the next turn cannot see
// that in the conversation text. Each card row in the history window (loaded
// with the continuity rows, so no extra query) becomes one structured system
// note right after the assistant reply that showed it: kind, subjects, state
// (pending, applied, cancelled, stale, unknown, undone) read from the envelope
// and the resolution/undo the click mirrored onto it, the duplicate check's run
// id, and the kind's fixed meaning sentence. Nothing here reads user or model
// prose.
import {
	isProposalCardResult,
	parseProposalCardEnvelope,
	proposalCardSpec,
	proposalCardState,
	type ProposalCardEnvelopeV1
} from '@buildos/shared-agent-ops/chat-cards/proposal-card';
import type {
	FastChatHistoryMessageWithLineage,
	InterruptedToolExecutionSummaryRow
} from './session-service';

/**
 * PostgREST `or` filter for proposal-card rows, keyed on the rail (never on the
 * tool name). OR it into CHAT_CONTINUITY_EXECUTION_FILTER so ordinary reads
 * cannot crowd cards out before the LIMIT.
 */
export const PROPOSAL_CARD_CONTINUITY_FILTER =
	'and(result->>card_rail.eq.proposal_v1,result->>status.eq.proposal_ready)';

/** Only the latest cards in the window ride along; older ones are settled history. */
export const PROPOSAL_CARD_NOTE_LIMIT = 3;

export const PROPOSAL_CARD_CONTINUITY_KIND = 'proposal_card_v1' as const;

const NOTE_HEADER =
	'Proposal card status (recorded by BuildOS from the card; the user’s click is the only consent):';

/** A proposal card row: it changed nothing by itself, so it is never a saved write. */
export function isProposalCardRow(row: InterruptedToolExecutionSummaryRow): boolean {
	return Boolean(row.success && isProposalCardResult(row.result));
}

function duplicateCheckRunId(card: ProposalCardEnvelopeV1): string | null {
	const payload = card.client_action.payload as {
		duplicate_check?: { run_id?: unknown } | null;
	};
	const runId = payload?.duplicate_check?.run_id;
	return typeof runId === 'string' ? runId : null;
}

export function renderProposalCardNote(card: ProposalCardEnvelopeV1): string {
	const spec = proposalCardSpec(card.kind);
	const payload = card.client_action.payload;
	const state = proposalCardState(card);
	const resolution = card.card_resolution;
	const undo = card.card_undo;
	return `${NOTE_HEADER} ${JSON.stringify({
		card_id: card.card_id,
		kind: card.kind,
		subjects: spec.subjects(payload),
		state,
		...(resolution
			? {
					choice: resolution.choice,
					resolved_at: resolution.resolved_at,
					...(resolution.reason_code ? { reason_code: resolution.reason_code } : {})
				}
			: { expires_at: card.client_action.expires_at }),
		...(undo && undo.outcome !== 'undone' ? { undo_state: undo.outcome } : {}),
		...(undo ? { undone_at: undo.undone_at } : {}),
		duplicate_check_run_id: duplicateCheckRunId(card),
		meaning: spec.noteMeaning(state, payload, card)
	})}`;
}

/**
 * One note per card, keyed by the assistant message that showed it. Rows must
 * arrive in history order; only the latest PROPOSAL_CARD_NOTE_LIMIT cards are
 * kept. Rows that do not parse as a registered card produce nothing.
 */
export function proposalCardNotes(
	rows: readonly InterruptedToolExecutionSummaryRow[]
): Map<string, FastChatHistoryMessageWithLineage[]> {
	const cards = rows.flatMap((row) => {
		if (!row.message_id || !isProposalCardRow(row)) return [];
		const card = parseProposalCardEnvelope(row.result);
		return card ? [{ messageId: row.message_id, card }] : [];
	});
	const notes = new Map<string, FastChatHistoryMessageWithLineage[]>();
	for (const { messageId, card } of cards.slice(-PROPOSAL_CARD_NOTE_LIMIT)) {
		const existing = notes.get(messageId) ?? [];
		existing.push({
			role: 'system',
			content: renderProposalCardNote(card),
			continuityKind: PROPOSAL_CARD_CONTINUITY_KIND,
			sourceMessageId: null
		});
		notes.set(messageId, existing);
	}
	return notes;
}
