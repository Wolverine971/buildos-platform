// apps/worker/src/workers/freshness-radar/fixInChat.ts
//
// "Fix in chat" composer prefills (tasker 106). Written in the user's voice,
// they name the exact record, the sections that look out of date, and the
// recorded decisions that came after, so the chat can make a surgical edit
// (update_onto_document `section_edits` / `edits`) that its reviewer can check.
// The radar never writes document text itself.

import type {
	FreshnessChangeKind,
	FreshnessConcernDecision,
	FreshnessConcernSection,
	FreshnessEntityKind
} from '@buildos/shared-types';

const MAX_DECISIONS = 3;
const DECISION_CHARS = 160;
const HEADING_CHARS = 90;

function clean(value: string, max: number): string {
	const text = value
		.replace(/\*\*|__/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function quoted(value: string, max = HEADING_CHARS): string {
	return `"${clean(value, max)}"`;
}

function decisionList(decisions: readonly FreshnessConcernDecision[]): string {
	return decisions
		.slice(0, MAX_DECISIONS)
		.map(
			(decision) =>
				`${clean(decision.text, DECISION_CHARS)}${decision.recorded ? ` (${decision.recorded})` : ''}`
		)
		.join('; ');
}

export function fixInChatPrompt(params: {
	kind: FreshnessEntityKind;
	title: string;
	changeKind: FreshnessChangeKind | null;
	sections: readonly FreshnessConcernSection[];
	decisions: readonly FreshnessConcernDecision[];
}): string {
	const title = quoted(params.title, 120);
	const since = params.decisions.length
		? ` Since then I decided: ${decisionList(params.decisions)}.`
		: '';
	if (params.kind === 'document') {
		const named = params.sections.filter((section) => section.anchor !== null);
		if (named.length) {
			const list = named.map((section) => quoted(section.heading)).join(', ');
			const noun = named.length === 1 ? 'This section looks' : 'These sections look';
			return `In ${title}: ${noun} out of date: ${list}.${since || ' It no longer matches what I said recently.'} Update just ${named.length === 1 ? 'that section' : 'those sections'} to match, and leave the rest of the doc as is.`;
		}
		return `${title} looks out of date.${since || ' It no longer matches what I said recently.'} Update the parts that no longer match, and leave the rest as is.`;
	}
	if (params.changeKind === 'cancel_or_drop') return `Drop ${title}, it's no longer needed.`;
	if (params.changeKind === 'superseded') return `Update ${title}, what I described replaces it.`;
	return since
		? `Update ${title} to match what I've decided.${since}`
		: `Update ${title} to reflect what I just said.`;
}
