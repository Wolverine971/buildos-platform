// apps/worker/src/workers/freshness-radar/card.ts
//
// Stage [5e]: the chat card. An injected assistant chat_messages row in the
// trigger session, delivered by the existing realtime INSERT subscription and
// by session hydration. Idempotent through the unique (session_id,
// metadata->>'idempotency_key') index: 23505 means already delivered.
// The row's `content` enters chat history, so it states facts only.
//
// Amendment: the plan names message_type 'freshness_radar_card', but the
// production chat_messages_message_type_check allows only user_message,
// assistant_message, system_notification, operation_summary and phase_update,
// and no radar migration extends it (proven by freshnessRadar.postgres.test.ts).
// The row is therefore an 'assistant_message'; the card is identified by
// metadata { source: 'freshness_radar', kind: 'freshness_radar_card' }, which is
// exactly what the web hydration and realtime paths key on.

import {
	FRESHNESS_CARD_MAX_ITEMS,
	FRESHNESS_CARD_METADATA_KIND,
	type FreshnessCardItemV1,
	type FreshnessCardPayloadV1,
	type Json,
	parseFreshnessCardPayloadV1
} from '@buildos/shared-types';
import { type EntityDecision, draftInChatPrompt } from './combine';
import type { FreshnessDb } from './dataPort';

/** chat_messages.message_type of the card row (see the amendment above). */
export const FRESHNESS_CARD_ROW_MESSAGE_TYPE = 'assistant_message' as const;
export const FRESHNESS_CARD_SOURCE = 'freshness_radar' as const;

/** True for the radar's injected card row (keyed on metadata, like the web). */
export function isFreshnessCardRow(row: { role?: unknown; metadata?: unknown }): boolean {
	const metadata = row.metadata as Record<string, unknown> | null | undefined;
	return (
		row.role === 'assistant' &&
		metadata?.source === FRESHNESS_CARD_SOURCE &&
		metadata?.kind === FRESHNESS_CARD_METADATA_KIND
	);
}

export function freshnessCardIdempotencyKey(scanId: string): string {
	return `freshness-scan:${scanId}:card`;
}

export type CardInputs = {
	scanId: string;
	projectId: string;
	projectName: string;
	createdAt: string;
	/**
	 * Newly surfaced roll-up concerns, already ranked (top first). Since tasker 106
	 * a concern reaches the card once, the scan it first crosses the bar.
	 */
	items: ReadonlyArray<FreshnessCardItemV1>;
	moreCount: number;
	bundle: { suggestionId: string; operationCount: number } | null;
	autoApplied: FreshnessCardPayloadV1['autoApplied'];
	inboxCleanup: FreshnessCardPayloadV1['inboxCleanup'];
	gaugeChanges: FreshnessCardPayloadV1['gaugeChanges'];
};

/** A card item straight from one scan's decision (backtest reports and tests). */
export function cardItemFromDecision(
	flagId: string,
	decision: EntityDecision
): FreshnessCardItemV1 {
	const disposition = decision.disposition === 'drafted' ? 'drafted' : 'surfaced';
	const proposal =
		disposition === 'drafted' && decision.proposal
			? {
					summary: decision.proposal.summary,
					field: decision.proposal.field,
					from: decision.proposal.from,
					to: decision.proposal.to
				}
			: null;
	return {
		flagId,
		entity: {
			kind: decision.candidate.kind,
			id: decision.candidate.id,
			title: decision.candidate.title
		},
		probability: decision.probability,
		disposition,
		proposal,
		evidenceExcerpt: decision.evidence?.excerpt ?? null,
		draftInChatPrompt:
			disposition === 'surfaced'
				? draftInChatPrompt(decision.candidate, decision.changeKind)
				: null
	};
}

