// apps/worker/src/workers/freshness-radar/rollupStages.ts
//
// The pure roll-up stages between a scan's decisions and the merge (tasker
// 106), shared by the live scan (signalJob.ts) and the book replay
// (scripts/freshness-radar-rollup-replay.ts), so both build the same
// observations, section hashes and reasons.

import type { EntityDecision } from './combine';
import type { AnswerMap } from './combine';
import { type FreshnessScanContext, candidateSnapshot, entityKey } from './context';
import type { FreshnessDataPort } from './dataPort';
import { fixInChatPrompt } from './fixInChat';
import type { FreshnessPolicyV1 } from './freshnessPolicy';
import { type ConcernObservation, type ConcernRow, concernChangeKind, evidenceKey } from './rollup';
import { type ScanRequestPlan, chatBearsOn } from './scanStages';
import { segmentHashes } from './sections';

/** One observation per evaluated subject (the caller drops ones it already changed). */
export function buildConcernObservations(params: {
	context: FreshnessScanContext;
	plan: ScanRequestPlan;
	answers: AnswerMap;
	decisions: readonly EntityDecision[];
	flagIdByKey: ReadonlyMap<string, string>;
}): ConcernObservation[] {
	const { context, plan } = params;
	const decisionsById = new Map(context.decisions.map((decision) => [decision.id, decision]));
	return params.decisions.map((decision) => {
		const { candidate } = decision;
		const key = entityKey(candidate.kind, candidate.id);
		const newer = (context.entityViews.get(key)?.newer_decisions ?? [])
			.map((id) => decisionsById.get(id))
			.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
			.map((entry) => ({ text: entry.text, recorded: entry.recorded }));
		const chatBears = chatBearsOn({
			plan,
			answers: params.answers,
			kind: candidate.kind,
			index:
				candidate.kind === 'document'
					? decision.index - plan.evaluatedEntities.length
					: decision.index
		});
		const changeKind = concernChangeKind(candidate.kind, decision.changeKind);
		return {
			candidate,
			flagId: params.flagIdByKey.get(key) ?? null,
			probability: decision.probability,
			suppressed: decision.disposition === 'suppressed',
			noChangeNeeded: decision.changeKind === 'no_change_needed',
			evidenceKey: evidenceKey({
				snapshot: candidateSnapshot(candidate),
				subjectUpdatedAt: candidate.updatedAt,
				kind: candidate.kind,
				newerDecisionTexts: newer.map((entry) => entry.text),
				chatMessageIds: chatBears ? context.window.messageIds : []
			}),
			detail: {
				changeKind,
				sections: decision.sections,
				decisions: newer,
				evidenceExcerpt: decision.evidence?.excerpt ?? null,
				proposal: decision.proposal
					? {
							summary: decision.proposal.summary,
							field: decision.proposal.field,
							from: decision.proposal.from,
							to: decision.proposal.to
						}
					: null,
				fixInChatPrompt: fixInChatPrompt({
					kind: candidate.kind,
					title: candidate.title,
					changeKind,
					sections: decision.sections,
					decisions: newer
				})
			}
		};
	});
}

/**
 * Current own-text hash per anchor for every document with an open concern:
 * from the scan's segments when the document was dug, else from its body.
 */
export async function concernSectionHashes(params: {
	open: readonly ConcernRow[];
	context: FreshnessScanContext;
	port: Pick<FreshnessDataPort, 'loadDocumentBodies'>;
	policy: FreshnessPolicyV1;
}): Promise<Map<string, Map<string, string>>> {
	const ids = params.open
		.filter((concern) => concern.subject_kind === 'document')
		.map((concern) => concern.subject_id);
	const unloaded = ids.filter((id) => !params.context.documentSegments.has(id));
	const bodies = unloaded.length
		? await params.port.loadDocumentBodies(unloaded, params.policy.dig.bodyChars)
		: new Map<string, string>();
	return new Map(
		ids.map((id) => {
			const segments = params.context.documentSegments.get(id);
			return [
				id,
				segments
					? new Map(segments.map((segment) => [segment.anchor ?? '', segment.textSha256]))
					: segmentHashes(bodies.get(id) ?? null)
			] as const;
		})
	);
}

/** One line: why a surfaced concern looks out of date (code-authored). */
export function concernReason(
	concern: Pick<ConcernRow, 'subject_kind' | 'detail' | 'evidence_count'>
): string {
	const detail = concern.detail;
	const named = (detail.sections ?? []).filter((section) => section.anchor !== null);
	let reason: string;
	if (concern.subject_kind === 'document' && named.length) {
		const list = named
			.slice(0, 3)
			.map((section) => `“${section.heading.replace(/\s+/g, ' ').trim().slice(0, 80)}”`)
			.join(', ');
		const lead = named.length === 1 ? 'A section looks' : `${named.length} sections look`;
		reason = detail.decisions?.length
			? `${lead} older than decisions you recorded since: ${list}.`
			: `${lead} out of date: ${list}.`;
	} else if (detail.proposal) {
		reason = `${detail.proposal.summary}.`;
	} else if (detail.changeKind === 'cancel_or_drop') {
		reason = 'May no longer be needed.';
	} else if (detail.changeKind === 'superseded') {
		reason = 'May be replaced by newer work.';
	} else if (detail.changeKind === 'rewrite_details') {
		reason = detail.decisions?.length
			? 'Its details look older than decisions you recorded since.'
			: 'Its details no longer match what you described.';
	} else {
		reason = detail.decisions?.length
			? 'Looks older than decisions you recorded since.'
			: 'May be out of date.';
	}
	return concern.evidence_count > 1
		? `${reason} Seen in ${concern.evidence_count} separate checks.`
		: reason;
}
