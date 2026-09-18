// apps/worker/src/workers/freshness-radar/inboxCleanup.ts
//
// Stage [5b]: inbox cleanup (plan section 6). Runs before the bundle is
// inserted, so retired slots are freed first. Only individual Project Review
// suggestions auto-retire (with undo); everything else is only marked
// "possibly stale". A later scan scoring an item below the mark threshold resets
// it to fresh. The inbox writes themselves live in shared-agent-ops
// (Lane A's inbox-index helpers); this module sequences them and records the
// ledger outcome for each flag.

import type { FreshnessUndoPayload } from '@buildos/shared-types';
import type { InboxDecision } from './combine';
import type { FreshnessInboxSubject } from './context';
import type { FreshnessDb } from './dataPort';
import { evidenceExcerpt, looseGround } from './grounding';
import type { SourcedSentence } from './dates';
import { updateFlag } from './ledger';

export type InboxCleanupOps = {
	/** pending suggestion -> superseded (conditional), then inbox row -> expired. */
	retire: (params: {
		supabase: FreshnessDb;
		suggestionId: string;
		inboxItemId: string;
		flagId: string;
		reason: string;
	}) => Promise<{ ok: boolean; previousInboxStatus?: 'pending' | 'deferred' | null }>;
	/** Set inbox_items.freshness_state (+ note, flag id, checked_at). */
	mark: (params: {
		supabase: FreshnessDb;
		inboxItemId: string;
		state: 'fresh' | 'possibly_stale';
		note: string | null;
		flagId: string | null;
	}) => Promise<boolean>;
};

export type InboxCleanupResult = {
	retired: Array<{ flagId: string; title: string }>;
	marked: string[];
	reset: string[];
	failed: string[];
};

export const RETIRE_REASON = 'Your latest update made this request obsolete.';
const MARK_NOTE_PROJECT = 'Your latest update may have made this out of date.';

export function markNoteFor(
	subject: FreshnessInboxSubject,
	sentences: readonly SourcedSentence[],
	excerptChars: number
): string {
	// The user's own words only on user-audience rows; members never see chat.
	if (subject.row.audience !== 'user') return MARK_NOTE_PROJECT;
	const sentence = looseGround(subject.row.title, sentences);
	return sentence
		? `You said: "${evidenceExcerpt(sentence.text, excerptChars)}"`
		: MARK_NOTE_PROJECT;
}

export async function runInboxCleanup(params: {
	db: FreshnessDb;
	ops: InboxCleanupOps;
	subjects: readonly FreshnessInboxSubject[];
	decisions: readonly InboxDecision[];
	flagIds: readonly (string | null)[];
	sentences: readonly SourcedSentence[];
	excerptChars: number;
}): Promise<InboxCleanupResult> {
	const result: InboxCleanupResult = { retired: [], marked: [], reset: [], failed: [] };
	for (let index = 0; index < params.subjects.length; index += 1) {
		const subject = params.subjects[index]!;
		const decision = params.decisions[index];
		const flagId = params.flagIds[index] ?? null;
		if (!decision || !flagId) continue;

		if (decision.action === 'retire' && subject.suggestion) {
			const previousInboxStatus = subject.row.status === 'deferred' ? 'deferred' : 'pending';
			const retired = await params.ops
				.retire({
					supabase: params.db,
					suggestionId: subject.suggestion.id,
					inboxItemId: subject.row.id,
					flagId,
					reason: RETIRE_REASON
				})
				.catch(() => ({ ok: false as const }));
			if (!retired.ok) {
				await updateFlag(params.db, flagId, { disposition_reason: 'retire_failed' });
				result.failed.push(flagId);
				continue;
			}
			const undo: FreshnessUndoPayload = {
				kind: 'inbox_retire',
				suggestionId: subject.suggestion.id,
				inboxItemId: subject.row.id,
				previousSuggestionStatus: 'pending',
				previousInboxStatus: retired.previousInboxStatus ?? previousInboxStatus
			};
			await updateFlag(params.db, flagId, {
				disposition: 'retired',
				disposition_reason: decision.reason,
				undo_operation: undo,
				applied_at: new Date().toISOString()
			});
			result.retired.push({ flagId, title: subject.row.title });
			continue;
		}

		if (decision.action === 'mark') {
			const ok = await params.ops
				.mark({
					supabase: params.db,
					inboxItemId: subject.row.id,
					state: 'possibly_stale',
					note: markNoteFor(subject, params.sentences, params.excerptChars),
					flagId
				})
				.catch(() => false);
			if (!ok) {
				await updateFlag(params.db, flagId, { disposition_reason: 'mark_failed' });
				result.failed.push(flagId);
				continue;
			}
			await updateFlag(params.db, flagId, {
				disposition: 'marked_possibly_stale',
				disposition_reason: decision.reason
			});
			result.marked.push(flagId);
			continue;
		}

		if (decision.action === 'reset_fresh') {
			const ok = await params.ops
				.mark({
					supabase: params.db,
					inboxItemId: subject.row.id,
					state: 'fresh',
					note: null,
					flagId: null
				})
				.catch(() => false);
			if (ok) result.reset.push(flagId);
		}
	}
	return result;
}