function plural(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`;
}

export function cardHeadline(inputs: CardInputs): string {
	const flagged = inputs.items.length + inputs.moreCount;
	const auto = inputs.autoApplied.length;
	if (flagged && auto) {
		return `${plural(flagged, 'item', 'items')} may be out of date in ${inputs.projectName}; ${plural(auto, 'task was', 'tasks were')} updated automatically`;
	}
	if (flagged)
		return `${plural(flagged, 'item', 'items')} may be out of date in ${inputs.projectName}`;
	if (auto)
		return `${plural(auto, 'task was', 'tasks were')} updated automatically in ${inputs.projectName}`;
	if (inputs.inboxCleanup.retired.length) {
		return `${plural(inputs.inboxCleanup.retired.length, 'inbox item is', 'inbox items are')} no longer needed in ${inputs.projectName}`;
	}
	return `Progress check for ${inputs.projectName}`;
}

export function buildFreshnessCard(inputs: CardInputs): FreshnessCardPayloadV1 | null {
	const items = inputs.items.slice(0, FRESHNESS_CARD_MAX_ITEMS);
	const hasContent =
		items.length > 0 ||
		inputs.autoApplied.length > 0 ||
		inputs.inboxCleanup.retired.length > 0 ||
		inputs.gaugeChanges.length > 0;
	if (!hasContent) return null;
	const payload: FreshnessCardPayloadV1 = {
		version: 'freshness_card_v1',
		scanId: inputs.scanId,
		projectId: inputs.projectId,
		projectName: inputs.projectName,
		createdAt: inputs.createdAt,
		headline: cardHeadline(inputs),
		moreCount: inputs.moreCount + Math.max(0, inputs.items.length - items.length),
		items,
		bundle: inputs.bundle,
		autoApplied: inputs.autoApplied,
		inboxCleanup: inputs.inboxCleanup,
		gaugeChanges: inputs.gaugeChanges
	};
	// Round-trip through the shared parser: never persist a card web would reject.
	return parseFreshnessCardPayloadV1(payload);
}

const GAUGE_LABEL: Record<string, string> = {
	on_track: 'on track',
	at_risk: 'at risk',
	off_track: 'off track',
	unknown: 'unknown'
};

/** Factual plain-text body for chat history (the card renders from metadata). */
export function cardContent(card: FreshnessCardPayloadV1): string {
	const lines = [`Freshness check: ${card.headline}.`];
	for (const item of card.items) {
		const percent = Math.round(item.probability * 100);
		const change = item.proposal ? ` Suggested: ${item.proposal.summary.toLowerCase()}.` : '';
		lines.push(
			`- ${item.entity.kind} "${item.entity.title}" may be out of date (model estimate ${percent}%).${change}`
		);
	}
	if (card.moreCount)
		lines.push(`- ${plural(card.moreCount, 'more item', 'more items')} flagged.`);
	for (const applied of card.autoApplied) {
		lines.push(
			`- Updated task "${applied.entity.title}": ${applied.summary.toLowerCase()} (undo available).`
		);
	}
	for (const retired of card.inboxCleanup.retired) {
		lines.push(`- Retired inbox item "${retired.title}" (undo available).`);
	}
	if (card.inboxCleanup.possiblyStaleCount) {
		lines.push(
			`- ${plural(card.inboxCleanup.possiblyStaleCount, 'inbox item', 'inbox items')} marked possibly out of date.`
		);
	}
	for (const change of card.gaugeChanges) {
		lines.push(
			`- ${change.entity.kind} "${change.entity.title}" is now ${GAUGE_LABEL[change.to]}${change.from ? ` (was ${GAUGE_LABEL[change.from]})` : ''}.`
		);
	}
	if (card.bundle) {
		lines.push(
			`Drafted ${plural(card.bundle.operationCount, 'update', 'updates')} for approval; nothing else was changed.`
		);
	}
	return lines.join('\n');
}

/** Insert the card message once; returns the message id (existing on replay). */
export async function deliverFreshnessCard(params: {
	db: FreshnessDb;
	sessionId: string;
	userId: string;
	card: FreshnessCardPayloadV1;
}): Promise<string | null> {
	const idempotencyKey = freshnessCardIdempotencyKey(params.card.scanId);
	const inserted = await params.db
		.from('chat_messages')
		.insert({
			session_id: params.sessionId,
			user_id: params.userId,
			role: 'assistant',
			content: cardContent(params.card),
			message_type: FRESHNESS_CARD_ROW_MESSAGE_TYPE,
			metadata: {
				source: FRESHNESS_CARD_SOURCE,
				kind: FRESHNESS_CARD_METADATA_KIND,
				freshness_scan_id: params.card.scanId,
				idempotency_key: idempotencyKey,
				card: params.card
			} as unknown as Json
		})
		.select('id')
		.single();
	if (!inserted.error) return String((inserted.data as { id: string }).id);
	if (inserted.error.code !== '23505') {
		throw new Error(`freshness card insert failed: ${inserted.error.message}`);
	}
	const existing = await params.db
		.from('chat_messages')
		.select('id, metadata')
		.eq('session_id', params.sessionId)
		.eq('role', 'assistant')
		.eq('message_type', FRESHNESS_CARD_ROW_MESSAGE_TYPE)
		.order('created_at', { ascending: false })
		.limit(50);
	if (existing.error) return null;
	const match = (
		(existing.data ?? []) as Array<{ id: string; metadata: Record<string, unknown> | null }>
	).find((row) => row.metadata?.idempotency_key === idempotencyKey);
	return match?.id ?? null;
}
