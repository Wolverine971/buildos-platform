// apps/web/src/lib/components/agent/shared-document-edit-cards.ts
//
// Browser half of the shared-document confirm card (project hierarchy Phase 2).
// The card arrives as a `client_action` of kind `confirm_shared_document_edit`
// on an update_onto_document tool result (live SSE or a restored tool
// execution), renders under the assistant reply that showed it, and sends the
// user's choice to POST /api/chat/shared-document-edits/[id]. Only the card id,
// its session and the choice leave the browser; the edit stays server-side.
//
// Detection reads structured fields only.
import {
	SHARED_DOCUMENT_EDIT_CLIENT_ACTION_KIND,
	parseSharedDocumentEditClientAction,
	parseSharedDocumentEditResolution,
	type SharedDocumentEditChoice,
	type SharedDocumentEditClientActionV1,
	type SharedDocumentEditResolutionV1
} from '@buildos/shared-agent-ops/ontology/shared-document-edit-card';
import type { ActivityEntry, ThinkingBlockMessage, UIMessage } from './agent-chat.types';

export type SharedDocumentEditCardView = {
	action: SharedDocumentEditClientActionV1;
	/** Recorded on the tool result by the server once the card was resolved. */
	resolution: SharedDocumentEditResolutionV1 | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

/** The receipt object that carries the card, however deep the transport nested it. */
function findCardReceipt(value: unknown, depth = 0): Record<string, unknown> | null {
	if (depth > 4) return null;
	const record = asRecord(value);
	if (!record) return null;
	if (asRecord(record.client_action)?.kind === SHARED_DOCUMENT_EDIT_CLIENT_ACTION_KIND)
		return record;
	return findCardReceipt(record.result, depth + 1) ?? findCardReceipt(record.data, depth + 1);
}

export function extractSharedDocumentEditCard(
	activity: ActivityEntry
): SharedDocumentEditCardView | null {
	if (activity.status !== 'completed') return null;
	const receipt =
		findCardReceipt(activity.metadata?.result) ??
		findCardReceipt(activity.metadata?.response) ??
		findCardReceipt(activity.metadata);
	const action = receipt ? parseSharedDocumentEditClientAction(receipt.client_action) : null;
	if (!receipt || !action) return null;
	const resolution = parseSharedDocumentEditResolution(receipt.card_resolution);
	return {
		action,
		resolution: resolution && resolution.card_id === action.card_id ? resolution : null
	};
}

export function collectSharedDocumentEditCards(
	activities: readonly ActivityEntry[]
): SharedDocumentEditCardView[] {
	const cards = new Map<string, SharedDocumentEditCardView>();
	for (const activity of activities) {
		const card = extractSharedDocumentEditCard(activity);
		if (!card) continue;
		const seen = cards.get(card.action.card_id);
		cards.set(card.action.card_id, seen?.resolution && !card.resolution ? seen : card);
	}
	return [...cards.values()];
}

export type SharedDocumentEditCardPlacement = {
	cards: SharedDocumentEditCardView[];
	/** The reply that showed the cards is still streaming. */
	turnActive: boolean;
};

/**
 * Cards keyed by the message they render under: the last assistant reply of
 * the turn whose thinking block produced them, or the thinking block itself
 * while that reply has not started.
 */
export function placeSharedDocumentEditCards(
	messages: readonly UIMessage[]
): Map<string, SharedDocumentEditCardPlacement> {
	const placements = new Map<string, SharedDocumentEditCardPlacement>();
	let pending: (SharedDocumentEditCardPlacement & { anchor: string }) | null = null;
	const flush = () => {
		if (pending && pending.cards.length > 0) {
			const existing = placements.get(pending.anchor);
			placements.set(pending.anchor, {
				cards: [...(existing?.cards ?? []), ...pending.cards],
				turnActive: Boolean(existing?.turnActive) || pending.turnActive
			});
		}
		pending = null;
	};
	for (const message of messages) {
		if (message.type === 'thinking_block') {
			flush();
			const block = message as ThinkingBlockMessage;
			const cards = collectSharedDocumentEditCards(block.activities ?? []);
			if (cards.length > 0)
				pending = { cards, turnActive: block.status === 'active', anchor: block.id };
		} else if (message.type === 'assistant') {
			if (pending) pending.anchor = message.id;
		} else if (message.type === 'user') {
			flush();
		}
	}
	flush();
	return placements;
}

export type SharedDocumentEditRequestResult =
	| { status: 'resolved'; resolution: SharedDocumentEditResolutionV1 }
	/** Nothing changed; the card stays open (or shows `message` when it can't be used). */
	| { status: 'error'; message: string; code: string | null };

export async function chooseSharedDocumentEdit(
	action: Pick<SharedDocumentEditClientActionV1, 'card_id' | 'session_id'>,
	choice: SharedDocumentEditChoice,
	fetchImpl: typeof fetch = fetch
): Promise<SharedDocumentEditRequestResult> {
	let response: Response;
	try {
		response = await fetchImpl(
			`/api/chat/shared-document-edits/${encodeURIComponent(action.card_id)}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ choice, session_id: action.session_id })
			}
		);
	} catch {
		return {
			status: 'error',
			code: null,
			message: 'Couldn’t reach BuildOS. Check your connection and try again.'
		};
	}
	const payload = asRecord(await response.json().catch(() => null));
	const resolution = parseSharedDocumentEditResolution(asRecord(payload?.data)?.resolution);
	if (response.ok && payload?.success === true && resolution)
		return { status: 'resolved', resolution };
	return {
		status: 'error',
		code: typeof payload?.code === 'string' ? payload.code : null,
		message:
			typeof payload?.error === 'string' && payload.error
				? payload.error
				: 'That didn’t go through. Nothing changed; try again.'
	};
}
