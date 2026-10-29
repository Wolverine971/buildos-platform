// apps/web/src/lib/server/inbox-chat-opener.ts
//
// The assistant's first message when someone opens chat from one AI Inbox cleanup item
// (2026-10-29). It reads like an assistant starting the conversation: what it noticed,
// what it would do, and one question to answer. It replaces a report of the whole cleanup
// list, which left the user to work out what was being asked of them.
//
// Written by code from the item, so it is instant and costs nothing. Every phrase comes
// from code-authored fields (verified headlines, radar reasons) or the roll-up's sanitized
// summary; nothing here interprets free text.
import type {
	ProjectCleanupAsk,
	ProjectCleanupItem,
	ProjectSuggestionReviewItem
} from '@buildos/shared-types';

const RECORD_NOUN: Record<ProjectSuggestionReviewItem['entity_type'], string> = {
	document: 'doc',
	task: 'task',
	goal: 'goal',
	milestone: 'milestone'
};

function clean(value: string | null | undefined, max = 400): string | null {
	if (typeof value !== 'string') return null;
	const text = value.replace(/\s+/g, ' ').trim();
	if (!text) return null;
	return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function withPeriod(text: string): string {
	return /[.!?…]$/.test(text) ? text : `${text}.`;
}

/** One out-of-date record from the freshness radar. */
function recordOpener(reviewItem: ProjectSuggestionReviewItem): string {
	const noun = RECORD_NOUN[reviewItem.entity_type] ?? 'record';
	const reason = clean(reviewItem.reason, 300);
	return [
		`I think the **${clean(reviewItem.title, 160) ?? 'record'}** ${noun} is out of date.`,
		reason ? `My note on it: ${withPeriod(reason)}` : null,
		'',
		"Want me to check it against what you've told me since and update only the parts that changed? If you already know what's different, tell me and I'll make the edit."
	]
		.filter((line): line is string => line !== null)
		.join('\n');
}

/** A verified change the user could also apply from the card. */
function changeOpener(item: ProjectCleanupItem): string {
	const lead = clean(item.summary, 500) ?? clean(item.title, 300) ?? 'This needs a call.';
	const whyNow = clean(item.why_now, 300);
	const changes = [
		...new Set(
			item.rows
				.map((row) => clean(row.verified_headline, 200) ?? clean(row.title, 200))
				.filter((value): value is string => Boolean(value))
		)
	];
	const cautions = [
		...new Set(item.rows.flatMap((row) => row.cautions ?? []).map((c) => clean(c, 200)))
	].filter((value): value is string => Boolean(value));
	const lines = [withPeriod(lead)];
	if (whyNow && whyNow !== lead) lines.push(withPeriod(whyNow));
	if (changes.length) {
		lines.push('', changes.length === 1 ? "Here's what I'd change:" : "Here's what I'd do:");
		for (const change of changes.slice(0, 6)) lines.push(`- ${change}`);
	}
	for (const caution of cautions.slice(0, 2)) lines.push('', `Heads up: ${withPeriod(caution)}`);
	lines.push('', 'Should I go ahead? Say yes, or tell me what to do differently.');
	return lines.join('\n');
}

/** An audit recommendation: the assistant offers to do the legwork, not assign it. */
function auditOpener(item: ProjectCleanupItem): string {
	const title = clean(item.title, 200) ?? 'a follow-up';
	const detail = clean(item.summary, 400) ?? clean(item.why_now, 300);
	return [
		`The last audit suggested: **${title.replace(/\.$/, '')}**.`,
		detail && detail !== title ? withPeriod(detail) : null,
		'',
		"I can do the legwork: I'll look through the project, draft what's missing, and only ask you what I can't find. Want me to start? Or tell me it doesn't fit this project."
	]
		.filter((line): line is string => line !== null)
		.join('\n');
}

/** A finding with nothing to apply: say what was noticed, ask what is true now. */
function findingOpener(item: ProjectCleanupItem): string {
	const title = clean(item.title, 300) ?? 'Something in this project looks off.';
	const detail = clean(item.summary, 500);
	const whyNow = clean(item.why_now, 300);
	return [
		withPeriod(title),
		detail && detail !== title ? withPeriod(detail) : null,
		whyNow && whyNow !== detail && whyNow !== title ? withPeriod(whyNow) : null,
		'',
		"Where does this stand now? Tell me and I'll update the project to match."
	]
		.filter((line): line is string => line !== null)
		.join('\n');
}

/**
 * The review pass pre-wrote a question for this item: lead with it and lay out what each answer
 * would do, so the user can answer in a word.
 */
function askOpener(ask: ProjectCleanupAsk, coveredTitles: string[]): string {
	const lines = [withPeriod(clean(ask.question, 220) ?? 'Which way should this go?')];
	const context = clean(ask.context, 320);
	if (context) lines.push(withPeriod(context));
	if (coveredTitles.length > 1) {
		lines.push('', `This settles ${coveredTitles.length} things: ${coveredTitles.join('; ')}.`);
	}
	lines.push('', "Here's what each answer would do:");
	for (const answer of ask.answers.slice(0, 3)) {
		const label = clean(answer.label, 60) ?? 'Option';
		const effect = clean(answer.effect, 180);
		lines.push(
			`- **${label}**${answer.recommended ? ' (my pick)' : ''}${effect ? `: ${withPeriod(effect)}` : ''}`
		);
	}
	lines.push('', 'Which one? Or tell me what is different and I will work from that.');
	return lines.join('\n');
}

export function buildCleanupItemOpener(params: {
	item: ProjectCleanupItem;
	/** A single out-of-date record inside a radar item, when the user picked one. */
	reviewItem?: ProjectSuggestionReviewItem | null;
	/** The pre-written question that covers this item, if the review pass wrote one. */
	ask?: ProjectCleanupAsk | null;
	/** Titles of every item the ask covers, for "This settles…". */
	askItemTitles?: string[];
}): string {
	const { item, reviewItem } = params;
	if (reviewItem) return recordOpener(reviewItem);
	if (params.ask && params.ask.answers.length >= 2) {
		return askOpener(params.ask, params.askItemTitles ?? [item.title]);
	}
	const hasChange = item.rows.some(
		(row) => Boolean(row.verified_headline) || (row.operation_count ?? 0) > 0
	);
	if (item.executable || hasChange) return changeOpener(item);
	if (item.source === 'audit') return auditOpener(item);
	if (item.review_items?.length === 1) return recordOpener(item.review_items[0]!);
	return findingOpener(item);
}

/** What the chat model is told about a pre-written question it opened with. */
export function describeAskForModel(ask: ProjectCleanupAsk): string {
	const actionNote: Record<string, string> = {
		apply: "make the covered items' verified change",
		dismiss: 'leave things as they are',
		done: 'treat it as already handled',
		note: 'update the project to match this answer',
		chat: 'work through it together'
	};
	return [
		`Pre-written question (${ask.id}), covering item ids ${ask.item_ids.join(', ')}: ${ask.question}`,
		...ask.answers.map(
			(answer) =>
				`- "${answer.label}"${answer.recommended ? ' (recommended)' : ''}: ${answer.effect ?? ''} → ${actionNote[answer.action] ?? answer.action}`
		),
		'When the answer means leaving things as they are or that it is already handled, say so in one line and tell the user the card answer button stops it coming back.'
	].join('\n');
}

/** What the chat model is told about the opener it "already sent". */
export const CLEANUP_OPENER_MODEL_NOTE =
	"You opened this conversation with the message the user sees above; it ends with an offer or a question. Read the user's reply as the answer to it. On a yes, do the work you offered with project tools: read the records first, make the change, and say in one or two lines what changed. When drafting something new, ask at most three short questions the records cannot answer, then write it. On a no or a correction, follow what they said.";
